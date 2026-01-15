/*
 * ============================================================================
 * ESP32-S3 Drink Dispenser Controller - Versão 2.0
 * ============================================================================
 * 
 * DESCRIÇÃO:
 * Este firmware controla um dispensador de bebidas com válvula solenóide
 * e sensor de fluxo. Compatível com o Open Kiosk App.
 * 
 * COMUNICAÇÃO SUPORTADA:
 * - WiFi (HTTP REST API) - DESABILITADO TEMPORARIAMENTE
 * - Bluetooth Low Energy (BLE) ✅ ATIVADO
 * - USB Serial (para testes e debug) ✅ ATIVADO
 * 
 * HARDWARE NECESSÁRIO:
 * - ESP32-S3 DevKit ou XIAO ESP32S3
 * - Módulo Relé 5V (para controlar a válvula)
 * - Válvula Solenóide 12V (controle de fluxo)
 * - Sensor de Fluxo YF-S201 (medir volume)
 * - Fonte 12V 2A (alimentar a válvula)
 * - LED indicador (GPIO 19) - MUITO IMPORTANTE PARA DEBUG
 * 
 * CONEXÕES (XIAO ESP32S3):
 * - GPIO 5 (D4):  Controle da válvula (via módulo relé)
 * - GPIO 6 (D5):  Sensor de fluxo (fio de sinal/amarelo)
 * - GPIO 21 (D10): LED indicador (ou use LED_BUILTIN)
 * 
 * 🔴 PADRÕES DE LED PARA DEBUG:
 * ────────────────────────────────────────────────────────
 * 2 piscadas      = Pinos configurados OK
 * 3 piscadas      = Bluetooth iniciado OK
 * 5 piscadas      = Sistema PRONTO (pode receber comandos)
 * Piscando lento  = Dispensando (pisca a cada 500ms)
 * Aceso 1 segundo = Copo concluído com sucesso
 * 3 piscadas longo= Pedido completamente finalizado
 * 5 piscadas rápidas = ERRO - Timeout na dispensação
 * ────────────────────────────────────────────────────────
 * 
 * AUTOR: Open Kiosk Project
 * DATA: 12/01/2026
 * VERSÃO: 2.0 (com LED Debug)
 * 
 * ============================================================================
 */

// ============================================================================
// BIBLIOTECAS NECESSÁRIAS
// ============================================================================

#include <WiFi.h>              // WiFi para ESP32
#include <WebServer.h>         // Servidor HTTP
#include <ArduinoJson.h>       // Parser JSON (versão 6.x ou 7.x)
#include <BLEDevice.h>         // Bluetooth Low Energy
#include <BLEServer.h>
#include <BLEUtils.h>
// NOTA: BLE2902 removido - deprecated no ESP32 Core 3.x (NimBLE adiciona automaticamente)

// ============================================================================
// ⚙️ CONFIGURAÇÕES - AJUSTE CONFORME SUA NECESSIDADE
// ============================================================================

// ----- CREDENCIAIS WIFI -----
// Altere para sua rede WiFi
const char* WIFI_SSID = "ANTI-MALWARE";        // Nome da sua rede WiFi
const char* WIFI_PASSWORD = "PMpr1994**";   // Senha do WiFi

// ----- CONFIGURAÇÃO DE IP FIXO (opcional, descomente para usar) -----
// IPAddress localIP(192, 168, 1, 200);     // IP fixo do ESP32
// IPAddress gateway(192, 168, 1, 1);       // IP do roteador
// IPAddress subnet(255, 255, 255, 0);      // Máscara de sub-rede
// #define USE_STATIC_IP                    // Descomente para IP fixo

// ----- PINOS DO HARDWARE -----
// XIAO ESP32S3: Use pinos disponíveis (evitar pinos USB/JTAG)
const int VALVE_PIN = 5;        // GPIO para controle da válvula (relé) - D4 no XIAO
const int FLOW_SENSOR_PIN = 6;  // GPIO para sensor de fluxo - D5 no XIAO (GPIO18 é USB no S3!)
const int LED_PIN = 21;         // GPIO para LED indicador - LED_BUILTIN ou D10 no XIAO

// ----- CALIBRAÇÃO DO SENSOR DE FLUXO -----
// O sensor YF-S201 tem aproximadamente 7.5 pulsos por litro
// Ajuste este valor após calibrar com seu sensor
const float PULSOS_POR_LITRO = 450.0;  // Pulsos para 1 litro (YF-S201: ~450)
const float ML_POR_PULSO = 1000.0 / PULSOS_POR_LITRO;  // ml por pulso

// ----- CONFIGURAÇÃO DE FLUXO (backup por tempo) -----
// Caso o sensor falhe, usamos controle por tempo
const float ML_POR_SEGUNDO = 50.0;  // Vazão média da sua válvula em ml/s

// ----- BLUETOOTH -----
const char* BLE_DEVICE_NAME = "OpenKiosk-ESP32";  // Nome do dispositivo BLE

// UUIDs para BLE (padrão do Open Kiosk)
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ============================================================================
// VARIÁVEIS GLOBAIS
// ============================================================================

// ----- Servidor HTTP -----
WebServer server(80);

// ----- Bluetooth -----
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// ----- Sensor de Fluxo -----
volatile unsigned long pulseCount = 0;
float totalMlDispensed = 0;
unsigned long lastPulseTime = 0;
float flowRate = 0;

// ----- Estado do Sistema -----
bool isDispensing = false;
String currentOrderId = "";
int currentCup = 0;
int totalCups = 0;
int targetMl = 0;

// ----- Timing -----
unsigned long dispensingStartTime = 0;
unsigned long lastStatusUpdate = 0;
unsigned long lastHeartbeat = 0;

// ============================================================================
// 🆕 DECLARAÇÕES ANTECIPADAS DE FUNÇÕES (Forward Declarations)
// ============================================================================
// Estas linhas dizem ao compilador que as funções existem
// (implementadas mais abaixo no código)

void processCommand(String jsonString);
String processCommandAndGetResult(String jsonString);
void sendStatus(const char* orderId, const char* stage, String message);
void sendProgress(const char* orderId, int cup, float mlDispensed, int target, int percent);
void openValve();
void closeValve();
void processDispensing();
void initWiFi();
void initHTTPServer();
void initBluetooth();
void handleStatus();
void handleCommand();
String handlePing();
String handleReleaseDrink(JsonDocument& doc);
String handleStop();
String handleTestValve(int durationMs);
String handleTestFlow(int durationMs);
String handleCalibration(int durationMs);
String getStatusJson();
void IRAM_ATTR flowPulseCounter();



// ============================================================================
// CALLBACKS BLUETOOTH
// ============================================================================

// Callback quando um cliente BLE conecta/desconecta
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    deviceConnected = true;
    Serial.println("[BLE] Cliente conectado!");
  }

  void onDisconnect(BLEServer* server) override {
    deviceConnected = false;
    Serial.println("[BLE] Cliente desconectado!");
  }
};

// Callback quando recebe dados via BLE
class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    // Algumas versões da lib BLE retornam Arduino String em getValue()
    // Usamos String diretamente para compatibilidade com NimBLE/esp32 3.x
    String value = characteristic->getValue();
    value.trim();
    if (value.length() > 0) {
      Serial.println("[BLE] Comando recebido: " + value);
      processCommand(value);
    }
  }
};

// ============================================================================
// INTERRUPÇÃO DO SENSOR DE FLUXO
// ============================================================================

// Esta função é chamada automaticamente cada vez que o sensor de fluxo
// detecta um pulso (passagem de água)
void IRAM_ATTR flowPulseCounter() {
  pulseCount++;
  lastPulseTime = millis();
}

// ============================================================================
// SETUP - EXECUTA UMA VEZ AO LIGAR
// ============================================================================

void setup() {
  // ----- Iniciar Serial (para debug e comandos USB) -----
  Serial.begin(115200);
  delay(1000);  // Aguarda estabilizar
  
  // ----- Configurar Pino LED PRIMEIRO (para feedback de inicialização) -----
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  delay(100);
  
  // ----- Mensagem de Boas-Vindas -----
  Serial.println();
  Serial.println("=====================================");
  Serial.println("ESP32-S3 Drink Dispenser v2.0");
  Serial.println("Open Kiosk Project");
  Serial.println("=====================================");
  Serial.println();
  
  // 🟡 FASE 1: Configurar Pinos
  Serial.println("[INIT] FASE 1: Configurando pinos...");
  digitalWrite(LED_PIN, HIGH);  // LED ACESO
  delay(200);
  
  pinMode(VALVE_PIN, OUTPUT);
  digitalWrite(VALVE_PIN, LOW);  // Válvula começa fechada
  Serial.println("  → Válvula (GPIO " + String(VALVE_PIN) + "): OK");
  
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowPulseCounter, FALLING);
  Serial.println("  → Sensor de Fluxo (GPIO " + String(FLOW_SENSOR_PIN) + "): OK");
  
  Serial.println("  → LED (GPIO " + String(LED_PIN) + "): OK");
  
  // 🟡 FASE 1 Concluída: piscar 2x
  Serial.println("[INIT] ✅ Pinos OK!");
  for (int i = 0; i < 2; i++) {
    digitalWrite(LED_PIN, LOW);
    delay(150);
    digitalWrite(LED_PIN, HIGH);
    delay(150);
  }
  digitalWrite(LED_PIN, LOW);
  delay(300);
  
  // 🟡 FASE 2: Iniciar Bluetooth (mais simples, sem WiFi)
  Serial.println();
  Serial.println("[INIT] FASE 2: Iniciando Bluetooth...");
  digitalWrite(LED_PIN, HIGH);
  delay(100);
  digitalWrite(LED_PIN, LOW);
  delay(100);
  digitalWrite(LED_PIN, HIGH);
  delay(200);
  
  initBluetooth();
  
  // 🟡 FASE 2 Concluída: piscar 3x
  Serial.println("[INIT] ✅ Bluetooth OK!");
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, LOW);
    delay(100);
    digitalWrite(LED_PIN, HIGH);
    delay(100);
  }
  digitalWrite(LED_PIN, LOW);
  delay(300);
  
  // 🟡 FASE 3: WiFi (ATIVADO)
  Serial.println();
  Serial.println("[INIT] FASE 3: Iniciando WiFi...");
  initWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    initHTTPServer();
    // Piscar 4x = WiFi conectado
    for (int i = 0; i < 4; i++) {
      digitalWrite(LED_PIN, LOW);
      delay(100);
      digitalWrite(LED_PIN, HIGH);
      delay(100);
    }
    digitalWrite(LED_PIN, LOW);
  } else {
    Serial.println("[INIT] WiFi falhou - continuando sem WiFi");
  }
  delay(300);
  
  // ----- Tudo Pronto! -----
  Serial.println();
  Serial.println("=====================================");
  Serial.println("[INIT] Sistema pronto!");
  Serial.println("[INIT] Aguardando comandos via USB Serial ou Bluetooth");
  Serial.println("=====================================");
  Serial.println();
  
  // 🟢 SISTEMA PRONTO: piscar 5x (padrão final)
  Serial.println("[INIT] LED: 5 piscadas = PRONTO!");
  for (int i = 0; i < 5; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    delay(100);
  }
  
  delay(500);
  
  // Enviar status inicial
  sendStatus("", "ready", "ESP32-S3 pronto para receber pedidos via USB e Bluetooth");
}

// ============================================================================
// LOOP PRINCIPAL - EXECUTA CONTINUAMENTE
// ============================================================================

void loop() {
  // ----- Processar comandos Serial (USB) -----
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    if (command.length() > 0) {
      Serial.println("[SERIAL] Comando: " + command);
      processCommand(command);
    }
  }
  
  // ----- Processar requisições HTTP (WiFi) -----
  server.handleClient();
  
  // ----- Gerenciar conexão Bluetooth -----
  // Reconectar se desconectou
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("[BLE] Aguardando nova conexão...");
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
  
  // ----- Processar dispensação em andamento -----
  if (isDispensing) {
    processDispensing();
  }
  
  // ----- Heartbeat do LED -----
  if (!isDispensing && millis() - lastHeartbeat > 2000) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    lastHeartbeat = millis();
  }
  
  // ----- Pequena pausa para não sobrecarregar -----
  delay(10);
}

// ============================================================================
// INICIALIZAÇÃO WIFI
// ============================================================================

void initWiFi() {
  WiFi.mode(WIFI_STA);  // Modo estação (conecta a um roteador)
  
  // Usar IP fixo se configurado
  #ifdef USE_STATIC_IP
    WiFi.config(localIP, gateway, subnet);
    Serial.println("  → Usando IP fixo: " + localIP.toString());
  #endif
  
  Serial.print("  → Conectando a: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // Aguardar conexão (máximo 10 segundos - timeout reduzido)
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // LED pisca enquanto conecta
    attempts++;
  }
  digitalWrite(LED_PIN, LOW);
  
  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WIFI] ✅ Conectado!");
    Serial.println("  → IP: " + WiFi.localIP().toString());
    Serial.println("  → RSSI: " + String(WiFi.RSSI()) + " dBm");
  } else {
    Serial.println("[WIFI] ❌ Falha na conexão!");
    Serial.println("  → Verifique SSID e senha");
    Serial.println("  → Sistema funcionará via USB e Bluetooth apenas");
  }
}

// ============================================================================
// SERVIDOR HTTP (REST API)
// ============================================================================

void initHTTPServer() {
  // Rota: Status do dispositivo
  server.on("/status", HTTP_GET, handleStatus);
  
  // Rota: Receber comandos
  server.on("/command", HTTP_POST, handleCommand);
  
  // Rota: Ping simples
  server.on("/ping", HTTP_GET, []() {
    server.send(200, "application/json", "{\"pong\":true,\"timestamp\":" + String(millis()) + "}");
  });
  
  // Rota raiz
  server.on("/", HTTP_GET, []() {
    String html = "<html><head><title>ESP32 Dispenser</title></head>";
    html += "<body style='font-family:Arial;text-align:center;padding:50px;'>";
    html += "<h1>🍺 ESP32 Drink Dispenser</h1>";
    html += "<p>Status: <strong style='color:green;'>Online</strong></p>";
    html += "<p>IP: " + WiFi.localIP().toString() + "</p>";
    html += "<p>Uptime: " + String(millis() / 1000) + " segundos</p>";
    html += "<hr><p>Open Kiosk Project v2.0</p>";
    html += "</body></html>";
    server.send(200, "text/html", html);
  });
  
  // Habilitar CORS (permite chamadas do navegador)
  server.enableCORS(true);
  
  server.begin();
  Serial.println("[HTTP] Servidor iniciado na porta 80");
}

// Handler para /status
void handleStatus() {
  JsonDocument doc;
  doc["device"] = "ESP32-S3";
  doc["type"] = "kiosk-controller";
  doc["status"] = isDispensing ? "dispensing" : "ready";
  doc["uptime"] = millis();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["ble_connected"] = deviceConnected;
  
  if (isDispensing) {
    doc["order_id"] = currentOrderId;
    doc["current_cup"] = currentCup;
    doc["total_cups"] = totalCups;
    doc["ml_dispensed"] = totalMlDispensed;
    doc["target_ml"] = targetMl;
  }
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// Handler para /command
void handleCommand() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    Serial.println("[HTTP] Comando recebido: " + body);
    
    // Processar o comando
    String result = processCommandAndGetResult(body);
    server.send(200, "application/json", result);
  } else {
    server.send(400, "application/json", "{\"error\":\"No body\"}");
  }
}

// ============================================================================
// INICIALIZAÇÃO BLUETOOTH
// ============================================================================

void initBluetooth() {
  BLEDevice::init(BLE_DEVICE_NAME);
  
  // Criar servidor BLE
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  // Criar serviço
  BLEService* pService = pServer->createService(SERVICE_UUID);
  
  // Criar característica (para receber e enviar dados)
  // NOTA: NimBLE no ESP32 Core 3.x adiciona descriptors automaticamente
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY
  );
  
  // Configurar callbacks para receber comandos
  pCharacteristic->setCallbacks(new MyCallbacks());
  
  // Iniciar serviço
  pService->start();
  
  // Iniciar advertising (tornar visível)
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->start();
  
  Serial.println("[BLE] ✅ Bluetooth iniciado!");
  Serial.println("  → Nome: " + String(BLE_DEVICE_NAME));
  Serial.println("  → Aguardando conexões...");
}

// ============================================================================
// PROCESSAMENTO DE COMANDOS
// ============================================================================

void processCommand(String jsonString) {
  String result = processCommandAndGetResult(jsonString);
  Serial.println("[RESULT] " + result);
}

String processCommandAndGetResult(String jsonString) {
  // Parser JSON
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, jsonString);
  
  // Verificar se JSON é válido
  if (error) {
    Serial.println("[ERROR] JSON inválido: " + String(error.c_str()));
    return "{\"type\":\"error\",\"code\":\"JSON_PARSE_ERROR\",\"message\":\"" + String(error.c_str()) + "\"}";
  }
  
  // Pegar a ação solicitada
  const char* action = doc["action"];
  
  if (action == nullptr) {
    return "{\"type\":\"error\",\"code\":\"NO_ACTION\",\"message\":\"Campo 'action' obrigatório\"}";
  }
  
  // ----- AÇÃO: PING -----
  if (strcmp(action, "ping") == 0) {
    return handlePing();
  }
  
  // ----- AÇÃO: DISPENSAR BEBIDA -----
  else if (strcmp(action, "release_drink") == 0) {
    return handleReleaseDrink(doc);
  }
  
  // ----- AÇÃO: PARAR DISPENSAÇÃO -----
  else if (strcmp(action, "stop") == 0) {
    return handleStop();
  }
  
  // ----- AÇÃO: TESTAR VÁLVULA -----
  else if (strcmp(action, "test_valve") == 0) {
    int duration = doc["duration"] | 1000;  // Padrão 1 segundo
    return handleTestValve(duration);
  }
  
  // ----- AÇÃO: TESTAR SENSOR DE FLUXO -----
  else if (strcmp(action, "test_flow") == 0) {
    int duration = doc["duration"] | 5000;  // Padrão 5 segundos
    return handleTestFlow(duration);
  }
  
  // ----- AÇÃO: CALIBRAR -----
  else if (strcmp(action, "calibrate") == 0) {
    int duration = doc["duration"] | 5000;
    return handleCalibration(duration);
  }
  
  // ----- AÇÃO: STATUS -----
  else if (strcmp(action, "status") == 0) {
    return getStatusJson();
  }
  
  // ----- AÇÃO DESCONHECIDA -----
  else {
    return "{\"type\":\"error\",\"code\":\"UNKNOWN_ACTION\",\"message\":\"Ação desconhecida: " + String(action) + "\"}";
  }
}

// ============================================================================
// HANDLERS DE COMANDOS
// ============================================================================

// ----- PING -----
String handlePing() {
  JsonDocument doc;
  doc["type"] = "pong";
  doc["timestamp"] = millis();
  doc["ip"] = WiFi.localIP().toString();
  doc["status"] = isDispensing ? "dispensing" : "ready";
  
  String response;
  serializeJson(doc, response);
  return response;
}

// ----- DISPENSAR BEBIDA -----
String handleReleaseDrink(JsonDocument& doc) {
  // Verificar se já está dispensando
  if (isDispensing) {
    return "{\"type\":\"error\",\"code\":\"BUSY\",\"message\":\"Sistema ocupado com outro pedido\"}";
  }
  
  // Pegar parâmetros
  const char* orderId = doc["orderId"];
  int mlPerUnit = doc["mlPerUnit"] | 0;
  int quantity = doc["quantity"] | 1;
  const char* sizeLabel = doc["sizeLabel"] | "Padrao";
  
  // Validar parâmetros
  if (orderId == nullptr || strlen(orderId) == 0) {
    return "{\"type\":\"error\",\"code\":\"INVALID_PARAMS\",\"message\":\"orderId é obrigatório\"}";
  }
  
  if (mlPerUnit <= 0 || mlPerUnit > 2000) {
    return "{\"type\":\"error\",\"code\":\"INVALID_PARAMS\",\"message\":\"mlPerUnit deve ser entre 1 e 2000\"}";
  }
  
  if (quantity <= 0 || quantity > 10) {
    return "{\"type\":\"error\",\"code\":\"INVALID_PARAMS\",\"message\":\"quantity deve ser entre 1 e 10\"}";
  }
  
  // Configurar dispensação
  currentOrderId = String(orderId);
  targetMl = mlPerUnit;
  totalCups = quantity;
  currentCup = 1;
  totalMlDispensed = 0;
  pulseCount = 0;
  
  // Log detalhado
  Serial.println();
  Serial.println("╔════════════════════════════════════════╗");
  Serial.println("║        NOVO PEDIDO RECEBIDO            ║");
  Serial.println("╠════════════════════════════════════════╣");
  Serial.println("║ Pedido: " + currentOrderId);
  Serial.println("║ Tamanho: " + String(sizeLabel));
  Serial.println("║ Volume: " + String(targetMl) + "ml x " + String(totalCups) + " copo(s)");
  Serial.println("╚════════════════════════════════════════╝");
  Serial.println();
  
  // Iniciar dispensação
  isDispensing = true;
  dispensingStartTime = millis();
  lastStatusUpdate = millis();
  
  // Abrir válvula
  openValve();
  
  // Enviar confirmação
  sendStatus(currentOrderId.c_str(), "received", "Pedido recebido, iniciando dispensação");
  
  return "{\"type\":\"success\",\"message\":\"Dispensação iniciada\",\"orderId\":\"" + currentOrderId + "\"}";
}

// ----- PARAR -----
String handleStop() {
  if (isDispensing) {
    closeValve();
    isDispensing = false;
    sendStatus(currentOrderId.c_str(), "stopped", "Dispensação interrompida pelo usuário");
    return "{\"type\":\"success\",\"message\":\"Dispensação interrompida\"}";
  }
  return "{\"type\":\"info\",\"message\":\"Nenhuma dispensação em andamento\"}";
}

// ----- TESTE DE VÁLVULA -----
String handleTestValve(int durationMs) {
  Serial.println("[TEST] 🔴 Testando válvula por " + String(durationMs) + "ms");
  
  // LED ligado durante o teste
  digitalWrite(LED_PIN, HIGH);
  openValve();
  delay(durationMs);
  closeValve();
  digitalWrite(LED_PIN, LOW);
  
  // Piscar 2x para indicar fim do teste
  delay(200);
  for (int i = 0; i < 2; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    delay(100);
  }
  
  Serial.println("[TEST] ✅ Teste de válvula concluído!");
  return "{\"type\":\"success\",\"message\":\"Teste de válvula concluído\",\"duration\":" + String(durationMs) + "}";
}

// ----- TESTE DE SENSOR DE FLUXO -----
String handleTestFlow(int durationMs) {
  Serial.println("[TEST] 🟡 Testando sensor de fluxo por " + String(durationMs/1000) + "s");
  Serial.println("[TEST] Abra a água manualmente e observe os pulsos");
  
  // LED piscando durante teste
  pulseCount = 0;
  unsigned long start = millis();
  
  while (millis() - start < durationMs) {
    // LED piscando
    if ((millis() / 300) % 2 == 0) {
      digitalWrite(LED_PIN, HIGH);
    } else {
      digitalWrite(LED_PIN, LOW);
    }
    
    if (pulseCount > 0) {
      Serial.println("[FLOW] Pulsos: " + String(pulseCount) + " | ML: " + String(pulseCount * ML_POR_PULSO, 1));
      delay(500);
    }
    delay(10);
  }
  
  digitalWrite(LED_PIN, LOW);
  
  float totalMl = pulseCount * ML_POR_PULSO;
  
  JsonDocument doc;
  doc["type"] = "flow_test";
  doc["duration_ms"] = durationMs;
  doc["pulses"] = pulseCount;
  doc["ml_calculated"] = totalMl;
  doc["pulses_per_liter"] = (pulseCount > 0) ? (pulseCount / (totalMl / 1000.0)) : 0;
  
  String response;
  serializeJson(doc, response);
  
  Serial.println("[TEST] ✅ Teste de fluxo concluído!");
  Serial.println("[TEST] Resultado: " + response);
  
  // Piscar 2x para indicar fim
  delay(200);
  for (int i = 0; i < 2; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    delay(100);
  }
  
  return response;
}

// ----- CALIBRAÇÃO -----
String handleCalibration(int durationMs) {
  Serial.println("[CALIBRATE] Iniciando calibração...");
  Serial.println("[CALIBRATE] Abrindo válvula por " + String(durationMs/1000) + " segundos");
  
  pulseCount = 0;
  
  openValve();
  delay(durationMs);
  closeValve();
  
  float mlEstimated = (durationMs / 1000.0) * ML_POR_SEGUNDO;
  float calculatedPulsesPerLiter = (mlEstimated > 0) ? (pulseCount / (mlEstimated / 1000.0)) : 0;
  
  JsonDocument doc;
  doc["type"] = "calibration";
  doc["duration_ms"] = durationMs;
  doc["pulses"] = pulseCount;
  doc["ml_estimated"] = mlEstimated;
  doc["calculated_pulses_per_liter"] = calculatedPulsesPerLiter;
  doc["message"] = "Meça o volume real dispensado e calcule: pulsos / (ml / 1000)";
  
  String response;
  serializeJson(doc, response);
  
  Serial.println("[CALIBRATE] Resultado: " + response);
  return response;
}

// ----- STATUS JSON -----
String getStatusJson() {
  JsonDocument doc;
  doc["type"] = "status";
  doc["device"] = "ESP32-S3";
  doc["status"] = isDispensing ? "dispensing" : "ready";
  doc["uptime_ms"] = millis();
  doc["wifi_connected"] = (WiFi.status() == WL_CONNECTED);
  doc["wifi_ip"] = WiFi.localIP().toString();
  doc["ble_connected"] = deviceConnected;
  
  if (isDispensing) {
    doc["order_id"] = currentOrderId;
    doc["current_cup"] = currentCup;
    doc["total_cups"] = totalCups;
    doc["target_ml"] = targetMl;
    doc["ml_dispensed"] = totalMlDispensed;
    doc["progress"] = (targetMl > 0) ? (int)((totalMlDispensed / targetMl) * 100) : 0;
  }
  
  String response;
  serializeJson(doc, response);
  return response;
}

// ============================================================================
// CONTROLE DA VÁLVULA
// ============================================================================

void openValve() {
  digitalWrite(VALVE_PIN, HIGH);
  digitalWrite(LED_PIN, HIGH);
  Serial.println("[VALVE] 🟢 Válvula ABERTA");
}

void closeValve() {
  digitalWrite(VALVE_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
  Serial.println("[VALVE] 🔴 Válvula FECHADA");
}

// ============================================================================
// PROCESSAMENTO DA DISPENSAÇÃO
// ============================================================================

void processDispensing() {
  // Calcular ml dispensados baseado nos pulsos do sensor
  float mlFromSensor = pulseCount * ML_POR_PULSO;
  
  // Calcular ml baseado no tempo (backup)
  unsigned long elapsedMs = millis() - dispensingStartTime;
  float mlFromTime = (elapsedMs / 1000.0) * ML_POR_SEGUNDO;
  
  // Usar o maior valor entre sensor e tempo (mais seguro)
  if (mlFromSensor > 0) {
    totalMlDispensed = mlFromSensor;
  } else {
    // Sensor não está detectando - usar tempo como backup
    totalMlDispensed = mlFromTime;
  }
  
  // Calcular progresso
  int progress = (targetMl > 0) ? (int)((totalMlDispensed / targetMl) * 100) : 0;
  
  // 🔴 LED PISCANDO durante dispensação (feedback visual)
  if (millis() % 500 < 250) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  
  // Enviar atualização de progresso a cada 250ms
  if (millis() - lastStatusUpdate > 250) {
    sendProgress(currentOrderId.c_str(), currentCup, totalMlDispensed, targetMl, progress);
    lastStatusUpdate = millis();
    
    // Log no serial
    Serial.print("[DISPENSE] Copo ");
    Serial.print(currentCup);
    Serial.print("/");
    Serial.print(totalCups);
    Serial.print(" | ");
    Serial.print(totalMlDispensed, 0);
    Serial.print("/");
    Serial.print(targetMl);
    Serial.print("ml (");
    Serial.print(progress);
    Serial.println("%)");
  }
  
  // Verificar se atingiu o volume alvo
  if (totalMlDispensed >= targetMl) {
    // Copo concluído!
    closeValve();
    
    // 🟢 LED ACESO fixo por 1 segundo (sucesso)
    digitalWrite(LED_PIN, HIGH);
    delay(1000);
    digitalWrite(LED_PIN, LOW);
    
    sendStatus(currentOrderId.c_str(), "cup_complete", 
      "Copo " + String(currentCup) + " concluído (" + String(targetMl) + "ml)");
    
    Serial.println();
    Serial.println("[DISPENSE] ✅ Copo " + String(currentCup) + " concluído!");
    
    // Verificar se há mais copos
    if (currentCup < totalCups) {
      // Aguardar um pouco antes do próximo copo
      sendStatus(currentOrderId.c_str(), "waiting_next", "Aguardando para próximo copo...");
      
      // 🟡 LED piscando lento durante espera
      Serial.println("[DISPENSE] ⏳ Aguardando retirada do copo...");
      for (int i = 0; i < 4; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(250);
        digitalWrite(LED_PIN, LOW);
        delay(250);
      }
      
      // Preparar próximo copo
      currentCup++;
      pulseCount = 0;
      totalMlDispensed = 0;
      dispensingStartTime = millis();
      
      // Abrir válvula para próximo copo
      openValve();
      sendStatus(currentOrderId.c_str(), "dispensing", 
        "Dispensando copo " + String(currentCup) + " de " + String(totalCups));
    } else {
      // Todos os copos concluídos!
      isDispensing = false;
      
      // 🟢 LED com 3 piscadas longas (pedido completo!)
      Serial.println("[DISPENSE] 🎉 Todos os copos concluídos!");
      for (int i = 0; i < 3; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(300);
        digitalWrite(LED_PIN, LOW);
        delay(300);
      }
      
      Serial.println();
      Serial.println("╔════════════════════════════════════════╗");
      Serial.println("║        PEDIDO CONCLUÍDO! ✅            ║");
      Serial.println("╠════════════════════════════════════════╣");
      Serial.println("║ Pedido: " + currentOrderId);
      Serial.println("║ Total: " + String(totalCups) + " copo(s) de " + String(targetMl) + "ml");
      Serial.println("╚════════════════════════════════════════╝");
      Serial.println();
      
      sendStatus(currentOrderId.c_str(), "completed", 
        "Pedido concluído! " + String(totalCups) + " copo(s) dispensados");
      
      currentOrderId = "";
    }
  }
  
  // Timeout de segurança (máximo 60 segundos por copo)
  if (elapsedMs > 60000) {
    closeValve();
    isDispensing = false;
    
    // 🔴 LED piscando rápido (ERRO!)
    Serial.println("[ERROR] ⚠️ Timeout! Dispensação interrompida por segurança");
    for (int i = 0; i < 5; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(100);
      digitalWrite(LED_PIN, LOW);
      delay(100);
    }
    
    sendStatus(currentOrderId.c_str(), "error", "Timeout - dispensação interrompida por segurança");
    currentOrderId = "";
  }
}

// ============================================================================
// ENVIO DE MENSAGENS
// ============================================================================

// Enviar status geral
void sendStatus(const char* orderId, const char* stage, String message) {
  JsonDocument doc;
  doc["type"] = "status";
  doc["orderId"] = orderId;
  doc["stage"] = stage;
  doc["message"] = message;
  doc["timestamp"] = millis();
  
  String json;
  serializeJson(doc, json);
  
  // Enviar via Serial
  Serial.println(json);
  
  // Enviar via Bluetooth (se conectado)
  if (deviceConnected && pCharacteristic != NULL) {
    pCharacteristic->setValue(json.c_str());
    pCharacteristic->notify();
  }
}

// Enviar progresso da dispensação
void sendProgress(const char* orderId, int cup, float mlDispensed, int target, int percent) {
  JsonDocument doc;
  doc["type"] = "progress";
  doc["orderId"] = orderId;
  doc["cup"] = cup;
  doc["ml"] = (int)mlDispensed;
  doc["target"] = target;
  doc["percent"] = percent;
  
  String json;
  serializeJson(doc, json);
  
  // Enviar via Serial
  Serial.println(json);
  
  // Enviar via Bluetooth (se conectado)
  if (deviceConnected && pCharacteristic != NULL) {
    pCharacteristic->setValue(json.c_str());
    pCharacteristic->notify();
  }
}

// ============================================================================
// FIM DO FIRMWARE
// ============================================================================

/*
 * ============================================================================
 * COMANDOS DE TESTE (copie e cole no Serial Monitor)
 * ============================================================================
 * 
 * 1. Ping (testar comunicação):
 *    {"action":"ping"}
 * 
 * 2. Status do sistema:
 *    {"action":"status"}
 * 
 * 3. Dispensar 300ml x 1 copo:
 *    {"action":"release_drink","orderId":"TEST-001","mlPerUnit":300,"quantity":1,"sizeLabel":"Pequeno"}
 * 
 * 4. Dispensar 500ml x 2 copos:
 *    {"action":"release_drink","orderId":"TEST-002","mlPerUnit":500,"quantity":2,"sizeLabel":"Médio"}
 * 
 * 5. Parar dispensação:
 *    {"action":"stop"}
 * 
 * 6. Testar válvula (abre por 2 segundos):
 *    {"action":"test_valve","duration":2000}
 * 
 * 7. Testar sensor de fluxo (5 segundos - abra água manualmente):
 *    {"action":"test_flow","duration":5000}
 * 
 * 8. Calibração (abre válvula e conta pulsos):
 *    {"action":"calibrate","duration":5000}
 * 
 * ============================================================================
 */
