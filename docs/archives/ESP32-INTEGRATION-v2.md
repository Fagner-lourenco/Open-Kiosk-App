````markdown
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
// esp32PrinterService.ts / esp32SerialService.ts
- Porta Serial: Configurável via Admin > Settings
- Baudrate: 115200 bps (padrão Open Kiosk)
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

## 🛒 LISTA DE COMPRAS - KIT COMPLETO SELF-POUR

### 📊 Comparação de Kits Recomendados

#### 🟢 **KIT BÁSICO** - R$ 184,00 (Budget)
Ideal para: MVP, testes, prototipagem

| Componente | Modelo | Qtd | Preço (R$) | Link |
|------------|--------|-----|-----------|------|
| **Eletrônica** | | | | |
| Microcontrolador | XIAO ESP32S3 Sense | 1 | — | Já possui |
| Solenóide Válvula (DC) | 12V DC Plástico | 1 | 35-45 | Mercado Livre |
| Flowmeter | FS300A 1-60L/min | 1 | 25-35 | AliExpress |
| Módulo Relé | 2 canais 5V | 1 | 15-20 | AliExpress |
| Level Shifter | 4CH Bidirecional 5V/3.3V | 1 | 20-25 | AliExpress |
| Fonte 12V | Fonte ATX + Converter 12V 2A | 1 | 30-40 | Mercado Livre |
| **Conexões** | | | | |
| Conector Barbed | Kit Conectores Nylon 4x6mm | 1 | 10-15 | Mercado Livre |
| Tubo Silicone | 6x4mm (5 metros) | 1 | 15-25 | Mercado Livre |
| Fiação 20AWG | 100 metros 5 cores | 1 | 20-30 | Mercado Livre |
| **TOTAL** | | | **R$ 184** | |

#### 🟡 **KIT RECOMENDADO** - R$ 314,00 ⭐ (Melhor custo-benefício)
Ideal para: Sistema funcional, médio volume, precisão aceitável

| Componente | Modelo | Qtd | Preço (R$) | Link |
|------------|--------|-----|-----------|------|
| **Eletrônica** | | | | |
| Microcontrolador | XIAO ESP32S3 Sense | 1 | — | Já possui |
| **Solenóide Válvula** | **SOLENOIDE 12V DC INOX** | 1 | **80-120** | **Mercado Livre** |
| | Especificações: 12V DC, corpo inoxidável, 15-30ms resposta | | | |
| **Flowmeter** | **YF-S401 0.5-8L/min** | 1 | **35-55** | **AliExpress** |
| | Precisão ±3%, ideal 300-2000ml, 480 pulsos/litro, rosca 1/2" | | | |
| MOSFET N-CH | IRLZ44N ou similar | 2 | 15-20 | AliExpress |
| Level Shifter | 4CH Bidirecional 5V/3.3V | 1 | 20-25 | AliExpress |
| Fonte 12V | Fonte 12V 2A com proteção | 1 | 50-80 | Mercado Livre |
| Condensadores | Kit 100uF/25V + 10uF/50V | 1 | 10-15 | Mercado Livre |
| Resistores | Kit 1/4W básico (10 valores) | 1 | 8-12 | Mercado Livre |
| **Conexões** | | | | |
| Conector Barbed | Kit Conectores Inox 4x6mm | 1 | 20-30 | Mercado Livre |
| Tubo Silicone | 6x4mm + 1/2" Food Grade (10m) | 1 | 35-50 | Mercado Livre |
| Fiação 18AWG | 100 metros 8 cores | 1 | 25-35 | Mercado Livre |
| Protoboard | 400 pinos + jumpers | 1 | 15-20 | Mercado Livre |
| **TOTAL** | | | **R$ 314** | |

#### 🔴 **KIT PROFISSIONAL** - R$ 1.185,00 (Production-Ready)
Ideal para: Implementação comercial, máxima precisão, durabilidade

| Componente | Modelo | Qtd | Preço (R$) | Link |
|------------|--------|-----|-----------|------|
| **Eletrônica** | | | | |
| Microcontrolador | XIAO ESP32S3 Sense | 1 | — | Já possui |
| **Solenóide Válvula** | **SIRAI Z530A 24V AC** | 1 | **350-450** | **Fornecedor Inox SP** |
| | Profissional cervejaria, latão cromado, 20-40ms resposta | | | |
| **Flowmeter** | **DIGMESA FH401 ±0.5%** | 1 | **250-350** | **Fornecedor Industrial RJ** |
| | Precisão profissional ±0.5%, faixa 0.5-8L/min, certificado ISO | | | |
| Controlador Relé | 4CH Relé 10A 24V (DIN) | 1 | 180-220 | Mercado Livre |
| Fonte 24V | Fonte industrial 24V 3A | 1 | 150-200 | Mercado Livre |
| Level Shifter | 4CH Bidirecional profissional | 1 | 35-50 | AliExpress |
| **FOB Detector** | **Sensor Nível (Gás Carb.)** | 1 | **150-200** | **Fornecedor Gás** |
| Condensadores | Capacitores profissionais (10) | 1 | 40-60 | Mercado Livre |
| Resistores | Resistores precisão 1% (kit) | 1 | 25-35 | Mercado Livre |
| **Conexões** | | | | |
| Conector Barbed | Kit Conectores Inox AISI316 | 1 | 50-80 | Mercado Livre |
| Tubo Silicone | Tubo Food Grade Premium (20m) | 1 | 80-120 | Mercado Livre |
| Fiação | Fiação blindada + proteção (50m) | 1 | 60-100 | Mercado Livre |
| Protoboard Profissional | PCB 10x15cm + suporte | 1 | 40-60 | Mercado Livre |
| Suporte Inox | Suporte moldura protoboard | 1 | 30-50 | Mercado Livre |
| **TOTAL** | | | **R$ 1.185** | |

---

### 🌍 ONDE COMPRAR NO BRASIL

| Componente | Lojas Recomendadas | Entrega | Observação |
|----------|-------|---------|-----------|
| **XIAO ESP32S3** | Mercado Livre (Seeed oficial), AliExpress direto da Seeed | 5-10d / 40-60d | Stock limitado, preço R$ 280-320 |
| **Solenoide 12V** | Mercado Livre (lojas MR), Fornecedores MR/Hidráulica | 5-7d / Local | Buscar "solenoide válvula 12v inox" |
| **YF-S401** | AliExpress, Amazon.com.br | 30-45d / 15-30d | Buscar "YF-S401 flowmeter", preço premium na Amazon |
| **Fonte 12V** | Mercado Livre, Lojas eletrônica (Baudot) | 3-5d / Local | Buscar "fonte 12v 2a industrial" |
| **Level Shifter** | AliExpress, Mercado Livre | 30-45d / 5-7d | Kit 4CH bidirecional, premium +50% no ML |
| **Conexões/Tubo** | Hidráulicas locais, Mercado Livre | Local / 5-7d | Mais rápido em hidráulicas |
| **SIRAI Z530A** | Fornecedores São Paulo, AliExpress Industrial | Local / 60-90d | Contatar direto em SP |

---

### 📱 CÓDIGO PARA CALIBRAÇÃO (YF-S401)

Antes de usar em produção, calibre o sensor com volume medido:

```cpp
#define FLOWMETER_PIN 3
#define CALIBRATION_VOLUME_ML 500

volatile int pulseCount = 0;
float PULSES_PER_ML = 2.4;

void IRAM_ATTR countPulse() {
  pulseCount++;
}

void calibrateFlowmeter() {
  Serial.println("\n=== CALIBRAÇÃO FLOWMETER ===");
  Serial.println("Prepare recipiente de 500ml");
  
  pulseCount = 0;
  digitalWrite(PUMP_PIN, HIGH);
  delay(CALIBRATION_VOLUME_ML * 1000 / 10);
  digitalWrite(PUMP_PIN, LOW);
  
  PULSES_PER_ML = (float)pulseCount / CALIBRATION_VOLUME_ML;
  Serial.print("PULSES_PER_ML: ");
  Serial.println(PULSES_PER_ML, 2);
}
```

---

### 🔧 DIAGRAMA CONEXÃO (KIT RECOMENDADO)

```
Alimentação 12V DC:
  Fonte → (+12V) para MOSFET Drain
  Fonte → (GND) comum a todos

MOSFET IRLZ44N:
  Gate ← D5 (ESP32) via level shifter
  Drain → +12V
  Source → Solenoide/Bomba

Level Shifter (5V ↔ 3.3V):
  D5 (ESP32) → CH1 (3.3V) → CH1 (5V) → MOSFET Gate
  D7 (ESP32) → CH2 (3.3V) → CH2 (5V) → Flowmeter Pulso
  GND ESP32 → GND do shifter
  +3.3V ESP32 → Vcc_lo
  +5V externa → Vcc_hi

Flowmeter YF-S401:
  Vermelho → +5V (após level shifter)
  Preto → GND
  Amarelo → D7 (ESP32) após level shifter
```

---

### ⚙️ FLUXO OPERACIONAL

```
1. Cliente confirma pagamento
2. App envia JSON ao ESP32: {"mlPerUnit":500, "quantity":2}
3. ESP32 faz loop para cada copo:
   - Zera pulseCount
   - GPIO D5 = HIGH (abre válvula)
   - Aguarda pulsos até 500ml
   - GPIO D5 = LOW (fecha válvula)
   - Aguarda 1s para retirada
4. JSON resposta: {"status":"complete"}
5. App exibe mensagem de sucesso
```

---

### ✅ CHECKLIST PRÉ-MONTAGEM

- [ ] Componentes chegaram
- [ ] Fonte 12V testada (multímetro: +12V)
- [ ] XIAO ESP32S3 conectado (LED azul)
- [ ] Firmware carregado
- [ ] Level shifter testado
- [ ] YF-S401 limpo
- [ ] Solenoide 12V testado (deve fazer click)
- [ ] Tubo sem vazamentos
- [ ] Conexões bem apertadas
- [ ] Protoboard organizado

---

### 🚀 PRÓXIMAS ETAPAS

1. **Semana 1:** Comprar kit recomendado (R$ 314)
2. **Semana 2:** Testar cada componente isolado
3. **Semana 3:** Montar na protoboard + firmware
4. **Semana 4:** Calibrar YF-S401 (500ml medido)
5. **Semana 5:** Testar via ESP32TestPanel
6. **Semana 6:** Integrar com cooler/barril
7. **Semana 7:** Testes finais com cliente

---

**Documentação gerada em:** 26/12/2025  
**Versão do sistema:** 2.0 - Com lista de compras e diagramas  
**Última atualização:** Integração completa com shopping list

````
