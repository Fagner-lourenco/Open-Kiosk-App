# 🔍 AUDITORIA EXAUSTIVA — Open Kiosk App

**Data:** 2025-01-XX  
**Escopo:** Fluxo completo — startup → pagamento → dispensação → limpeza  
**Arquivos analisados:** 40+  
**Classificação:** HIGH = perda financeira / travar kiosk • MEDIUM = UX degradada / dados inconsistentes • LOW = melhoria / edge case improvável

---

## 1. Startup & Inicialização

### BUG-001 — `dispenseRetryCountRef` não é resetado ao reabrir modal
| Campo | Valor |
|---|---|
| **Severidade** | HIGH |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 410-453 (cleanup do `isOpen`), 598 (declaração) |
| **Descrição** | Quando `isOpen` se torna `false`, o effect de cleanup (L410-453) reseta `saleRecordedRef`, `recordedOrderRef`, estados de pagamento, etc. — mas **nunca reseta `dispenseRetryCountRef`**. Se um cliente sofre uma falha de dispensação e gasta suas 2 retentativas, o próximo cliente que abrir o modal para outro produto já terá 2/2 retentativas esgotadas. |
| **Impacto** | Próximo cliente não pode usar retry de dispense → perda financeira (pagou mas não recebeu). |
| **Correção sugerida** | Adicionar `dispenseRetryCountRef.current = 0;` no effect de cleanup em L444 (junto com `saleRecordedRef.current = false`). |

---

### BUG-002 — `isOpen` cleanup usa `currentTransactionId` do estado com closure stale
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 447-453 |
| **Descrição** | O effect de cleanup de `isOpen=false` captura `currentTransactionId` no array de dependências **e o lê dentro do corpo do efeito** (L449: `if (currentTransactionId && !isPagBank)`). Como `currentTransactionId` muda durante o fluxo de pagamento, o effect se re-registra cada vez que ele muda. Se `isOpen` mudar para `false` durante uma atualização em batched state, o valor de `currentTransactionId` pode ter sido perdido na limpeza de estado acima (L422: `setCurrentTransactionId(null)`) antes de chegar no `if` de cancelamento (L449). |
| **Impacto** | O cancelamento remoto do pagamento no Mercado Pago pode não acontecer — ordem fica em aberto no terminal/QR. |
| **Correção sugerida** | Capturar `currentTransactionId` em uma ref ou capturá-lo *antes* de chamar `setCurrentTransactionId(null)`: mover o bloco de cancelamento para antes do reset (L422). |

---

### BUG-003 — `orderNumberRef` nunca é resetado no cleanup de `isOpen`
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 410-453 |
| **Descrição** | No cleanup do `isOpen=false`, `recordedOrderRef.current` e `saleRecordedRef.current` são resetados, mas `orderNumberRef.current` não é. Se o próximo checkout reusar o component instance, `orderNumberRef.current` ainda aponta para o pedido anterior. Embora `finishPaymentFlow()` atualize-o antes de usar, em cenários de reentrada rápida pode haver ambiguidade. |
| **Impacto** | Em edge case de reentrada rápida, `enrichOrderWithCustomerData()` ou `handleRetryDispense()` poderiam operar sobre o pedido anterior. |
| **Correção sugerida** | Adicionar `orderNumberRef.current = '';` no cleanup. |

---

## 2. Gateway de Pagamento & Polling

### BUG-004 — PagBank listener não verifica `saleRecordedRef` antes de processar pagamento
| Campo | Valor |
|---|---|
| **Severidade** | HIGH |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 964-1030 (PagBank `watchPaymentStatus` callback) |
| **Descrição** | O callback do Mercado Pago (`useMercadoPagoPolling` `onSuccess`, L150) contém um guard explícito: `if (saleRecordedRef.current) return;` seguido de `saleRecordedRef.current = true;`. O callback equivalente para PagBank (L976-1030) **não tem esse guard**. Se o listener do Firestore disparar duas vezes com status `paid` (reconexão, snapshot retry, etc.), `finishPaymentFlow()` será chamado duas vezes, resultando em **venda duplicada** e **dispense duplicado**. |
| **Impacto** | Venda registrada em duplicidade, estoque descontado 2x, dispense 2x. Perda financeira direta. |
| **Correção sugerida** | Adicionar guard idêntico ao do MP no início do handler de `payment.status === 'paid'`: ```if (saleRecordedRef.current) { console.log('[DrinkPagBank] Já processado, ignorando'); cleanupPagBankListener(); return; } saleRecordedRef.current = true;``` |

---

### BUG-005 — Emergency timeout pode disparar após pagamento já aprovado
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 1063-1078 |
| **Descrição** | O timeout de emergência é configurado em `handlePaymentComplete()` (L1063-1078): "Se `processingStageRef.current === 'awaiting_payment'`, cancela pagamento". Porém, *entre* a aprovação do pagamento e a limpeza do timeout, existe uma janela onde: (1) o polling/listener entra em `onSuccess` (2) `updateProcessingStage("payment_approved")` atualiza o state, mas `processingStageRef.current` é atualizado no *próximo render* via `useEffect` (L255), (3) o timeout pode verificar `processingStageRef.current` e ainda ver `awaiting_payment`. |
| **Impacto** | Se o pagamento é aprovado 1-2ms antes do timeout de emergência, `handleCancelPayment()` pode ser chamado, cancelando uma transação já aprovada. Race condition rara mas possível. |
| **Correção sugerida** | No callback `onSuccess` do polling e no PagBank listener, limpar o emergency timeout imediatamente *antes* de chamar `finishPaymentFlow`: `if (emergencyTimeoutRef.current) { clearTimeout(emergencyTimeoutRef.current); emergencyTimeoutRef.current = null; }` (MP: já é feito indiretamente por `finishPaymentFlow`? Verificar. PagBank: definitivamente não é limpo no L976-1005). |

---

### BUG-006 — Polling do Mercado Pago: `processedOrders` pode crescer indefinidamente dentro da sessão  
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/hooks/useMercadoPagoPolling.ts` |
| **Linhas** | ~Set com max 50 |
| **Descrição** | O Set `processedOrders` aplica um limite de 50 entries, mas dentro de um kiosk que roda 24/7, se `clearPersistedState()` não limpar esse Set (e não limpa — ele apenas remove do localStorage), ordens antigas permanecem na memória. Após 50 ordens processadas, o guard de idempotência começa a remover as mais antigas via `.values().next()`, mas o shift para Map ou LRU seria mais previsível. |
| **Impacto** | Mínimo: o guard funciona com 50 items. Apenas edge case de memory leak leve em sessions longas. |
| **Correção sugerida** | Resetar `processedOrders` quando o modal fecha ou quando `clearPersistedState` é chamado. |

---

### BUG-007 — PagBank: resposta `paid` síncrona + listener redundante
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 945-970 |
| **Descrição** | Quando `createPayment()` retorna com `response.status === 'paid'` (L945), o fluxo chama `finishPaymentFlow()` diretamente. ~20 linhas depois (L964), o código configura `watchPaymentStatus()` *mesmo que o pagamento já tenha sido processado*. O `return` na L960 evita que o listener seja criado *neste caminho* — **correto**. Porém, o `orderNumberRef.current` é setado em L941, e se `finishPaymentFlow` falhar com exceção (L952-958), o `catch` persiste a falha mas **não retorna**, caindo no bloco de listener (L964+). Isso criaria um listener para um pagamento que já foi processado/falhou. |
| **Impacto** | Em caso de falha no `finishPaymentFlow` síncrono, o listener pega uma segunda notificação `paid` e tenta processar novamente. |
| **Correção sugerida** | Garantir que o `catch` em L952-958 tenha `return;` explícito ao final. |

---

## 3. Cálculo de Preços & Financeiro

### BUG-008 — Aritmética de ponto flutuante em cálculos financeiros
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 670-675, 1088-1092 |
| **Descrição** | O cálculo financeiro usa multiplicação direta de floats sem arredondamento: `subtotal = resolvedUnitPrice * quantity`, `taxAmount = subtotal * taxRate`, `totalAmount = subtotal + taxAmount`. Para preços como R$7.99 × 2 = R$15.98, o resultado pode ser `15.980000000000002` (IEEE 754). Esse valor é enviado ao gateway de pagamento. |
| **Impacto** | O gateway pode rejeitar, arredondar diferente, ou cobrar centavos extras/a menos. |
| **Correção sugerida** | Aplicar `Math.round(value * 100) / 100` após cada multiplicação, especialmente no `totalAmount` final. Padrão financeiro: trabalhar em centavos (inteiros). |

---

### BUG-009 — Taxa calculada no checkout pode divergir do valor salvo na order
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` vs `src/services/salesService.ts` |
| **Linhas** | DrinkQuickCheckoutModal L670-675 (calcula) vs salesService L156-192 (recalcula internamente?) |
| **Descrição** | Em `handlePaymentComplete()` (L1088-1092) e `finishPaymentFlow()` (L670-675), `totalAmount` é calculado como `subtotal + taxAmount`. Porém `recordSaleAndUpdateStock()` recebe `totalAmount` como parâmetro mas o registra como `.totalAmount`. Se o salesService também calcular taxa internamente (campo `taxAmount` no Firestore), pode haver divergência. Após análise: salesService salva `taxPercentage` e `taxAmount` como campos separados calculados localmente. A fonte de verdade é consistente *se* os mesmos `storeSettings.taxPercentage` são usados. |
| **Impacto** | Se `storeSettings.taxPercentage` mudar entre o início do checkout e o momento do `recordSaleAndUpdateStock`, o valor cobrado difere do registrado. |
| **Correção sugerida** | Capturar `taxPercentage` no início do checkout e passá-lo como parâmetro para `recordSaleAndUpdateStock`, em vez de ambos lerem de `storeSettings`. |

---

### BUG-010 — `evaluateDynamicPrice` snapshot não é incluído nos `items` enviados ao PagBank
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 236-243 (`buildGatewayItems`), 687 (`pricingSnapshot` adicionado ao CartItem) |
| **Descrição** | `buildGatewayItems()` (L236-243) usa `resolvedUnitPrice` (que já inclui pricing dinâmico), mas os `items` enviados ao gateway via `CreatePaymentInput` contêm `unitAmount: resolvedUnitPrice` sem indicação de que é um preço dinâmico. Para auditoria, o `CartItem` no `recordSaleAndUpdateStock` inclui `pricingSnapshot` (L687), mas os items do gateway não. |
| **Impacto** | Somente rastreabilidade: se o gateway exibir os itens, o operador não saberá que era preço dinâmico. |
| **Correção sugerida** | Baixa prioridade. Incluir `dynamicPricing: true` ou `priceRule` nos items se necessário para auditoria. |

---

## 4. Dispensação ESP32

### BUG-011 — `finishPaymentFlow` não é `useCallback` e captura stale closures
| Campo | Valor |
|---|---|
| **Severidade** | HIGH |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 667 |
| **Descrição** | `finishPaymentFlow` é declarado como `const finishPaymentFlow = async (orderNumber: string) => {...}` — uma **função regular** (não `useCallback`), recriada a cada render. Porém, ela é chamada por callbacks assíncronos que a capturam na criação (MP polling `onSuccess` L174, PagBank listener L1002). Se o componente re-renderiza entre a criação do callback e a chamada de `finishPaymentFlow`, a versão capturada pode ter closures stale de `product`, `selectedSize`, `quantity`, `resolvedUnitPrice`, `storeSettings`, ou `selectedTapId`. |
| **Impacto** | Em re-renders entre início do pagamento e aprovação, os dados usados para gravar a venda e dispensar podem estar desatualizados (ex: preço antigo, produto antigo). Particularmente grave se `kegLevelPercent` mudou via listener Firestore e gerou novo `resolvedUnitPrice`. |
| **Correção sugerida** | (1) Encapsular `finishPaymentFlow` em `useCallback` com deps corretas, ou (2) Usar refs para todas as variáveis necessárias (`productRef`, `selectedSizeRef`, `quantityRef`, `resolvedUnitPriceRef`), ou (3) Snapshot todos os dados no momento de `handlePaymentComplete()` e passá-los como parâmetros para `finishPaymentFlow()`. |

---

### BUG-012 — Keg level listener: unsubscribe pode ser null se effect re-runs rapidamente
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 268-330 (keg level effect) |
| **Descrição** | O useEffect para keg level usa async IIFE dentro do effect body. O cleanup retorna `() => { if (unsubKeg) unsubKeg(); }`. Se o effect re-executa antes da IIFE ter atribuído `unsubKeg`, o cleanup anterior não remove o listener antigo, que continua rodando com `setKegLevelPercent` do render anterior. |
| **Impacto** | Listener de keg level antigo persiste, causando atualizações para um estado desmontado. Pouco impacto prático pois React ignora `setState` após unmount, mas memory leak teórico. |
| **Correção sugerida** | Usar flag `cancelled` no useEffect: `let cancelled = false;` e verificar antes de chamar `onSnapshot`. No cleanup: `cancelled = true; unsubKeg?.();` |

---

### BUG-013 — ESP32Context: `DISPENSE_TIMEOUT_MS` (5 min) vs Point terminal (2 min)
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/context/ESP32Context.tsx` vs `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | ESP32Context ~L50 (5 min), DrinkQuickCheckoutModal L116 (paymentTimeoutSeconds: 120) |
| **Descrição** | O dispense timeout no ESP32Context é 5 minutos (300s). O payment timeout é 120s (~2 min). Há um cenário: pagamento aprovado em 119s → `finishPaymentFlow()` inicia dispense → dispense pode rodar por até 300s → total = 419s. O timeout de inatividade é extendido para 300s em L1056 (`setMaxInactivityTime(300)`), mas o *payment* emergency timeout usa 130s (`flowState.paymentTimeoutSeconds ?? 130`). Isso é geralmente OK pois o emergency timeout é desarmado/cancelado após pagamento. |
| **Impacto** | Nenhum bug direto, mas configurações inconsistentes podem confundir manutenção. |

---

## 5. Firestore & Dados

### BUG-014 — `updateOrderDispenseStatus`: transição `pending → dispensing` não listada como válida
| Campo | Valor |
|---|---|
| **Severidade** | HIGH |
| **Arquivo** | `src/services/salesService.ts` |
| **Linhas** | ~L380-420 (valid transitions) |
| **Descrição** | As transições válidas definidas são: `pending→dispensing`, `dispensing→dispensed`, `dispensing→failed_dispense`. O fluxo de `finishPaymentFlow` (DrinkQuickCheckoutModal L713) chama `updateOrderDispenseStatus(orderNumber, 'dispensing')`. Porém a order é criada com status `paid_pending_dispense` (salesService L174). Portanto a transição real é `paid_pending_dispense → dispensing`, que **não** está na lista de transições válidas `VALID_TRANSITIONS`. |
| **Impacto** | Se a transação no Firestore vir com status `paid_pending_dispense`, a atualização para `dispensing` será rejeitada pela validação, e o `.catch(e => console.warn(...))` em L715 engolirá o erro. O dispense procede sem que o status da order mude no Firestore. |
| **Correção sugerida** | Adicionar `'paid_pending_dispense'` como estado de origem válido para `dispensing` nas `VALID_TRANSITIONS`. |

---

### BUG-015 — `recordSaleAndUpdateStock` usa `runTransaction` que não sobrevive offline
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/services/salesService.ts` |
| **Linhas** | ~L100-200 |
| **Descrição** | `recordSaleAndUpdateStock()` tenta primeiro `runTransaction()` no Firestore. Se estiver offline, Firestore rejeita transações (transactions requerem round-trip ao servidor). O fallback é `recordOfflineSale()` que usa `setDoc()` (funciona offline com cache persistente) + `enqueueSync()`. Este design é correto em conceito. Porém, a detecção de offline depende do `catch` capturar o erro de transação — e Firestore pode demorar até 10s para timeout em transações quando há conectividade intermitente. |
| **Impacto** | Latência de 10s no checkout em rede instável antes do fallback offline ativar. UX ruim. |
| **Correção sugerida** | Verificar `navigator.onLine` antes de tentar `runTransaction()`. Se offline, ir direto para `recordOfflineSale()`. |

---

### BUG-016 — `syncService.processQueue`: `finally` block reseta `syncInProgress` mas pode causar reentrada
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/services/syncService.ts` |
| **Linhas** | L310-360 |
| **Descrição** | No `processQueue()`, quando há itens restantes, o código faz `setTimeout(() => { syncInProgress = false; processQueue(); }, delay)`. Mas o `finally` block (L355-358) também faz `syncInProgress = false`. Se o setTimeout ainda não disparou e o `finally` roda primeiro (que é o que acontece: `return` antes de `finally` não impede `finally`), `syncInProgress` é resetado imediatamente, permitindo outra chamada `processQueue()` concorrente pelo setInterval do background sync. |
| **Impacto** | Duas invocações concorrentes de `processQueue()` podem processar o mesmo item duas vezes. O guard de idempotência (`_lastSyncId`) mitiga duplicação no Firestore, mas gera trabalho desnecessário. |
| **Correção sugerida** | Não resetar `syncInProgress` no `finally` quando há um `setTimeout` agendado. Usar um flag: `const willContinue = remainingQueue.length > 0 && isOnline;` e no `finally`: `if (!willContinue) { syncInProgress = false; }`. |

---

## 6. Settings & Configuração

### BUG-017 — `useStoreSettings` listeners: duplicate Firestore listeners em re-mounts
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/hooks/useStoreSettings.tsx` |
| **Linhas** | L1070-1290 |
| **Descrição** | O useEffect que cria 3 listeners Firestore (store doc, kiosk config, eventStats) depende de `[isInitialized, settings?.storeId, firebaseConfigKey]`. Se `settings` mudar (o que acontece *dentro dos próprios listeners* via `setSettings`), `settings?.storeId` poderia mudar de reference. Na prática, `storeId` raramente muda, mas `firebaseConfigKey` é um JSON.stringify — se algo no firebaseConfig mudar (improvável em runtime), os listeners seriam destruídos e recriados, com uma breve janela sem escuta. |
| **Impacto** | Mínimo: os listeners são limpos no cleanup e recriados. Apenas gap momentâneo. |

---

### BUG-018 — `useStoreSettings.updateSettings()`: `syncToFirebase` não está estável
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/hooks/useStoreSettings.tsx` |
| **Linhas** | ~L1680-1730 (`updateSettings`) |
| **Descrição** | A função `updateSettings` usa `useCallback` com deps `[saveToLocalStorage, saveToIndexedDB, syncToFirebase]`. A função `syncToFirebase` (provavelmente declarada com `useCallback`) pode ter deps instáveis que causam re-criação de `updateSettings`, que por sua vez pode afetar efeitos dependentes. |
| **Impacto** | Renders desnecessários em cascata. Sem bug funcional. |

---

### BUG-019 — Listener do store document sobrescreve `attractTimeoutSeconds` com um valor normalizado
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/hooks/useStoreSettings.tsx` |
| **Linhas** | ~L1170-1210 (Listener 1 - store doc) vs ~L1540-1560 (Listener 2 - kiosk config) |
| **Descrição** | Ambos os listeners (store doc e kiosk config) atualizam `attractTimeoutSeconds`, `kioskEnabled`, `language`, etc. Se ambos disparam quase simultaneamente, o último a executar vence. Não há merge inteligente — se o kiosk config define `attractTimeoutSeconds: 60` e o store doc tem `normalizedSettings.attractTimeoutSeconds: 30` (via `normalizeStoreSettings`), o store doc listener pode sobrescrever a config do kiosk. |
| **Impacto** | Configurações específicas do kiosk podem ser periodicamente sobrescritas por valores do documento principal da loja. |
| **Correção sugerida** | Definir claramente qual listener é "dono" de cada campo. Os campos kiosk-specific (`attractTimeoutSeconds`, `esp32*`, etc.) deveriam ser ignorados pelo listener do store doc principal, ou o kiosk listener deveria ter prioridade temporal (debounce/timestamp). |

---

## 7. Fluxo de Checkout UI

### BUG-020 — Método de pagamento selecionado pode ser incompatível com o gateway
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 455-468, 1095-1100 |
| **Descrição** | O effect em L455-468 ajusta `selectedPayment` se o método atual está desabilitado em `enabledMethods`. Porém, `enabledMethods` reflete os métodos habilitados no *gateway*, não os métodos suportados pelo *provider*: Se o provider é `pagbank`, mas `enabledMethods.pix` é `true`, o usuário pode selecionar PIX. Dentro do `handlePaymentComplete()`, o check `isPagBank` (L1095) determina se usa PagBank ou MP. Porém, PagBank PIX vai via Cloud Functions enquanto MP PIX vai via QR API direta. Se o gateway é `none` mas `enabledMethods` tem defaults `true, true, true, true` (L~52 do PaymentGatewayContext), todos os métodos aparecem ativados mas nenhum provedor está configurado. |
| **Impacto** | Se `paymentGatewayConfig.provider === 'none'`, os botões de pagamento aparecem mas o processamento falha com erro genérico. |
| **Correção sugerida** | Quando `provider === 'none'`, forçar `enabledMethods` a `{cash: false, pix: false, credit: false, debit: false}` ou exibir mensagem "Gateway não configurado". |

---

### BUG-021 — `handlePaymentComplete` usa `storeSettings?.taxPercentage || 0` — `0` é falsy
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 1089 |
| **Descrição** | `(storeSettings?.taxPercentage || 0) / 100` — se `taxPercentage === 0` (explicitamente zero, sem taxa), `0 || 0` avalia para `0`, que é correto. Porém, se `taxPercentage === undefined` e a lógica deveria ser "usar 0 como default", `?? 0` seria mais semanticamente correto que `|| 0`. Com `|| 0`, um `taxPercentage = NaN` ou `taxPercentage = false` também vira 0 silenciosamente. |
| **Impacto** | Nenhum bug real com dados normais. Edge case defensivo. |
| **Correção sugerida** | Usar `(storeSettings?.taxPercentage ?? 0) / 100` para consistência semântica. |

---

## 8. Comunicação ESP32

### BUG-022 — USB OTG buffer overflow: buffer descartado silenciosamente
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/services/esp32CommunicationService.ts` |
| **Linhas** | 520-540 |
| **Descrição** | Quando `usbReceiveBuffer` excede 2048 bytes, o código tenta extrair JSONs completos e descarta o remainder se ainda for > 2048 bytes. JSONs parciais no buffer são descartados. Se o ESP32 enviar uma resposta grande (ex: status detalhado com debug info), ela pode ser silenciosamente perdida. |
| **Impacto** | Resposta de dispense ou status pode ser perdida, causando timeout no ESP32Context → `dispense_failed`. |
| **Correção sugerida** | Aumentar threshold para 8192 ou implementar backpressure/flow control. Loggar qual payload foi descartado. |

---

### BUG-023 — `promoteUSBTransport` pode causar desconexão durante dispensação ativa
| Campo | Valor |
|---|---|
| **Severidade** | HIGH |
| **Arquivo** | `src/services/esp32CommunicationService.ts` |
| **Linhas** | 708-780 |
| **Descrição** | `promoteUSBTransport()` é chamado quando um dispositivo USB é detectado (via polling ou evento `attached`). Se o kiosk está atualmente dispensando via WiFi/BLE e um cabo USB é plugado, o método desconecta o transporte atual (`disconnectCurrentTransportOnly()` L757) e tenta conectar via USB. Se a conexão USB falhar, o transporte anterior (WiFi/BLE) já foi desconectado e a dispensação em andamento perde comunicação. |
| **Impacto** | Dispensação em andamento é interrompida se USB for plugado durante operação. Pagamento já feito, bebida parcialmente dispensada. |
| **Correção sugerida** | Verificar `isReleasingRef.current` (do ESP32Context) antes de promover USB. Adiar promoção se dispensação está ativa. Como `esp32CommunicationService` é desacoplado do Context, adicionar um método `isDispensing(): boolean` ou um flag. |

---

## 9. Idle & Attract Screen

### BUG-024 — `useKioskIdle`: `startTimer` closure potencialmente stale para `isIdle`
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/hooks/useKioskIdle.ts` |
| **Descrição** | Se `startTimer` é criado com `useCallback` cujo dependency array não inclui `isIdle`, a função captura o valor de `isIdle` do momento da criação. Subsequentes chamadas a `startTimer` podem operar com um `isIdle` stale. |
| **Impacto** | Timer pode ser reiniciado desnecessariamente ou não reiniciado quando deveria. UX menor. |

---

## 10. Service Worker & Offline

### BUG-025 — `cacheService`: IndexedDB `upgrade` handler pode perder dados em versionamento
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/services/cacheService.ts` |
| **Descrição** | Se a versão do banco IndexedDB for incrementada e o `onupgradeneeded` handler recriar object stores, dados locais offline (vendas pendentes, sync queue) seriam perdidos. Sem análise do handler específico, mas é um risco arquitetural. |
| **Impacto** | Vendas offline não sincronizadas podem ser perdidas em upgrades. |

---

## 11. Segurança

### BUG-026 — PagBank: dados de cartão trafegam pelo state React (exposição em DevTools)
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | L87-92 (useState para cardNumber, cardCvv, etc.) |
| **Descrição** | Os campos `cardNumber`, `cardExpMonth`, `cardExpYear`, `cardCvv` são armazenados em `useState`. Em React DevTools (acessível em debug builds ou via extensão do browser), esses valores são visíveis em texto plano. Embora o `encryptCard()` seja chamado apenas no momento do pagamento, os dados raw ficam no state até o cleanup. |
| **Impacto** | Se o kiosk tiver DevTools acessível (build de desenvolvimento, ou Capacitor WebView com debugging habilitado), os dados do cartão podem ser capturados. Risco PCI. |
| **Correção sugerida** | (1) Em produção, desabilitar WebView debugging. (2) Limpar os campos imediatamente após encriptação (`setCardNumber(''); setCardCvv('');` etc.). (3) Considere usar `useRef` em vez de `useState` para dados sensíveis (refs não aparecem no React DevTools). |

---

### BUG-027 — Access token legado pode estar no Firestore
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/types/store.ts`, `src/config/paymentGateway.ts` |
| **Linhas** | store.ts L282 (`accessToken?: string` deprecated) |
| **Descrição** | O campo `accessToken` está marcado como `@deprecated` mas ainda é lido pelo código de resolução de config (`getPaymentConfig()`). Se um documento Firestore antigo contém o access token em plaintext, ele é carregado no client-side. Tokens de produção do Mercado Pago no client são um risco de segurança. |
| **Impacto** | Exposição do access token do Mercado Pago no client-side. |
| **Correção sugerida** | Remover suporte a leitura de `accessToken` do Firestore e migrar para env vars ou server-side proxy. |

---

## 12. Dynamic Pricing

### BUG-028 — `evaluateDynamicPrice`: `happy_hour` midnight crossing com timezone errado
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `shared/utils/dynamicPricingEngine.ts` |
| **Linhas** | ~L80-130 |
| **Descrição** | A comparação de horário no `happy_hour` usa `new Date()` para obter a hora atual. Em um kiosk que roda em timezone diferente do servidor (ex: Capacitor Android com timezone do sistema != timezone da loja configurada em `storeSettings.timezone`), o `getCurrentTime` pode retornar horário local do dispositivo, não da loja. Se o kiosk está em UTC-3 (BRT) mas o Android está configurado em UTC, happy hour de 18:00-22:00 ativaria de 15:00-19:00 para o cliente. |
| **Impacto** | Happy hour ativo no horário errado — preço incorreto cobrado. |
| **Correção sugerida** | A engine pura recebe `now?: Date` como parâmetro — quem chama deve fornecer a date correta na timezone da loja. Verificar se o caller em `DrinkQuickCheckoutModal` faz essa correção (provavelmente não, pois usa `evaluateDynamicPrice()` sem parâmetro `now`). |

---

## 13. Error Recovery & Reconciliação

### BUG-029 — `dispenseRecoveryService`: reconcile pode processar orders já completadas
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/services/dispenseRecoveryService.ts` |
| **Descrição** | `reconcileOnStartup()` lê todas as entries do IndexedDB de dispenses falhados e tenta re-dispensar. Se a order já foi marcada como `completed` no Firestore (por intervenção manual ou reconciliação anterior), o re-dispense pode enviar um comando duplicado ao ESP32. A validação de transição em `updateOrderDispenseStatus` deveria rejeitar `completed → dispensing`, mas o comando ao ESP32 é enviado *antes* da atualização de status. |
| **Impacto** | Dispense duplicado após restart em edge cases. Bebida dispensada 2x. |
| **Correção sugerida** | Antes de reenviar o comando ao ESP32, verificar o status atual da order no Firestore. Se já `completed` ou `dispensed`, remover da fila de recovery. |

---

### BUG-030 — `ESP32Context.reconcileOnStartup`: lê `releaseDrink` que pode não estar pronto
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/context/ESP32Context.tsx` |
| **Descrição** | A reconciliação no startup tenta chamar `releaseDrink`, mas durante o startup o ESP32 pode não estar conectado ainda (auto-connect assíncrono). |
| **Impacto** | Reconciliation silently fails, entries permanecem na recovery queue para a próxima tentativa. Não perde dados. |

---

## 14. Multi-Tap / Concorrência

### BUG-031 — Concurrency guard global: `isReleasingRef` bloqueia TODAS as torneiras
| Campo | Valor |
|---|---|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/context/ESP32Context.tsx` |
| **Linhas** | `isReleasingRef.current` check em `releaseDrink()` |
| **Descrição** | O guard `isReleasingRef` é um booleano único para todas as torneiras. Se o ESP32 suporta dispensação simultânea em múltiplas torneiras, o guard impede que dois clientes dispensem em torneiras diferentes ao mesmo tempo. |
| **Impacto** | Em cenário multi-kiosk com um ESP32 servindo 2+ torneiras, o segundo pedido bloqueia até o primeiro terminar. Throughput reduzido. |
| **Correção sugerida** | Se o hardware suporta, trocar `isReleasingRef` por um Map<tapId, boolean> e permitir dispenses concorrentes em taps diferentes. Se o hardware é single-threaded, manter o guard global mas adicionar fila de espera. |

---

## 15. Resiliência de Rede

### BUG-032 — `handleCancelPayment` para MP não espera resposta de cancelamento
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/components/DrinkQuickCheckoutModal.tsx` |
| **Linhas** | 547-593 |
| **Descrição** | O cancelamento do MP (`paymentService.cancelPayment`) é `await`-ed, o que é correto. Porém, se o resultado for `{ canceled: false, reason: 'already_processed' }`, o pagamento já foi aprovado mas nenhuma ação é tomada para *processar* a venda. O usuário vê "Pagamento já processado" mas a venda nunca é registrada no sistema. |
| **Impacto** | Se o pagamento é aprovado no momento exato do cancelamento, a venda não é registrada. Cliente pagou, sistema não dispensa. |
| **Correção sugerida** | Na branch `already_processed`: verificar se `saleRecordedRef.current === false`, e se assim, chamar `finishPaymentFlow()` para completar o pedido. |

---

### BUG-033 — WiFi polling (500ms) cria carga excessiva durante dispensação
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/context/ESP32Context.tsx` |
| **Descrição** | Durante dispensação, o polling WiFi para status do ESP32 ocorre a cada 500ms. Em kiosks com conexão WiFi instável, isso pode causar flood de requests HTTP ao ESP32, especialmente se cada request leva > 500ms para resolver, criando pilha de requests pendentes. |
| **Impacto** | ESP32 sobrecarregado com requests, potencialmente afetando a dispensação de cerveja. |
| **Correção sugerida** | Usar polling adaptativo: se a última request demorou > 400ms, aumentar intervalo. Ou usar SSE/WebSocket se o ESP32 suportar. |

---

## 16. Outros

### BUG-034 — `Shop.tsx`: `DrinkPickupScreen` usa `timeoutSeconds={80}` hardcoded
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/pages/Shop.tsx` |
| **Linhas** | ~L396 |
| **Descrição** | O timeout da tela de retirada é hardcoded como 80 segundos, ignorando o campo `drinkPickupTimeoutSeconds` do `storeSettings` (default 90s). |
| **Impacto** | Inconsistência entre configuração e comportamento. Tela fecha 10s antes do esperado. |
| **Correção sugerida** | `timeoutSeconds={settings?.drinkPickupTimeoutSeconds ?? 90}` |

---

### BUG-035 — `useStoreSettings`: double-blank-line encoding throughout file
| Campo | Valor |
|---|---|
| **Severidade** | LOW |
| **Arquivo** | `src/hooks/useStoreSettings.tsx` |
| **Descrição** | O arquivo inteiro tem linhas duplas em branco entre cada linha de código, sugerindo conversão de line endings (`\r\n` interpretado como duas linhas). Isso dificulta manutenção e pode causar problemas com linters. As 2015 linhas do arquivo contêm aproximadamente metade de linhas reais. |
| **Impacto** | Nenhum bug funcional. Dificulta leitura e code review. |
| **Correção sugerida** | Normalizar line endings: `sed -i 's/\r$//' src/hooks/useStoreSettings.tsx` ou usar `.editorconfig`. |

---

## Resumo por Severidade

| Severidade | Quant. | IDs |
|---|---|---|
| **HIGH** | 5 | BUG-001, BUG-004, BUG-011, BUG-014, BUG-023 |
| **MEDIUM** | 12 | BUG-002, BUG-005, BUG-007, BUG-008, BUG-009, BUG-015, BUG-019, BUG-020, BUG-022, BUG-026, BUG-027, BUG-028, BUG-031 |
| **LOW** | 18 | BUG-003, BUG-006, BUG-010, BUG-012, BUG-013, BUG-016, BUG-017, BUG-018, BUG-021, BUG-024, BUG-025, BUG-029, BUG-030, BUG-032, BUG-033, BUG-034, BUG-035 |

## Top 5 para Correção Imediata

1. **BUG-004** (HIGH) — PagBank listener sem guard contra venda duplicada  
2. **BUG-001** (HIGH) — `dispenseRetryCountRef` não resetado entre clientes  
3. **BUG-014** (HIGH) — Transição `paid_pending_dispense → dispensing` não listada como válida  
4. **BUG-023** (HIGH) — USB promotion desconecta durante dispensação ativa  
5. **BUG-011** (HIGH) — `finishPaymentFlow` captura closures stale  

---

*Relatório gerado por análise estática de 40+ arquivos-fonte. Recomenda-se validação com testes de integração para confirmar os cenários de race condition.*
