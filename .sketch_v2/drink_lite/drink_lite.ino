/*
 * ESP32-S3 Drink Dispenser - VERSÃO LITE (sem BLE)
 * Apenas Serial USB - para teste
 */

#include <ArduinoJson.h>

// Pinos
const int VALVE_PIN = 5;
const int FLOW_SENSOR_PIN = 6;
const int LED_PIN = 21;

// Calibração
const float PULSOS_POR_LITRO = 450.0;
const float ML_POR_PULSO = 1000.0 / PULSOS_POR_LITRO;
const float ML_POR_SEGUNDO = 50.0;

// Variáveis
volatile unsigned long pulseCount = 0;
float totalMlDispensed = 0;
bool isDispensing = false;
String currentOrderId = "";
int currentCup = 0;
int totalCups = 0;
int targetMl = 0;
unsigned long dispensingStartTime = 0;
unsigned long lastStatusUpdate = 0;
unsigned long lastHeartbeat = 0;

// Protótipos
void processCommand(String jsonString);
void openValve();
void closeValve();
void processDispensing();

// ISR do sensor de fluxo
void IRAM_ATTR flowPulseCounter() {
  pulseCount++;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // LED primeiro
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  delay(200);
  
  Serial.println();
  Serial.println("=====================================");
  Serial.println("ESP32-S3 Drink Dispenser LITE v1.0");
  Serial.println("(Apenas Serial USB - sem BLE)");
  Serial.println("=====================================");
  
  // Válvula
  pinMode(VALVE_PIN, OUTPUT);
  digitalWrite(VALVE_PIN, LOW);
  Serial.println("[OK] Valvula GPIO " + String(VALVE_PIN));
  
  // Sensor de fluxo
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowPulseCounter, FALLING);
  Serial.println("[OK] Sensor GPIO " + String(FLOW_SENSOR_PIN));
  
  // Piscar LED 5x = pronto
  for (int i = 0; i < 5; i++) {
    digitalWrite(LED_PIN, LOW);
    delay(100);
    digitalWrite(LED_PIN, HIGH);
    delay(100);
  }
  digitalWrite(LED_PIN, LOW);
  
  Serial.println();
  Serial.println("[PRONTO] Envie comandos JSON:");
  Serial.println("  {\"action\":\"ping\"}");
  Serial.println("  {\"action\":\"test_valve\",\"duration\":1000}");
  Serial.println("  {\"action\":\"release_drink\",\"orderId\":\"T1\",\"mlPerUnit\":50,\"quantity\":1}");
  Serial.println();
}

void loop() {
  // Comandos Serial
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      Serial.println("[CMD] " + cmd);
      processCommand(cmd);
    }
  }
  
  // Dispensação
  if (isDispensing) {
    processDispensing();
  }
  
  // Heartbeat LED (pisca a cada 2s quando idle)
  if (!isDispensing && millis() - lastHeartbeat > 2000) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    lastHeartbeat = millis();
  }
  
  delay(10);
}

void processCommand(String jsonString) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, jsonString);
  
  if (error) {
    Serial.println("{\"type\":\"error\",\"message\":\"JSON invalido\"}");
    return;
  }
  
  const char* action = doc["action"];
  if (!action) {
    Serial.println("{\"type\":\"error\",\"message\":\"action obrigatorio\"}");
    return;
  }
  
  // PING
  if (strcmp(action, "ping") == 0) {
    Serial.println("{\"type\":\"pong\",\"status\":\"ready\",\"uptime\":" + String(millis()) + "}");
  }
  // STATUS
  else if (strcmp(action, "status") == 0) {
    Serial.println("{\"type\":\"status\",\"dispensing\":" + String(isDispensing ? "true" : "false") + "}");
  }
  // TEST VALVE
  else if (strcmp(action, "test_valve") == 0) {
    int duration = doc["duration"] | 1000;
    Serial.println("[TEST] Abrindo valvula por " + String(duration) + "ms");
    digitalWrite(LED_PIN, HIGH);
    openValve();
    delay(duration);
    closeValve();
    digitalWrite(LED_PIN, LOW);
    Serial.println("{\"type\":\"success\",\"message\":\"Teste concluido\"}");
  }
  // RELEASE DRINK
  else if (strcmp(action, "release_drink") == 0) {
    if (isDispensing) {
      Serial.println("{\"type\":\"error\",\"message\":\"Ocupado\"}");
      return;
    }
    
    currentOrderId = doc["orderId"] | "ORDER";
    targetMl = doc["mlPerUnit"] | 100;
    totalCups = doc["quantity"] | 1;
    currentCup = 1;
    totalMlDispensed = 0;
    pulseCount = 0;
    
    Serial.println("[DISPENSE] Pedido: " + currentOrderId);
    Serial.println("[DISPENSE] " + String(targetMl) + "ml x " + String(totalCups) + " copo(s)");
    
    isDispensing = true;
    dispensingStartTime = millis();
    lastStatusUpdate = millis();
    openValve();
    
    Serial.println("{\"type\":\"status\",\"stage\":\"dispensing\",\"orderId\":\"" + currentOrderId + "\"}");
  }
  // STOP
  else if (strcmp(action, "stop") == 0) {
    if (isDispensing) {
      closeValve();
      isDispensing = false;
      Serial.println("{\"type\":\"success\",\"message\":\"Parado\"}");
    }
  }
  else {
    Serial.println("{\"type\":\"error\",\"message\":\"Acao desconhecida\"}");
  }
}

void openValve() {
  digitalWrite(VALVE_PIN, HIGH);
  digitalWrite(LED_PIN, HIGH);
  Serial.println("[VALVE] ABERTA");
}

void closeValve() {
  digitalWrite(VALVE_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
  Serial.println("[VALVE] FECHADA");
}

void processDispensing() {
  float mlFromSensor = pulseCount * ML_POR_PULSO;
  unsigned long elapsedMs = millis() - dispensingStartTime;
  float mlFromTime = (elapsedMs / 1000.0) * ML_POR_SEGUNDO;
  
  totalMlDispensed = (mlFromSensor > 0) ? mlFromSensor : mlFromTime;
  int progress = (targetMl > 0) ? (int)((totalMlDispensed / targetMl) * 100) : 0;
  if (progress > 100) progress = 100;
  
  // LED piscando
  digitalWrite(LED_PIN, (millis() % 500 < 250) ? HIGH : LOW);
  
  // Progresso a cada 500ms
  if (millis() - lastStatusUpdate > 500) {
    Serial.println("{\"type\":\"progress\",\"cup\":" + String(currentCup) + 
                   ",\"ml\":" + String((int)totalMlDispensed) + 
                   ",\"target\":" + String(targetMl) + 
                   ",\"percent\":" + String(progress) + "}");
    lastStatusUpdate = millis();
  }
  
  // Copo concluído
  if (totalMlDispensed >= targetMl) {
    closeValve();
    digitalWrite(LED_PIN, HIGH);
    delay(500);
    digitalWrite(LED_PIN, LOW);
    
    Serial.println("{\"type\":\"cup_complete\",\"cup\":" + String(currentCup) + "}");
    
    if (currentCup < totalCups) {
      currentCup++;
      pulseCount = 0;
      totalMlDispensed = 0;
      dispensingStartTime = millis();
      delay(1000);
      openValve();
    } else {
      isDispensing = false;
      Serial.println("{\"type\":\"completed\",\"orderId\":\"" + currentOrderId + "\"}");
      // 3 piscadas = pedido completo
      for (int i = 0; i < 3; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(200);
        digitalWrite(LED_PIN, LOW);
        delay(200);
      }
    }
  }
  
  // Timeout 60s
  if (elapsedMs > 60000) {
    closeValve();
    isDispensing = false;
    Serial.println("{\"type\":\"error\",\"message\":\"Timeout\"}");
  }
}
