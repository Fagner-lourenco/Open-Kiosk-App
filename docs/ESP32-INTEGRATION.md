# 🍺 Sistema Self-Pour Chop - Documentação Técnica Completa

## 📋 Integração Seeed Studio XIAO ESP32S3 Sense + Open Kiosk App

### ⚡ Versão: 2.0 - Baseado em PourMyBeer & Análise Profissional
### 📅 Data: 26/12/2025
### 🎯 Escopo: Sistema de self-pour para chop/cerveja com controle de vazão por flowmeter

---

## 🔄 Fluxo Atual do Sistema

### 1️⃣ **Usuário Finaliza Pedido**
```
Cliente seleciona:
├─ Tamanho do copo (300ml, 500ml, etc.)
├─ Quantidade de copos
└─ Forma de pagamento
```

### 2️⃣ **Pagamento Aprovado**
```typescript
// DrinkQuickCheckoutModal.tsx - linha ~270
const totalAmount = calculateTotal();
// Inicia processamento após confirmação de pagamento
```

### 3️⃣ **Registro de Venda** 
```typescript
// Salva no Firebase/Database
await salesService.recordSaleAndUpdateStock(
  [drinkCartItem],
  totalAmount,
  currentCurrency.code,
  orderNumber
);
```

### 4️⃣ **Envio de Comando para ESP32** ⚡
```typescript
// STEP 3: Dispensar bebida
updateProcessingStage("dispensing");

const releaseResult = await esp32Printer.releaseDrink({
  orderId: orderNumber,        // Ex: "DRK-2512261045123"
  sizeLabel: "Médio",          // Nome do tamanho
  mlPerUnit: 500,              // Volume em ML
  quantity: 2,                 // Número de copos
}, storeSettings);
```

### 5️⃣ **Estrutura JSON Enviada ao ESP32**
```json
{
  "action": "release_drink",
  "orderId": "DRK-2512261045123",
  "sizeLabel": "Médio",
  "mlPerUnit": 500,
  "quantity": 2,
  "timestamp": "2025-12-26T15:30:45.123Z"
}
```

---

## 🔌 Comunicação Serial (Web Serial API)

### Configuração de Conexão
```typescript
// esp32PrinterService.ts
- Porta Serial: Configurável via Admin > Settings
- Baudrate: 9600 bps
- Protocolo: JSON via UART
- Terminador: '\n' (newline)
```

### Método de Envio
```typescript
async releaseDrink(data, settings) {
  // 1. Verifica se está conectado
  if (!this.writer) {
    // Tenta conectar automaticamente
    await this.connectToComPort(settings.comPort);
  }
  
  // 2. Monta payload JSON
  const payload = {
    action: 'release_drink',
    orderId: data.orderId,
    sizeLabel: data.sizeLabel,
    mlPerUnit: data.mlPerUnit,
    quantity: data.quantity,
    timestamp: new Date().toISOString()
  };
  
  // 3. Envia via serial
  const encodedData = new TextEncoder().encode(JSON.stringify(payload) + '\n');
  await this.writer.write(encodedData);
  
  return { success: true, message: 'Drink release signal sent' };
}
```

---

## 🎯 O Que o ESP32 Precisa Fazer

### Firmware ESP32 - Fluxo Esperado

```cpp
// Pseudo-código do firmware ESP32

void setup() {
  Serial.begin(9600);
  // Inicializar bombas, válvulas, sensores...
}

void loop() {
  if (Serial.available()) {
    String jsonString = Serial.readStringUntil('\n');
    
    // Parse JSON
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, jsonString);
    
    String action = doc["action"];
    
    if (action == "release_drink") {
      String orderId = doc["orderId"];
      String sizeLabel = doc["sizeLabel"];
      int mlPerUnit = doc["mlPerUnit"];
      int quantity = doc["quantity"];
      
      // EXECUTAR DISPENSAÇÃO
      dispenseDrink(mlPerUnit, quantity);
      
      // Resposta (opcional)
      sendResponse(orderId, "success");
    }
  }
}

void dispenseDrink(int mlPerUnit, int quantity) {
  for (int i = 0; i < quantity; i++) {
    // 1. Posicionar copo (se houver sistema mecânico)
    positionCup();
    
    // 2. Calcular tempo de bomba baseado em ml
    int pumpTime = calculatePumpTime(mlPerUnit);
    
    // 3. Acionar bomba/válvula
    digitalWrite(PUMP_PIN, HIGH);
    delay(pumpTime);
    digitalWrite(PUMP_PIN, LOW);
    
    // 4. Aguardar copo ser retirado
    waitForCupRemoval();
    
    // 5. Próximo copo (se quantity > 1)
  }
}

int calculatePumpTime(int ml) {
  // Calibração: ml/segundo da bomba
  const float ML_PER_SECOND = 50.0;
  return (ml / ML_PER_SECOND) * 1000; // Retorna em ms
}
```

---

## ⚙️ Calibração e Mapeamento

### 1. **Calibração de Volume**
```cpp
// Constantes de calibração por tamanho
struct SizeConfig {
  int ml;
  int pumpTimeMs;
  int flowRate; // ml/s
};

SizeConfig sizes[] = {
  {300, 6000, 50},   // 300ml = 6s
  {500, 10000, 50},  // 500ml = 10s
  {700, 14000, 50}   // 700ml = 14s
};
```

### 2. **Sensores Recomendados**
```
├─ Sensor de Fluxo (YF-S201): Medir ml reais dispensados
├─ Sensor Ultrassônico: Detectar presença de copo
├─ Sensor Capacitivo: Confirmar retirada do copo
└─ LED/Display: Feedback visual para usuário
```

### 3. **Controle de Bomba**
```cpp
// PWM para controle preciso
analogWrite(PUMP_PIN, pumpSpeed); // 0-255

// Feedback em tempo real
float mlDispensed = readFlowSensor();
if (mlDispensed >= targetMl) {
  stopPump();
}
```

---

## 🔍 Debug e Testes

### No Console do Navegador
```javascript
// Verificar se comandos estão sendo enviados
console.log('Sending drink release command:', payload);
```

### No Serial Monitor do Arduino IDE
```
Esperando pedidos...
Recebido: {"action":"release_drink","orderId":"DRK-123","mlPerUnit":500,"quantity":2}
Dispensando: 500ml x 2 copos
Copo 1: Iniciando...
Copo 1: 500ml dispensado ✓
Aguardando retirada...
Copo 2: Iniciando...
Copo 2: 500ml dispensado ✓
Pedido DRK-123 concluído!
```

---

## 🚀 Melhorias Sugeridas

### 1. **Feedback Bidirecional**
```typescript
// ESP32 → App: Enviar status em tempo real
{
  "type": "status",
  "orderId": "DRK-123",
  "stage": "dispensing_cup_1",
  "mlDispensed": 250,
  "progress": 50
}
```

### 2. **Timeout e Retry**
```typescript
// Adicionar timeout na espera de resposta
const response = await waitForESP32Response(orderId, 30000); // 30s
if (!response) {
  // Permitir dispensação manual
  showManualDispenseOption();
}
```

### 3. **Fila de Pedidos**
```typescript
// Se múltiplos pedidos simultâneos
class DrinkQueue {
  queue = [];
  
  async add(order) {
    this.queue.push(order);
    if (!this.processing) {
      await this.processNext();
    }
  }
}
```

### 4. **Modo de Teste/Manutenção**
```typescript
// Admin pode testar dispensador
async testDispenser(ml: number) {
  await esp32Printer.releaseDrink({
    orderId: 'TEST-' + Date.now(),
    sizeLabel: 'Test',
    mlPerUnit: ml,
    quantity: 1
  });
}
```

---

## 📊 Exemplo de Pedido Completo

### Cenário: Cliente compra 2 copos de 500ml

```
┌─────────────────────────────────────┐
│ 1. Cliente seleciona:               │
│    - Produto: Pilsen               │
│    - Tamanho: 500ml (R$10,00)      │
│    - Quantidade: 2 copos           │
│    - Total: R$20,00                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2. Pagamento PIX aprovado           │
│    - QR Code escaneado             │
│    - Mercado Pago confirmou        │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3. Firebase: Salva venda            │
│    - Order #2512261045123          │
│    - Desconta 1000ml do estoque    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 4. ESP32: Recebe comando            │
│    {                                │
│      "action": "release_drink",     │
│      "mlPerUnit": 500,              │
│      "quantity": 2                  │
│    }                                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 5. ESP32: Executa dispensação       │
│    Loop 1: 500ml → Copo 1          │
│    Loop 2: 500ml → Copo 2          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 6. Tela: "Bebida pronta!"          │
│    - Posicione seu copo            │
│    - Timer para retornar ao menu   │
└─────────────────────────────────────┘
```

---

## 🛠️ Próximos Passos

### Para o Firmware ESP32:
1. ✅ Ler JSON via Serial (9600 bps)
2. ✅ Parsear campos: `mlPerUnit`, `quantity`
3. ✅ Calcular tempo de bomba baseado em ml
4. ✅ Loop de dispensação para múltiplos copos
5. 🔄 Adicionar sensores de confirmação
6. 🔄 Enviar feedback de status para o App

### Para a Aplicação:
1. ✅ Enviar comando com todos os dados
2. 🔄 Adicionar listener para respostas do ESP32
3. 🔄 Atualizar UI em tempo real (progresso)
4. 🔄 Implementar modo de teste no Admin
5. 🔄 Log de comandos enviados para debug

---

## 📝 Exemplo de Código Completo ESP32

```cpp
#include <ArduinoJson.h>

const int PUMP_PIN = 5;
const float ML_PER_SECOND = 50.0; // Calibrar!

void setup() {
  Serial.begin(9600);
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, LOW);
}

void loop() {
  if (Serial.available()) {
    String json = Serial.readStringUntil('\n');
    
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, json);
    
    if (error) {
      Serial.println("{\"error\":\"Invalid JSON\"}");
      return;
    }
    
    const char* action = doc["action"];
    
    if (strcmp(action, "release_drink") == 0) {
      const char* orderId = doc["orderId"];
      int mlPerUnit = doc["mlPerUnit"];
      int quantity = doc["quantity"];
      
      // Dispensar bebidas
      for (int i = 0; i < quantity; i++) {
        dispenseDrink(mlPerUnit, i + 1);
      }
      
      // Confirmar conclusão
      Serial.print("{\"orderId\":\"");
      Serial.print(orderId);
      Serial.println("\",\"status\":\"completed\"}");
    }
  }
}

void dispenseDrink(int ml, int cupNumber) {
  Serial.print("Dispensando copo ");
  Serial.println(cupNumber);
  
  int pumpTime = (ml / ML_PER_SECOND) * 1000;
  
  digitalWrite(PUMP_PIN, HIGH);
  delay(pumpTime);
  digitalWrite(PUMP_PIN, LOW);
  
  delay(1000); // Aguardar retirada
}
```

---

## 🎓 Resumo Técnico

| Aspecto | Detalhes |
|---------|----------|
| **Protocolo** | JSON via UART Serial |
| **Baudrate** | 9600 bps |
| **Dados Enviados** | `orderId`, `mlPerUnit`, `quantity`, `sizeLabel` |
| **Controle** | Tempo de bomba calculado por ml |
| **Múltiplos Copos** | Loop sequencial |
| **Erro Handling** | Try-catch, toast de aviso ao usuário |
| **Status** | "dispensing" → "ready_pickup" |

---

**Documentação gerada em:** 26/12/2025  
**Versão do sistema:** 1.0  
**Última atualização:** Integração com ESP32 via Web Serial API
