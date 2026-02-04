## Indexação incremental — src/hooks/* (2598 linhas total)

### useESP32AutoConnect.ts (156 linhas)
- Objetivo: Autoconexão ao ESP32 na inicialização, seguindo ordem de preferência (USB → WiFi → Bluetooth)
- Interface: `UseESP32AutoConnectOptions`, `UseESP32AutoConnectResult`
- Fluxo: Mount → retry uma vez com delay 1s → chama `esp32Service.autoConnectPreferredOrder()` → callbacks (onConnected/onFailed)
- Padrão: Ref `hasAttempted` previne autoconexão duplicada
- Robustez: Toasts de feedback, try/catch com cleanup

### useESP32Reconnect.ts (146 linhas)
- Objetivo: Reconexão automática quando conexão é perdida, com backoff exponencial
- Interface: `UseESP32ReconnectOptions`, `UseESP32ReconnectResult`
- Fluxo: Mount → listener para `setOnConnectionChange` → quando desconectar, chama `reconnectWithBackoff()` (max 5 tentativas, 1s-30s backoff)
- Padrão: Ref `wasConnected` rastreia mudanças
- Robustez: Logs, callbacks (onReconnected/onReconnectFailed), respota a `enabled` option

### usePermissions.ts (148 linhas)
- Objetivo: RBAC (Role-Based Access Control) baseado em role do usuário (admin, manager, operator, viewer)
- Interface: `UsePermissionsReturn` com métodos: `hasPermission()`, `can()`, `hasAllPermissions()`, `hasAnyPermission()`, `isRoleAtLeast()`, `isRoleAbove()`
- Integração: Usa `useAuth()` para obter user.customClaims.role
- Fallback: Role='viewer' se auth falhar; role='operator' em offline mode
- Padrão: Usa ROLE_HIERARCHY e ROLE_PERMISSIONS de @shared/types
- Robustez: Validação de role desconhecido, offline mode support

### useNetworkStatus.ts (244 linhas)
- Objetivo: Monitorar status de rede (online/offline, tipo de conexão, latência)
- Integração: Capacitor Network API + Navegador Navigator.connection (Network Information API)
- Retorna: `NetworkState` (isOnline, connectionType, effectiveType, downlink, rtt) + `SyncStatus` (isSyncing, pendingCount)
- Método: `checkConnection()` usa `fetch('/robots.txt')` com 5s timeout para validar conectividade real
- Listeners: `Network.addListener('networkStatusChange')` (Capacitor) + `online`/`offline` (Browser)
- Robustez: Fallback para navigator.onLine em Web, sincronização com syncService

### useMercadoPagoPolling.ts (407 linhas)
- Objetivo: Polling de status de pagamento Mercado Pago com exponential backoff, persistência no localStorage, idempotência
- Configuração: INITIAL_INTERVAL_MS=3s (do config), MAX_INTERVAL_MS=10s, MAX_ATTEMPTS=45 (~2min total)
- Implementação: 
  - Estado: orderId, attempts, startedAt, lastAttemptAt
  - Backoff: 3s fixo para primeiras 3 tentativas, depois cresce com fator 1.4 até 10s
  - Persistência: localStorage com check de expiração (10 min max)
  - Idempotência: Set `processedOrdersRef` (max 50 entries, rotativo LRU)
  - Network retry: max 3 retries em erro de rede, 2s delay
  - Cleanup: AbortController por tentativa, timeout por intervalo, isMounted flag
- Status detection: order.status in [processed/closed] + paymentStatus in [approved/processed] = sucesso
- Callbacks: onSuccess, onError, onStatusChange, onAttempt
- Robustez: Logs estruturados, localStorage recovery em refresh, limpeza automática

### useKioskIdle.ts (88 linhas)
- Objetivo: Rastrear inatividade do usuário (touch, mouse, keyboard), definir timeout (padrão 120s)
- Implementação: Listeners em eventos (pointermove, mousedown, click, touchstart, keydown, wheel) com passive:true
- Padrão: Ref `listenersRegisteredRef` para evitar listeners duplicados
- Controle: Função `resetIdle()` para resetar timer quando ativo de novo
- Supressão: `suppressed` option para pausar rastreamento (ex.: durante carregamento)
- Problema conhecido: eslint-disable esconde dependency array incompleto (frágil, mas ref protection cobre)

### Outros hooks breves (totaliza ~1400 linhas restantes):
- `useCheckoutFlow.ts` (113 linhas): Gerencia fluxo de checkout (inatividade, etapas, timeout warnings)
- `useCachedVideo.ts` (76 linhas): Cache de vídeos com validação de hash/size
- `useConfigImport.ts` (94 linhas): Importação de configuração JSON com validação
- `useDebounce.ts` (19 linhas): Debounce simples para values
- `useDispensers.ts` (200+ linhas): Gerencia dispensers (leitura, escrita, sync com Firebase)
- `useMercadoPagoCheckout.ts` (180+ linhas): Orquestração de checkout (Point de venda ou online)
- `useAdminPin.ts` (50+ linhas): Validação de PIN de admin

### Padrões observados nos hooks:
✓ Cleanup correto em useEffect (timers, listeners, AbortControllers)
✓ Refs para estado persistente entre renders (isMountedRef, hasAttemptedRef)
✓ Callbacks memoizados com useCallback para evitar dependências circulares
✓ try/catch com logging estruturado
⚠️ Alguns eslint-disable-next-line react-hooks/exhaustive-deps (ref protection existe, mas frágil)
⚠️ localStorage sem error boundary robusta (silent failures)
✓ Exponential backoff implementado corretamente (MercadoPago)
✓ Offline mode support (usePermissions, useNetworkStatus)

---
