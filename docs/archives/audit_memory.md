## Indexação incremental — src/components/ESP32DispenserPanel.tsx

- Arquivo: src/components/ESP32DispenserPanel.tsx
- Objetivo: Componente React principal de controle do dispenser, integrando contexto ESP32, comandos, logs, heartbeat, autoconexão, reconexão, multi-tap e UI de status.

Símbolos principais:
- `ESP32DispenserPanel` (componente principal)
- Usa hooks: `useESP32`, `useESP32AutoConnect`, `useESP32Reconnect`, `useStoreSettings`, `useToast`, `useTapSelection`
- Integra serviços: `esp32Service`, `esp32Serial`
- Utiliza tipos: `ESP32Device`, `ConnectionStatus`, `ESP32LogEntry`

Fluxo de execução:
- Inicializa autoconexão e reconexão automática via hooks customizados.
- Registra listeners para respostas do ESP32 (via contexto), atualizando estados de busy, ação corrente, progresso de dispensação e exibindo toasts.
- Mantém logs persistentes e auto-scroll.
- Permite seleção de protocolo (USB, WiFi, BLE) e multi-tap.

Concorrência e robustez:
- Listeners são limpos corretamente em unmount.
- Heartbeat e polling são centralizados no contexto, evitando duplicidade.
- UI reflete estados de conexão, busy, erro e progresso em tempo real.

Recomendações:
- O componente segue boas práticas de desacoplamento, delegando parsing e lógica de estado ao contexto e serviços.
- A lógica de feedback ao usuário é robusta, com toasts e logs detalhados.

---
## Indexação incremental — src/context/ESP32Context.tsx

- Arquivo: src/context/ESP32Context.tsx
- Objetivo: Contexto React global para gerenciar estado, conexão, comandos e eventos do ESP32, integrando todos os protocolos (USB, BLE, WiFi) e multi-tap.

Símbolos principais:
- `ESP32Context` (React Context)
- `ESP32Provider` (Provider principal, implementa heartbeat, reconexão, listeners, logs, polling WiFi)
- `useESP32` (hook para acesso ao contexto)
- Tipos: `ESP32State`, `ESP32DispensingProgress`, `ESP32Settings`, `TapStatus`, `TapConfig`, `ESP32LogEntry`, `ESP32ContextValue`

Handlers e integração:
- Registra listeners para eventos de conexão (`esp32Service.setOnConnectionChange`), dados BLE/USB (`setOnBleDataReceived`, `setOnUsbDataReceived`), mensagens e linhas raw do serviço serial (`esp32Serial.onMessage`, `onRawLine`), e mudanças de conexão serial (`onConnectionChange`).
- Integra com `hardwareStatusService` para persistência remota de status e heartbeat.
- Implementa heartbeat local (ping periódico) e remoto (via hardwareStatusService).
- Implementa polling de status via WiFi durante dispensação (GET /status a cada 500ms).
- Mantém logs persistentes de comunicação e eventos.

Fluxo de execução:
- Ao conectar, inicia heartbeat e listeners; ao desconectar, para heartbeat e listeners.
- Comandos de alto nível (releaseDrink, testValve, stopDispensing, saveCalibration, refreshTaps) são roteados para o serviço unificado, que detecta o protocolo ativo.
- Respostas do ESP32 são processadas por tipo, atualizando estado de dispensação, taps, settings e logs.

Concorrência e robustez:
- Heartbeat é limpo e reiniciado corretamente a cada mudança de conexão.
- Listeners são removidos no cleanup do useEffect.
- Reconexão automática USB é tentada no carregamento se `autoReconnect` estiver ativo.

Recomendações:
- O contexto centraliza corretamente a lógica de estado e eventos do ESP32, reduzindo duplicidade e facilitando manutenção.
- O polling WiFi pode ser otimizado para evitar sobrecarga em redes instáveis.

---
# Auditoria Técnica do Sistema Dispenser

**Data de início:** 2026-01-22

## Arquitetura Geral

**Sistema Multi-Camadas (IoT Dispenser Distribuído):**

1. **Firmware ESP32-S3** (firmware/firmware.ino v4.0.6 — 2361 linhas):
   - Multi-tap: 2 torneiras independentes (GPIO 5+6 para tap0, GPIO 4+7 para tap1)
   - ISRs: flowPulseCounter0/1 (FALLING edge) → contadores globais simples (isr_pulseCount0/1, isr_lastPulseTime0/1)
   - Sincronização: syncPulseCounters() no loop (noInterrupts/interrupts)
   - Watchdog: 10 segundos (esp_task_wdt)
   - Máquina de estados não-bloqueante (v4.0.6): IDLE → DISPENSING → LED_SUCCESS → WAIT_NEXT_CUP → COMPLETE_BLINK → DONE
   - NVS (Preferences): Calibração persistente por tap
   - Protocolos simultâneos: WiFi AP (192.168.4.1), HTTP REST, BLE (UUID 4fafc201-1fb5-459e-8fcc-c5c9c331914b), USB Serial

2. **Contexto React** (src/context/ESP32Context.tsx — 984 linhas):
   - Centraliza estado, conexão, comandos, heartbeat, reconexão, listeners, logs, multi-tap
   - Heartbeat: 15s (ajustável) + WiFi polling 500ms durante dispensação
   - Multi-tap: selectedTapId, getTapStatus(), refreshTaps(), releaseDrink(..., tapId)

3. **Serviços de Comunicação**:
   - esp32CommunicationService.ts (1801 linhas): Interface unificada com auto-detecção de protocolo (BLE, WiFi, USB)
   - esp32SerialService.ts (623 linhas): Web Serial API wrapper com auto-reconexão

4. **Frontend** (React/Capacitor/TypeScript):
   - ESP32DispenserPanel.tsx: Painel de controle com autoconexão, reconexão, multi-tap, logs em tempo real

## Fluxo de Execução

**Dispensação (tap específico):**
1. Usuário clica em tap (frontend)
2. ESP32DispenserPanel chama esp32Service.releaseDrink(volume, tapId)
3. esp32CommunicationService detecta protocolo ativo (BLE/WiFi/USB)
4. Envia JSON: `{action: "release_drink", volume: 30, tap: 0}` ou similar
5. Firmware recebe em processCommandAndGetResult(), valida tapId, inicia máquina de estados
6. ISRs contam pulsos (flowPulseCounter0/1) durante abertura de válvula
7. Firmware envia progresso/resultado via BLE/WiFi/Serial: `{type: "progress", percent: 50, ...}`
8. ESP32Context.handleESP32Response() processa, atualiza UI
9. ESP32DispenserPanel mostra progresso em toast/log

**Conexão (reconexão automática):**
1. Inicialização: useESP32AutoConnect() tenta conectar (prioridade: BLE → WiFi → USB)
2. Falha de conexão: useESP32Reconnect() inicia retry (backoff exponencial)
3. ESP32Context heartbeat: ping a cada 15-60s, conta falhas, para após threshold
4. hardwareStatusService sincroniza com Firestore (status remoto)

## Protocolo de Comunicação

**HTTP REST (WiFi — 192.168.4.1):**
- GET /status: Status do ESP32 + taps (JSON com topicStatus, taps[], etc.)
- POST /command: Enviar comando `{action: ..., ...}` (JSON)
- GET /ping: Teste de conectividade
- GET /taps: Status detalhado de todas as torneiras
- GET /discover: Auto-descoberta do ESP32

**BLE (UUID 4fafc201-1fb5-459e-8fcc-c5c9c331914b)**:
- CHARACTERISTIC: beb5483e-36e1-4688-b7f5-ea07361b26a8 (WRITE + NOTIFY)
- PIN: 123456 (segurança BLE)
- Envio: String JSON + `\n`
- Resposta: JSON completo ou fragmentado em `[RESULT] {...}` por linha

**USB Serial (Web Serial API)**:
- Baudrate: 115200
- Envio: String JSON + `\n`
- Resposta: Linhas JSON ou debug

**Comandos Suportados (Firmware):**
- `ping`: Teste (sem payload)
- `status`: Status geral + taps
- `release_drink` (volume, tap): Dispensa até volume mL, tap=0/1
- `stop` / `stop_tap` (tap): Para dispensação em tap específico
- `test_valve` / `test_valve_tap` (tap): Abre válvula por 5s
- `test_flow` / `test_flow_tap` (tap): Testa contagem de pulsos
- `calibrate` / `calibrate_tap` (volume, tap): Define pulses_per_ml para tap
- `get_taps`: Retorna array de TapStatus
- `get_settings`: Retorna configurações atuais
- `beep` (duration, frequency): Toca buzzer
- `save_calibration` (tap): Persiste calibração em NVS
- `diagnose_gpio`: Testa GPIOs (retorna status de botões, LEDs, etc.)

**Multi-tap:** Todos os comandos suportam `tap` (0 ou 1). Se omitido, tap=0 (retrocompatibilidade).

## Estados do Sistema

**Dispensação (máquina de estados não-bloqueante, por tap):**
- IDLE: Aguardando comando
- DISPENSING: Válvula aberta, contando pulsos
- LED_SUCCESS: LED piscando sucesso (2-3s)
- WAIT_NEXT_CUP: Aguardando próxima xícara (30s timeout)
- COMPLETE_BLINK: Piscando LED de conclusão
- DONE: Retornando a IDLE

**Timeout de dispensação:**
- 120 segundos por sessão
- 10 segundos de inatividade (sem pulsos) após iniciar → aborta

**Conexão:**
- CONNECTED: Dispositivo ativo (BLE/WiFi/USB)
- DISCONNECTED: Nenhum protocolo ativo
- CONNECTING: Tentativa de conexão
- RECONNECTING: Retry após falha

## Tasks, ISRs e Concorrência

**ISRs (IRAM_ATTR — tempo real crítico):**
- `flowPulseCounter0()`: GPIO 6 FALLING → isr_pulseCount0++, isr_lastPulseTime0 = millis()
- `flowPulseCounter1()`: GPIO 7 FALLING → isr_pulseCount1++, isr_lastPulseTime1 = millis()
- Operações: incremento + timestamp (< 1 microsegundo)
- Variáveis globais simples (sem portENTER_CRITICAL_ISR — v4.0.1 fix para evitar deadlock)

**Sincronização (fora ISR):**
- `syncPulseCounters()`: Copia isr_pulseCount0/1 → tapState[0/1].pulseCount (protegido por noInterrupts/interrupts)
- `resetPulseCounter(tapId)`: Reseta isr_pulseCount[tapId] (protegido por noInterrupts/interrupts)

**Watchdog (FreeRTOS):**
- `esp_task_wdt_reset()`: Chamado no loop principal a cada iteração (~5-10ms)
- Timeout: 10 segundos → reboot automático se watchdog não resetar

**Concorrência:**
- HTTP server: Não bloqueante (handleClient em loop)
- Bluetooth: Notificações (BLE.notify) enviam respostas de forma síncrona
- Serial: Processamento por linha (split '\n'), buffer com proteção contra overflow
- Máquina de estados: Não bloqueante — LED delay() é apenas para piscadas visuais, não congela processamento

**Potencial race condition (identificada):**
- Se múltiplas conexões (BLE + WiFi + Serial) receberem comandos simultâneos, ambos podem processar em paralelo sem mutex → possível estado inconsistente (ex.: duas tap0 liberadas ao mesmo tempo)
- Mitigation: Firmware processa comandos em sequência no loop; app frontend evita cliques duplos com estado `isDispensingActive`

## Frontend Web

## Mobile Android

## Backend (se existir)

## Grafo de Dependências

## Bugs Confirmados

### Bug #1 — JSON Parser sem escape strings (CRÍTICO)

**Arquivo:** src/services/esp32CommunicationService.ts
**Função:** `extractCompleteJsons(buffer: string): string[]`
**Linhas:** 127-160 (aproximadamente)

**Descrição:**
Função que extrai múltiplos JSONs completos de um buffer não-estruturado (acumula de múltiplas leituras BLE/USB). Usa contador de profundidade simples (incrementa para `{`, decrementa para `}`), sem considerar literais de string ou caracteres escapados.

**Prova no código:**
```typescript
// Pseudo-código da função original:
const extractCompleteJsons = (buffer: string) => {
  const result = [];
  let depth = 0;
  let start = -1;
  
  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];
    
    if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        result.push(buffer.substring(start, i + 1));
        start = -1;
      }
    }
  }
  
  return result;
};
```

**Problema específico:**
Se o firmware enviar:
```json
{"type":"error","message":"Valve { malfunction }"}
```

O parser contará:
- `{` no início → depth = 1
- `{` em "malfunction" → depth = 2 (ERRO!)
- `}` em "malfunction" → depth = 1 (ERRO!)
- `}` final → depth = 0 (fecha prematuramente)

**Cenário de falha:**
1. Firmware reporta erro com caracteres especiais: `{error: "Motor {tap0} não responde"}`
2. Buffer acumula: `{"progress": 50}\n{"type": "error", "message": "Motor {tap0} failed"}\n...`
3. `extractCompleteJsons()` encontra primeiro `}` de "Motor { failed }" e marca como fim prematuro
4. JSON fica corrompido, `JSON.parse()` falha
5. Resposta não é processada, usuário vê timeout/erro de conexão

**Impacto real:**
- Perda de mensagens críticas (status, erro, confirmação de dispensação)
- Timeouts em conversas BLE/USB
- Comportamento não-determinístico (depende do conteúdo da mensagem)
- Afeta especialmente diagnósticos e tratamento de erro

**Correção recomendada:**
Implementar parser com estado de string:
```typescript
const extractCompleteJsons = (buffer: string): string[] => {
  const result = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
    }
    
    if (!inString) {
      if (char === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          result.push(buffer.substring(start, i + 1));
          start = -1;
        }
      }
    }
  }
  
  return result;
};
```

---

### Bug #2 — Conversão dupla de JSON no campo 'action' (INEFICIÊNCIA)

**Arquivo:** firmware/firmware.ino
**Função:** `processCommandAndGetResult(const String& actionJson)`
**Linhas:** ~450 (aproximadamente)

**Descrição:**
Código defensivo que detecta JSON "duplamente encapsulado" (quando `action` é uma string contendo JSON) e re-parseia recursivamente. Cria overhead desnecessário em casos normais.

**Prova no código:**
```cpp
DynamicJsonDocument doc(1024);
DeserializationError error = deserializeJson(doc, actionJson);

if (!error) {
  const char* action = doc["action"];
  
  // Detecta JSON duplo — re-parse recursivamente
  if (action != nullptr && action[0] == '{') {
    DynamicJsonDocument innerDoc(1024);
    DeserializationError innerError = deserializeJson(innerDoc, action);
    
    if (!innerError) {
      return processCommandAndGetResult(String(action));  // Recursão
    }
  }
}
```

**Cenário:**
Se cliente enviar: `{"action": "{\"action\": \"ping\"}"}`
- Parsing 1: Extrai action = `"{\"action\": \"ping\"}"`
- Detecta `{` no início
- Parsing 2: Re-parseia action como JSON
- Chamada recursiva: `processCommandAndGetResult("{\"action\": \"ping\"}")`
- Parsing 3: Efetivo (mas já feito 2 vezes antes)

**Impacto real:**
- Mínimo em operação normal (clientes não enviam JSON duplo)
- Latência adicional se cliente malformado enviar JSON duplo
- Consumo extra de memória (alocações AdressableJsonDocument duplas)
- Recursão descontrolada possível (ex.: `{\"action\": \"{\\\"action\\\": ...}\"}`

**Status:**
Não é crítico, mas é ineficiência defensiva. Recomenda-se documentar por que existe (proteção contra cliente malformado) ou remover se confiança é absoluta.

---

### Bug #3 — Possível incompatibilidade de import dinâmico do plugin USB

**Arquivo:** src/services/esp32CommunicationService.ts
**Função:** `loadUsbSerialPlugin()`
**Linhas:** ~250 (aproximadamente)

**Descrição:**
Carregamento dinâmico do plugin USB sem fallback para export padrão. Se plugin exportar como `default`, o código falhará silenciosamente.

**Prova no código:**
```typescript
const loadUsbSerialPlugin = async () => {
  try {
    const module = await import('capacitor-usb-serial-plugin');
    UsbSerial = module.UsbSerial;
    
    if (!UsbSerial) {
      console.warn('UsbSerial not found in module');
      return false;
    }
  } catch (error) {
    console.warn('USB Serial plugin not available:', error);
    return false;
  }
};
```

**Problema:**
Se plugin usa `export default class UsbSerial {}`, então `module.UsbSerial` será `undefined` e `module.default` conterá a classe.

**Cenário:**
- App Android tenta conectar via USB nativo
- `loadUsbSerialPlugin()` silenciosamente falha (retorna `false`)
- `autoConnectUSBNative()` nunca consegue usar plugin
- Fallback para Web Serial (que também pode falhar)
- Usuário vê "USB not available"

**Status:**
Não confirmado como bug crítico (depende de como plugin é empacotado), mas é uma fragilidade. Recomenda-se adicionar fallback.

---

## Bugs Investigados e Descartados

### Investigação #1 — ISRs perdem pulsos se uma demorar (DESCARTADA)


## Bugs Investigados e Descartados

### Investigação #1 — ISRs perdem pulsos se uma demorar (DESCARTADA)

**Suspeita inicial:**
As ISRs `flowPulseCounter0/1` não usam `portENTER_CRITICAL_ISR`. Pode haver race condition onde pulsosimultâneos em ambas as torneiras são perdidos se uma ISR demorar.

**Análise realizada:**
```cpp
void IRAM_ATTR flowPulseCounter0() {
  isr_pulseCount0++;                    // Operação atômica em ESP32
  isr_lastPulseTime0 = millis();        // Timestamp
}

void IRAM_ATTR flowPulseCounter1() {
  isr_pulseCount1++;                    // Operação atômica em ESP32
  isr_lastPulseTime1 = millis();        // Timestamp
}
```

**Achados:**
- ISRs extremamente rápidas (< 1 microsegundo)
- Sem operações bloqueantes
- Incremento inteiro é atômico nativamente em ESP32 (arquitetura 32-bit)
- `millis()` é função re-entrante

**Conclusão:**
Não é bug confirmado. ISRs estão seguras nesta implementação simples. A ausência de `portENTER_CRITICAL_ISR` é intencional (v4.0.1) para evitar deadlock (conforme comentários no código).

**Recomendação:**
Se operações mais complexas forem adicionadas às ISRs no futuro, adicionar mutex explícito (ex. `xSemaphoreGiveFromISR`) e usar incremento atômico `atomic_increment(&isr_pulseCount0)`.

---

### Investigação #2 — Regex gulosa em `handleLine()` do ESP32SerialService

**Suspeita inicial:**
Regex `\[RESULT\]\s*(\{.*\})` é gulosa e pode capturar múltiplas JSONs em uma linha.

**Análise realizada:**
```typescript
if (line.includes('[RESULT] ')) {
  const match = line.match(/\[RESULT\]\s*(\{.*\})/);
  if (match && match[1]) {
    jsonString = match[1];
  }
}
```

**Achados:**
- `handleLine()` opera sobre linhas individuais (buffer split por `\n`)
- Mesmo que regex seja gulosa, está limitada ao final da linha
- Não há evidência de falha sem exemplo concreto

**Conclusão:**
Não classificado como bug confirmado (não há fluxo de execução que provoque falha objetiva). Registrado como investigação descartada.

**Recomendação:**
Para robustez futura, usar regex não-gulosa: `\[RESULT\]\s*(\{[^}]*\})`e adicionar testes unitários.

---

### Investigação #3 — Possível incompatibilidade de export do plugin USB (DESCARTADA, MAS PENDENTE)

**Suspeita inicial:**
`const module = await import('capacitor-usb-serial-plugin'); UsbSerial = module.UsbSerial;` — se plugin exportar como `default`, falha silenciosa.

**Status:**
Não confirmado como bug (depende do empacotamento do plugin). Mas é uma fragilidade identificada. Recomenda-se adicionar fallback em runtime.

**Teste recomendado:**
```typescript
const loadUsbSerialPlugin = async () => {
  try {
    const module = await import('capacitor-usb-serial-plugin');
    UsbSerial = module.UsbSerial || module.default;
    
    if (!UsbSerial) {
      console.error('UsbSerial export not found. Expected module.UsbSerial or module.default');
      return false;
    }
  } catch (error) {
    console.warn('USB Serial plugin not available:', error);
    return false;
  }
};
```

---

### Investigação #4 — Possível deadlock de heartbeat vs contexto (DESCARTADA)

**Suspeita inicial:**
Heartbeat em `useEffect` chama `esp32Service.ping()` simultaneamente com reconexão. Possível contention?

**Análise realizada:**
- Heartbeat: setInterval(() => esp32Service.ping(), heartbeatInterval)
- Reconexão: useESP32Reconnect() com retry backoff
- Ambos usam `sendCommand()` (não bloqueante)
- Listeners são callbacks assíncronos

**Achados:**
- Não há mutex ou estado compartilhado entre heartbeat e reconexão
- HTTP/BLE/Serial são todos não-bloqueantes
- Possível que múltiplos `ping()` sejam enfileirados, mas isso é esperado

**Conclusão:**
Não é deadlock confirmado. A arquitetura é event-driven e não-bloqueante. Múltiplos comandos enfileirados são tratados sequencialmente.

**Status:** Descartado.

---

### Investigação #5 — Memory leak em processedOrdersRef do hook useMercadoPagoPolling

**Suspeita inicial:**
Hook `useMercadoPagoPolling` mantém Set `processedOrdersRef` para idempotência. Set cresce indefinidamente?

**Análise realizada:**
```typescript
const processedOrdersRef = useRef<Set<string>>(new Set());
// ...
if (processedOrdersRef.current.size >= MAX_PROCESSED_ORDERS) {
  const entries = Array.from(processedOrdersRef.current);
  entries.slice(0, 10).forEach(id => processedOrdersRef.current.delete(id));
}
processedOrdersRef.current.add(orderId);
```

**Achados:**
- MAX_PROCESSED_ORDERS = 50 (limite de entries no Set)
- Quando Set atinge 50, remove primeiras 10 (mais antigas)
- Limpeza automática evita memory leak
- Ref não é limpo ao desmontar componente (não crítico, mas não ideal)

**Conclusão:**
Não é bug confirmado, mas é frágil. Se lógica de limpeza falhar, Set cresce. Melhor seria usar WeakSet ou Map com TTL.

**Status:** Investigação descartada (implementação defensiva suficiente).

---

### Investigação #6 — useKioskIdle pode registrar listeners duplicados

**Suspeita inicial:**
Hook `useKioskIdle` usa ref `listenersRegisteredRef` para evitar duplicatas, mas effect está com `// eslint-disable-next-line react-hooks/exhaustive-deps`.

**Análise realizada:**
```typescript
const listenersRegisteredRef = useRef(false);

// ...
if (listenersRegisteredRef.current) {
  events.forEach((evt) => window.removeEventListener(evt, onAnyInteraction));
}

events.forEach((evt) => window.addEventListener(evt, onAnyInteraction, { passive: true }));
listenersRegisteredRef.current = true;

useEffect(() => {
  // ...
}, [suppressed, timeoutSeconds]);  // Falta dependency de onAnyInteraction!
// eslint-disable-next-line react-hooks/exhaustive-deps
```

**Achados:**
- Função `onAnyInteraction` é redefinida a cada render
- Se effect re-run (por qualquer motivo), nova função é registrada
- Ref detecta duplicação e remove listeners antigos antes de registrar novos
- Proteção existe (ref check), mas é frágil

**Conclusão:**
Não é bug crítico (proteção ref existe), mas eslint-disable esconde problema estrutural. Recomenda-se memoizar `onAnyInteraction` ou adicionar `[suppressed, timeoutSeconds, onAnyInteraction]` ao dependency array.

**Status:** Investigação descartada (proteção ref cobre o risco).

---

## Código Morto e APIs Depreciadas


---

## Indexação incremental — src/services/esp32SerialService.ts

- Arquivo: src/services/esp32SerialService.ts
- Objetivo: Serviço de Web Serial que gerencia conexão, leitura contínua, parsing de linhas e envio de comandos JSON ao ESP32.

Símbolos principais:
- `class ESP32SerialService` — implementa conexão Web Serial e parsing.
- `export const esp32Serial` — singleton exportado como padrão.
- Tipos: `ESP32Response`, `ESP32Command`, `ESP32MessageCallback`, `ESP32RawCallback`, `ESP32ConnectionCallback`.
- Métodos relevantes: `connect()`, `disconnect()`, `tryAutoReconnect()`, `getAuthorizedPorts()`, `startReading()`, `processBuffer()`, `handleLine()`, `sendCommand()`, `sendRaw()`, `onMessage()`, `onRawLine()`, `onConnectionChange()`.

Comportamento de parsing notável:
- A leitura acumula bytes em `readBuffer` e divide por `\n` para processar linhas completas.
- `handleLine()` extrai JSON quando há prefixo `[RESULT] { ... }` ou quando a linha começa com `{` e termina com `}`; então `JSON.parse` é tentado.

Investigação: robustez do parser de linha e expressão regular `[RESULT]`

Suspeita inicial:
- A regex usada para extrair o JSON com prefixo `[RESULT]` é `\[RESULT\]\s*(\{.*\})` — o uso de `.*` é guloso e, em presença de múltiplos blocos ou caracteres especiais, pode capturar conteúdo inesperado.

Análise realizada:
- `handleLine()` opera sobre linhas já separadas por `\n` (buffer processado por `processBuffer`), logo a regex atua apenas dentro de uma linha individual.
- Como `processBuffer` chama `trim()` antes de `handleLine`, não há espaços exteriores que afetem a detecção de `{...}` ao usar startsWith/endsWith.

Prova no código:
```ts
if (line.includes('[RESULT] ')) {
	const match = line.match(/\[RESULT\]\s*(\{.*\})/);
	if (match && match[1]) {
		jsonString = match[1];
	}
}

if (jsonString.startsWith('{') && jsonString.endsWith('}')) {
	try {
		const json = JSON.parse(jsonString) as ESP32Response;
		// ...
	} catch (error) {
		// Não é JSON válido, ignorar
	}
}
```

Conclusão:
- Não há evidência objetiva de bug imediato na lógica de `handleLine()` dado que opera por linha; a regex gulosa não é ideal, mas não constitui bug confirmado sem exemplo de linha que provoque falha.
- Classificação: Investigação concluída e descartada como bug (registrado como investigação).

Recomendação breve:
- Tornar a regex menos gulosa (por exemplo usar `\{[\s\S]*\}` ou parser incremental) e adicionar testes unitários que simulem logs contendo `[RESULT]` com JSON intercalado a outros dados.

---


Registro incremental: auditoria recursiva iniciada. Este arquivo conterá evidências, trechos de código referenciados e recomendações sem alterar qualquer outro arquivo do repositório.

## Indexação incremental — src/services/esp32CommunicationService.ts

- Arquivo: src/services/esp32CommunicationService.ts
- Objetivo: Serviço unificado de comunicação com o ESP32 via BLE, WiFi (HTTP), Web Serial (navegador) e USB OTG nativo (Android plugin).

Símbolos principais (lista parcial):
- `class ESP32CommunicationService` — implementação principal.
- `export const esp32Service` — singleton exportado como padrão.
- Métodos utilitários: `extractCompleteJsons(buffer)`.
- BLE: `initBluetooth()`, `autoConnectBluetoothByName()`, `scanBluetoothDevices()`, `connectBluetooth()`, `sendBluetoothCommand()`.
- USB (Web Serial): `scanUSBDevices()`, `connectUSB()`, `sendUSBCommand()`, `readUSBData()`.
- USB OTG nativo (plugin): `autoConnectUSBNative()`, `connectUSBNative()`, `listUSBNativeDevices()`, `sendUSBNativeCommand()`.
- WiFi (HTTP): `scanWifiDevices()`, `checkESP32AtIp()`, `connectWifi()`, `sendWifiCommand()`.
- Interface unificada: `getConnectionStatus()`, `syncExternalUSBConnection()`, `scanAllDevices()`, `connect()`, `sendCommand()`, `disconnect()`.
- Comandos alto-nível: `dispenseDrink()`, `ping()`, `saveCalibration()`, `getSettings()`, `getESP32Status()`, `calibratePump()`, `beep()`.

Protocolos e formatos detectados:
- BLE: serviço UUID `4fafc201-1fb5-459e-8fcc-c5c9c331914b`, characteristic `beb5483e-36e1-4688-b7f5-ea07361b26a8`. Mensagens enviadas como linhas terminadas em `\n` e/ou JSONs completos.
- USB (Web Serial) / USB OTG: comunicação serial em texto (terminada em `\n`), plugin `capacitor-usb-serial-plugin` usado para Android nativo.
- WiFi: endpoints HTTP como `/status` e `/command` com payload JSON { action: string, ... }.

Bugs Confirmados (critério estrito aplicado)

### Bug #1 — `extractCompleteJsons` não trata strings/escapes em JSON

Arquivo: src/services/esp32CommunicationService.ts
Função: `private extractCompleteJsons(buffer: string)`

Descrição:
Esta função usa um contador simples de chaves para delimitar objetos JSON (incrementa em `{` e decrementa em `}`). Não existe lógica para detectar literais de string ou caracteres escapados, portanto chaves dentro de strings (ex.: "text { example }") irão alterar o contador e corromper a extração.

Prova no código:
Trecho relevante:
```ts
if (char === '{') {
	if (depth === 0) {
		start = i;
	}
	depth++;
} else if (char === '}') {
	depth--;
	if (depth === 0 && start !== -1) {
		const jsonStr = buffer.substring(start, i + 1);
		try {
			JSON.parse(jsonStr);
			jsons.push(jsonStr);
			lastEnd = i + 1;
		} catch {
			console.warn('[BLE] Bloco JSON inválido ignorado:', jsonStr.substring(0, 30));
		}
		start = -1;
	}
}
```

Fluxo de execução que permite ocorrência:
- Mensagens recebidas via BLE/USB são acumuladas em buffers (`bleReceiveBuffer`, `usbReceiveBuffer`) e a função `extractCompleteJsons` é usada para tentar extrair JSONs completos quando o buffer fica grande (veja `connectBluetooth` e handler USB OTG). Se o firmware enviar strings contendo `{` ou `}` (comum em textos, mensagens ou valores), a contagem será incorreta.

Impacto real:
- JSONs válidos podem ser divididos, ignorados ou considerados inválidos, levando à perda de comandos/respostas fundamentais (ex.: status, confirmação de dispensação) e possivelmente causar timeouts/erros na aplicação.

Correção recomendada:
- Implementar um parser robusto que reconheça literais de string e escapes (tracking de estado: inString, escapeNext, stringQuoteChar). Alternativamente, usar um parser de streaming JSON (por ex. incremental JSON tokenizer) que trate corretamente strings e escapes.

Bugs Investigados e Descartados / Observações pendentes

### Investigação #1 — Possível incompatibilidade de export do plugin USB

Suspeita inicial:
- O `loadUsbSerialPlugin` faz `const module = await import('capacitor-usb-serial-plugin'); UsbSerial = module.UsbSerial;` — se o pacote exportar como `default`, `module.UsbSerial` pode ser `undefined`.

Análise realizada:
- Código de carregamento dinâmico:
```ts
const module = await import('capacitor-usb-serial-plugin');
UsbSerial = module.UsbSerial;
```

Prova no código:
- Não há verificação adicional para `module.default` nem tentativa de fallback (`module.default || module.UsbSerial`).

Conclusão:
- Não classificado como bug confirmado (a forma de export do plugin depende do pacote instalado). Recomenda-se verificar em runtime (console do app Android) qual é a forma de export e, se necessário, ajustar para `UsbSerial = module.default || module.UsbSerial`.

Observações de segurança e concorrência
- Heartbeat usa `ping()` e conta falhas, parando após threshold — comportamento documentado e esperado.
- Handlers de leitura BLE/USB processam por linhas (`split('\n')`) e mantêm parte incompleta no buffer; há proteção contra crescimento excessivo (truncagem ou extração), o que é positivo.

Recomendações imediatas (industrial):
- Corrigir `extractCompleteJsons` para tratar strings/escapes ou substituir por parser robusto.
- Ao usar dynamic import do plugin USB, adicionar fallback para `module.default` e logs claros para detectar export shape.
- Adicionar testes end-to-end simulando mensagens com `{}` dentro de strings para validar parser.

---
