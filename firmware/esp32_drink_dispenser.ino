/*
 * ESP32 Drink Dispenser Controller
 * 
 * Este firmware controla um dispensador de bebidas via comandos JSON pela Serial.
 * Compatível com o Open-Kiosk-App.
 * 
 * Hardware:
 * - ESP32 DevKit
 * - Bomba de água 12V (ou válvula solenoide)
 * - Relé ou MOSFET para controle da bomba
 * - (Opcional) Sensor de fluxo YF-S201
 * - (Opcional) Sensor ultrassônico para detectar copo
 * 
 * Conexões:
 * - GPIO 5: Controle da bomba (via relé/MOSFET)
 * - GPIO 18: Sensor de fluxo (interrupt)
 * - GPIO 19: LED indicador
 * 
 * Baudrate: 9600
 * 
 * Autor: Open Kiosk Project
 * Data: 26/12/2025
 */

#include <ArduinoJson.h>

// ========== CONFIGURAÇÕES ==========
const int PUMP_PIN = 5;           // Pino do relé/MOSFET da bomba
const int LED_PIN = 19;           // LED indicador
const int FLOW_SENSOR_PIN = 18;   // Sensor de fluxo (opcional)

// Calibração da bomba (AJUSTAR CONFORME SEU HARDWARE!)
const float ML_PER_SECOND = 50.0; // ml/s que sua bomba dispensa
const float FLOW_CALIBRATION = 7.5; // Pulsos por litro do sensor YF-S201

// Controle de fluxo
volatile int flowPulseCount = 0;
float flowRate = 0.0;
float totalDispensed = 0.0;

// ========== SETUP ==========
void setup() {
  Serial.begin(9600);
  
  // Configurar pinos
  pinMode(PUMP_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  
  // Estado inicial
  digitalWrite(PUMP_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
  
  // Interrupção para sensor de fluxo (se disponível)
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowPulseCounter, FALLING);
  
  Serial.println("{\"status\":\"ready\",\"message\":\"ESP32 Drink Dispenser Ready\"}");
}

// ========== LOOP PRINCIPAL ==========
void loop() {
  // Verificar comandos pela Serial
  if (Serial.available()) {
    String jsonString = Serial.readStringUntil('\n');
    processCommand(jsonString);
  }
  
  // LED de heartbeat (pisca a cada 2s)
  static unsigned long lastBlink = 0;
  if (millis() - lastBlink > 2000) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    lastBlink = millis();
  }
}

// ========== PROCESSAR COMANDO JSON ==========
void processCommand(String jsonString) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, jsonString);
  
  if (error) {
    sendError("JSON_PARSE_ERROR", "Invalid JSON format");
    return;
  }
  
  const char* action = doc["action"];
  
  if (strcmp(action, "release_drink") == 0) {
    handleReleaseDrink(doc);
  }
  else if (strcmp(action, "ping") == 0) {
    sendPong();
  }
  else if (strcmp(action, "calibrate") == 0) {
    handleCalibration(doc);
  }
  else {
    sendError("UNKNOWN_ACTION", "Action not recognized");
  }
}

// ========== HANDLER: DISPENSAR BEBIDA ==========
void handleReleaseDrink(JsonDocument& doc) {
  const char* orderId = doc["orderId"];
  int mlPerUnit = doc["mlPerUnit"];
  int quantity = doc["quantity"];
  const char* sizeLabel = doc["sizeLabel"] | "Unknown";
  
  // Validar dados
  if (!orderId || mlPerUnit <= 0 || quantity <= 0) {
    sendError("INVALID_PARAMS", "Missing or invalid parameters");
    return;
  }
  
  // Confirmar recebimento
  sendStatus(orderId, "received", "Command received, starting dispense");
  
  // Loop para cada copo
  for (int i = 0; i < quantity; i++) {
    int cupNumber = i + 1;
    
    sendStatus(orderId, "dispensing", String("Dispensing cup ") + cupNumber + " of " + quantity);
    
    // Dispensar volume
    bool success = dispenseDrink(mlPerUnit, cupNumber);
    
    if (success) {
      sendStatus(orderId, "cup_complete", String("Cup ") + cupNumber + " done (" + mlPerUnit + "ml)");
      
      // Aguardar retirada do copo (exceto no último)
      if (i < quantity - 1) {
        sendStatus(orderId, "waiting_removal", "Please remove cup to continue");
        delay(3000); // Aguarda 3 segundos
      }
    } else {
      sendError("DISPENSE_FAILED", String("Failed to dispense cup ") + cupNumber);
      return;
    }
  }
  
  // Finalizar
  sendStatus(orderId, "completed", String("All ") + quantity + " cups dispensed successfully");
}

// ========== DISPENSAR BEBIDA (NÚCLEO) ==========
bool dispenseDrink(int targetMl, int cupNumber) {
  // Ligar LED indicador
  digitalWrite(LED_PIN, HIGH);
  
  // Resetar contador de fluxo
  flowPulseCount = 0;
  totalDispensed = 0.0;
  
  // Calcular tempo estimado
  int estimatedTime = (targetMl / ML_PER_SECOND) * 1000;
  
  // Ligar bomba
  digitalWrite(PUMP_PIN, HIGH);
  unsigned long startTime = millis();
  
  // Método 1: Controle por TEMPO (se não tiver sensor de fluxo)
  #ifdef USE_TIME_CONTROL
    delay(estimatedTime);
    digitalWrite(PUMP_PIN, LOW);
    totalDispensed = targetMl; // Assume que dispensou corretamente
  #else
  
  // Método 2: Controle por SENSOR DE FLUXO (mais preciso)
  while (totalDispensed < targetMl && (millis() - startTime) < estimatedTime + 5000) {
    // Calcular ml dispensado baseado nos pulsos
    totalDispensed = (flowPulseCount / FLOW_CALIBRATION) * 1000.0;
    
    // Atualizar a cada 100ms
    if (millis() % 100 == 0) {
      float progress = (totalDispensed / targetMl) * 100.0;
      Serial.print("{\"type\":\"progress\",\"cup\":");
      Serial.print(cupNumber);
      Serial.print(",\"ml\":");
      Serial.print(totalDispensed, 1);
      Serial.print(",\"target\":");
      Serial.print(targetMl);
      Serial.print(",\"percent\":");
      Serial.print(progress, 0);
      Serial.println("}");
    }
    
    delay(10);
  }
  
  // Desligar bomba
  digitalWrite(PUMP_PIN, LOW);
  #endif
  
  // Desligar LED
  digitalWrite(LED_PIN, LOW);
  
  // Verificar se dispensou quantidade correta (tolerância de 5%)
  float tolerance = targetMl * 0.05;
  bool success = (totalDispensed >= targetMl - tolerance);
  
  return success;
}

// ========== HANDLER: CALIBRAÇÃO ==========
void handleCalibration(JsonDocument& doc) {
  int durationMs = doc["duration"] | 5000;
  
  sendStatus("CAL", "calibrating", "Starting calibration");
  
  flowPulseCount = 0;
  digitalWrite(PUMP_PIN, HIGH);
  delay(durationMs);
  digitalWrite(PUMP_PIN, LOW);
  
  float liters = flowPulseCount / FLOW_CALIBRATION;
  float mlDispensed = liters * 1000.0;
  float mlPerSecond = mlDispensed / (durationMs / 1000.0);
  
  Serial.print("{\"calibration\":{\"pulses\":");
  Serial.print(flowPulseCount);
  Serial.print(",\"ml\":");
  Serial.print(mlDispensed, 2);
  Serial.print(",\"mlPerSecond\":");
  Serial.print(mlPerSecond, 2);
  Serial.println("}}");
}

// ========== HANDLER: PING/PONG ==========
void sendPong() {
  Serial.println("{\"type\":\"pong\",\"timestamp\":" + String(millis()) + "}");
}

// ========== UTILITÁRIOS ==========
void flowPulseCounter() {
  flowPulseCount++;
}

void sendStatus(const char* orderId, const char* stage, String message) {
  Serial.print("{\"type\":\"status\",\"orderId\":\"");
  Serial.print(orderId);
  Serial.print("\",\"stage\":\"");
  Serial.print(stage);
  Serial.print("\",\"message\":\"");
  Serial.print(message);
  Serial.println("\"}");
}

void sendError(const char* errorCode, String message) {
  Serial.print("{\"type\":\"error\",\"code\":\"");
  Serial.print(errorCode);
  Serial.print("\",\"message\":\"");
  Serial.print(message);
  Serial.println("\"}");
}

// ========== COMANDOS DE TESTE VIA SERIAL MONITOR ==========
/*
Testes manuais via Serial Monitor (9600 bps):

1. Ping:
{"action":"ping"}

2. Dispensar 300ml x1:
{"action":"release_drink","orderId":"TEST-001","mlPerUnit":300,"quantity":1,"sizeLabel":"Pequeno"}

3. Dispensar 500ml x2:
{"action":"release_drink","orderId":"TEST-002","mlPerUnit":500,"quantity":2,"sizeLabel":"Médio"}

4. Calibração (5 segundos):
{"action":"calibrate","duration":5000}
*/
