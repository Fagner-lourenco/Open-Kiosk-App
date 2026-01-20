/*
 * ============================================================================
 * ESP32-S3 Drink Dispenser Controller - Versão 3.0 (Kiosk_Bier)
 * ============================================================================
 * 
 * DESCRIÇÃO:
 * Este firmware controla um dispensador de bebidas com válvula solenóide
 * e sensor de fluxo. Compatível com o Open Kiosk App.
 * 
 * COMUNICAÇÃO SUPORTADA:
 * - WiFi Access Point fixo (Kiosk_Bier) ✅ ATIVADO
 * - HTTP REST API (192.168.4.1) ✅ ATIVADO
 * - Bluetooth Low Energy (BLE) ✅ ATIVADO
 * - USB Serial (para testes e debug) ✅ ATIVADO
 * - mDNS: http://kiosk-bier.local ✅ ATIVADO
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
 * DATA: 20/01/2026
 * VERSÃO: 3.0 (Access Point Fixo - Kiosk_Bier)
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
// WiFiManager REMOVIDO - Agora usa Access Point fixo (Kiosk_Bier)
#include <Preferences.h>       // NVS - Salvar configurações na flash
#include <ESPmDNS.h>           // mDNS - Acessar via kiosk-bier.local
// NOTA: BLE2902 removido - deprecated no ESP32 Core 3.x (NimBLE adiciona automaticamente)

// ============================================================================
// ⚙️ CONFIGURAÇÕES - AJUSTE CONFORME SUA NECESSIDADE
// ============================================================================

// ----- WIFI ACCESS POINT (MODO SERVIDOR LOCAL) -----
// O ESP32 cria uma rede WiFi própria para o Kiosk se conectar
// Não depende de roteador externo - funciona offline
const char* AP_SSID = "Kiosk_Bier";       // Nome da rede WiFi do Kiosk
const char* AP_PASSWORD = "bier2026";     // Senha da rede WiFi
// IP padrão do Access Point: 192.168.4.1 (fixo do ESP32)

// ----- MDNS -----
const char* MDNS_HOSTNAME = "kiosk-bier";  // Acessar via http://kiosk-bier.local

// ----- PINOS DO HARDWARE -----
// XIAO ESP32S3: Use pinos disponíveis (evitar pinos USB/JTAG)
// 
// ⚠️ TROCA DE PINO: Se GPIO5 não funcionar, descomente a linha abaixo e comente a atual
// const int VALVE_PIN = 4;     // GPIO4 = D3 no XIAO (alternativa se GPIO5 queimou)
const int VALVE_PIN = 5;        // GPIO5 = D4 no XIAO (pino padrão)
//
const int FLOW_SENSOR_PIN = 6;  // GPIO para sensor de fluxo - D5 no XIAO (GPIO18 é USB no S3!)
const int LED_PIN = 21;         // GPIO para LED indicador - LED_BUILTIN ou D10 no XIAO

// ----- CALIBRAÇÃO DO SENSOR DE FLUXO (valores padrão) -----
// Estes valores podem ser alterados e salvos via NVS
float pulsosPorLitro = 450.0;   // Pulsos para 1 litro (YF-S201: ~450)
float mlPorSegundo = 50.0;      // Vazão média da sua válvula em ml/s

// ----- BLUETOOTH -----
const char* BLE_DEVICE_NAME = "Kiosk_Bier";  // Nome do dispositivo BLE (igual ao WiFi)

// UUIDs para BLE (padrão do Open Kiosk)
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ----- VERSÃO DO FIRMWARE -----
const char* FIRMWARE_VERSION = "3.0.0";

// ============================================================================
// VARIÁVEIS GLOBAIS
// ============================================================================

// ----- NVS (Preferences) -----
Preferences preferences;

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
unsigned long firstPulseTime = 0;       // Momento em que o usuário abriu a torneira
bool flowStarted = false;                // Flag: usuário já abriu a torneira?

// ----- Timeout de Segurança (Torneira Manual) -----
// Timeout máximo para a sessão completa (usuário pode demorar para abrir a torneira)
const unsigned long SESSION_TIMEOUT_MS = 300000;  // 5 minutos (300 segundos)
// Timeout após o fluxo parar (sensor parou de detectar pulsos)
const unsigned long NO_FLOW_TIMEOUT_MS = 10000;   // 10 segundos sem pulsos após iniciar

// ============================================================================
// 🆕 DECLARAÇÕES ANTECIPADAS DE FUNÇÕES (Forward Declarations)
// ============================================================================
// Estas linhas dizem ao compilador que as funções existem
// (implementadas mais abaixo no código)

void processCommand(String jsonString);
String processCommandAndGetResult(String jsonString);
void sendStatus(const char* orderId, const char* stage, String message);
void sendProgress(const char* orderId, int cup, float mlDispensed, int target, int percent);
void sendProgressExtended(const char* orderId, int cup, int totalCupsCount, float mlDispensed, int target, int percent, bool flowStartedFlag, int elapsedSec, int remainingSec);
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

// Novas funções v3.0
void loadSettings();
void saveSettings();
String handleSaveCalibration(JsonDocument& doc);
String handleGetSettings();
String handleWifiInfo();
String handleDiagnoseGPIO();  // Diagnóstico de GPIO para debugging
// handleResetWifi e handleStartWifiPortal REMOVIDOS - Access Point fixo



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
  Serial.println("ESP32-S3 Drink Dispenser v" + String(FIRMWARE_VERSION));
  Serial.println("Open Kiosk Project");
  Serial.println("=====================================");
  Serial.println();
  
  // ----- Carregar configurações do NVS -----
  Serial.println("[INIT] Carregando configurações do NVS...");
  preferences.begin("openkiosk", false);
  loadSettings();
  Serial.println("  → Pulsos/Litro: " + String(pulsosPorLitro));
  Serial.println("  → ML/Segundo: " + String(mlPorSegundo));
  
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
  
  // 🟡 FASE 3: WiFi Access Point (SERVIDOR LOCAL)
  Serial.println();
  Serial.println("[INIT] FASE 3: Iniciando Access Point WiFi...");
  initWiFi();  // Cria AP e inicia HTTP Server internamente
  
  // Piscar 4x = WiFi AP ativo
  for (int i = 0; i < 4; i++) {
    digitalWrite(LED_PIN, LOW);
    delay(100);
    digitalWrite(LED_PIN, HIGH);
    delay(100);
  }
  digitalWrite(LED_PIN, LOW);
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
// INICIALIZAÇÃO WIFI (ACCESS POINT FIXO - SERVIDOR LOCAL)
// ============================================================================

void initWiFi() {
  // ============================================
  // MODO ACCESS POINT FIXO (Servidor Local)
  // O ESP32 cria sua própria rede WiFi
  // Não depende de roteador externo
  // ============================================
  
  Serial.println("[WIFI] Iniciando Access Point do Kiosk...");
  
  // Configurar como Access Point
  WiFi.mode(WIFI_AP);
  
  // Criar rede WiFi com SSID e senha fixos
  bool success = WiFi.softAP(AP_SSID, AP_PASSWORD);
  
  if (success) {
    IPAddress IP = WiFi.softAPIP();
    
    Serial.println("[WIFI] ✅ Access Point ativo!");
    Serial.println("  → SSID: " + String(AP_SSID));
    Serial.println("  → Senha: " + String(AP_PASSWORD));
    Serial.println("  → IP: " + IP.toString());
    
    // Iniciar servidor HTTP
    initHTTPServer();
    
    // Iniciar mDNS
    if (MDNS.begin(MDNS_HOSTNAME)) {
      MDNS.addService("http", "tcp", 80);
      MDNS.addService("openkiosk", "tcp", 80);
      Serial.println("  → mDNS: http://" + String(MDNS_HOSTNAME) + ".local");
    } else {
      Serial.println("  → mDNS: Falha ao iniciar (não crítico)");
    }
    
    Serial.println();
    Serial.println("╔════════════════════════════════════════╗");
    Serial.println("║   🍺 KIOSK BIER - SERVIDOR ATIVO       ║");
    Serial.println("╠════════════════════════════════════════╣");
    Serial.println("║ Conecte o celular/tablet na rede:      ║");
    Serial.println("║   WiFi: Kiosk_Bier                     ║");
    Serial.println("║   Senha: bier2026                      ║");
    Serial.println("║   URL: http://192.168.4.1              ║");
    Serial.println("╚════════════════════════════════════════╝");
    Serial.println();
  } else {
    Serial.println("[WIFI] ❌ Falha ao criar Access Point!");
    Serial.println("  → Sistema funcionará via USB e Bluetooth");
  }
}

// ============================================================================
// SERVIDOR HTTP (REST API)
// ============================================================================

// Helper para enviar resposta com headers CORS completos
void sendCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  server.sendHeader("Access-Control-Max-Age", "86400");  // Cache preflight por 24h
}

void initHTTPServer() {
  // Handler OPTIONS global para preflight CORS (navegadores enviam antes de POST)
  server.on("/status", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    server.send(204);  // No Content
  });
  
  server.on("/command", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    server.send(204);  // No Content
  });
  
  server.on("/ping", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    server.send(204);  // No Content
  });
  
  // Rota: Status do dispositivo
  server.on("/status", HTTP_GET, handleStatus);
  
  // Rota: Receber comandos
  server.on("/command", HTTP_POST, handleCommand);
  
  // Rota: Ping simples
  server.on("/ping", HTTP_GET, []() {
    sendCORSHeaders();
    server.send(200, "application/json", "{\"pong\":true,\"timestamp\":" + String(millis()) + "}");
  });
  
  // Rota: Auto-descoberta (para o app encontrar o ESP32 na rede)
  server.on("/discover", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    server.send(204);
  });
  
  server.on("/discover", HTTP_GET, []() {
    sendCORSHeaders();
    JsonDocument doc;
    doc["device"] = "Kiosk_Bier";
    doc["type"] = "drink-dispenser";
    doc["version"] = FIRMWARE_VERSION;
    doc["wifi_mode"] = "access_point";
    doc["wifi_ssid"] = AP_SSID;
    doc["ip"] = WiFi.softAPIP().toString();
    doc["mac"] = WiFi.macAddress();
    doc["hostname"] = String(MDNS_HOSTNAME) + ".local";
    doc["status"] = isDispensing ? "dispensing" : "ready";
    doc["ble_name"] = BLE_DEVICE_NAME;
    doc["uptime"] = millis();
    doc["clients_connected"] = WiFi.softAPgetStationNum();
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });
  
  // Rota raiz
  server.on("/", HTTP_GET, []() {
    String html = "<html><head><title>Kiosk Bier</title>";
    html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
    html += "<style>body{font-family:Arial;text-align:center;padding:20px;background:linear-gradient(135deg,#1a1a2e,#16213e);min-height:100vh;}";
    html += ".card{background:white;border-radius:15px;padding:25px;max-width:400px;margin:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);}";
    html += ".status{color:#27ae60;font-weight:bold;font-size:1.2em;}";
    html += ".info{background:#f8f9fa;padding:15px;border-radius:8px;margin:15px 0;text-align:left;}";
    html += "h1{color:#2c3e50;margin-bottom:5px;}</style></head>";
    html += "<body><div class='card'>";
    html += "<h1>🍺 Kiosk Bier</h1>";
    html += "<p>Servidor de Chopeira</p>";
    html += "<p>Status: <span class='status'>✅ Online</span></p>";
    html += "<div class='info'>";
    html += "<p>📡 WiFi: " + String(AP_SSID) + "</p>";
    html += "<p>🔑 Senha: " + String(AP_PASSWORD) + "</p>";
    html += "<p>🌐 IP: " + WiFi.softAPIP().toString() + "</p>";
    html += "<p>🔗 mDNS: http://" + String(MDNS_HOSTNAME) + ".local</p>";
    html += "<p>📱 Clientes: " + String(WiFi.softAPgetStationNum()) + "</p>";
    html += "</div>";
    html += "<p>⏱️ Uptime: " + String(millis() / 1000) + "s</p>";
    html += "<hr><p style='color:#95a5a6;'>Firmware v" + String(FIRMWARE_VERSION) + "</p>";
    html += "</div></body></html>";
    server.send(200, "text/html", html);
  });
  
  // Habilitar CORS básico (complementar aos handlers OPTIONS acima)
  server.enableCORS(true);
  
  server.begin();
  Serial.println("[HTTP] Servidor iniciado na porta 80 (CORS habilitado)");
}

// Handler para /status
void handleStatus() {
  sendCORSHeaders();  // Adicionar headers CORS
  
  JsonDocument doc;
  doc["device"] = "Kiosk_Bier";
  doc["type"] = "drink-dispenser";
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["status"] = isDispensing ? "dispensing" : "ready";
  doc["uptime_ms"] = millis();
  
  // WiFi Access Point info
  doc["wifi_mode"] = "access_point";
  doc["wifi_ssid"] = AP_SSID;
  doc["wifi_ip"] = WiFi.softAPIP().toString();
  doc["wifi_clients"] = WiFi.softAPgetStationNum();
  doc["mac"] = WiFi.macAddress();
  doc["hostname"] = String(MDNS_HOSTNAME) + ".local";
  
  // Bluetooth
  doc["ble_name"] = BLE_DEVICE_NAME;
  doc["ble_connected"] = deviceConnected;
  
  // Hardware
  doc["valve_pin"] = VALVE_PIN;
  doc["flow_sensor_pin"] = FLOW_SENSOR_PIN;
  doc["led_pin"] = LED_PIN;
  
  // Calibração
  doc["pulsos_por_litro"] = pulsosPorLitro;
  doc["ml_por_segundo"] = mlPorSegundo;
  
  if (isDispensing) {
    JsonObject order = doc["current_order"].to<JsonObject>();
    order["order_id"] = currentOrderId;
    order["current_cup"] = currentCup;
    order["total_cups"] = totalCups;
    order["ml_dispensed"] = totalMlDispensed;
    order["target_ml"] = targetMl;
    order["progress"] = (targetMl > 0) ? (int)((totalMlDispensed / targetMl) * 100) : 0;
    order["flow_started"] = flowStarted;
    order["elapsed_ms"] = millis() - dispensingStartTime;
  }
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// Handler para /command
void handleCommand() {
  sendCORSHeaders();  // Adicionar headers CORS
  
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
  
  // ----- AÇÃO: BEEP (feedback visual com LED) -----
  else if (strcmp(action, "beep") == 0) {
    int times = doc["times"] | 1;
    Serial.println("[BEEP] Piscando LED " + String(times) + " vez(es)");
    for (int i = 0; i < times; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(150);
      digitalWrite(LED_PIN, LOW);
      delay(150);
    }
    return "{\"type\":\"success\",\"message\":\"Beep executado\",\"times\":" + String(times) + "}";
  }
  
  // ----- AÇÃO: SALVAR CALIBRAÇÃO (NVS) -----
  else if (strcmp(action, "save_calibration") == 0) {
    return handleSaveCalibration(doc);
  }
  
  // ----- AÇÃO: OBTER CONFIGURAÇÕES -----
  else if (strcmp(action, "get_settings") == 0) {
    return handleGetSettings();
  }
  
  // ----- AÇÃO: INFO DO ACCESS POINT -----
  else if (strcmp(action, "wifi_info") == 0) {
    return handleWifiInfo();
  }
  
  // ----- AÇÃO: DIAGNÓSTICO GPIO -----
  else if (strcmp(action, "diagnose_gpio") == 0) {
    return handleDiagnoseGPIO();
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
  doc["device"] = "Kiosk_Bier";
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["timestamp"] = millis();
  doc["wifi_mode"] = "access_point";
  doc["ip"] = WiFi.softAPIP().toString();
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
  flowStarted = false;      // Aguardar usuário abrir a torneira
  firstPulseTime = 0;       // Resetar tempo do primeiro pulso
  
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
      Serial.println("[FLOW] Pulsos: " + String(pulseCount) + " | ML: " + String(pulseCount * (1000.0 / pulsosPorLitro), 1));
      delay(500);
    }
    delay(10);
  }
  
  digitalWrite(LED_PIN, LOW);
  
  float totalMl = pulseCount * (1000.0 / pulsosPorLitro);
  
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
  
  float mlEstimated = (durationMs / 1000.0) * mlPorSegundo;
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
  doc["device"] = "Kiosk_Bier";
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["status"] = isDispensing ? "dispensing" : "ready";
  doc["uptime_ms"] = millis();
  
  // WiFi Access Point
  doc["wifi_mode"] = "access_point";
  doc["wifi_ssid"] = AP_SSID;
  doc["wifi_ip"] = WiFi.softAPIP().toString();
  doc["wifi_clients"] = WiFi.softAPgetStationNum();
  doc["mac"] = WiFi.macAddress();
  
  // Bluetooth
  doc["ble_name"] = BLE_DEVICE_NAME;
  doc["ble_connected"] = deviceConnected;
  
  // Calibração
  doc["pulsos_por_litro"] = pulsosPorLitro;
  doc["ml_por_segundo"] = mlPorSegundo;
  
  if (isDispensing) {
    JsonObject order = doc["current_order"].to<JsonObject>();
    order["order_id"] = currentOrderId;
    order["current_cup"] = currentCup;
    order["total_cups"] = totalCups;
    order["target_ml"] = targetMl;
    order["ml_dispensed"] = totalMlDispensed;
    order["progress"] = (targetMl > 0) ? (int)((totalMlDispensed / targetMl) * 100) : 0;
    order["flow_started"] = flowStarted;
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
// PROCESSAMENTO DA DISPENSAÇÃO (TORNEIRA MANUAL ITALIANA)
// ============================================================================
// O sistema usa torneira italiana manual. O usuário abre quando desejar.
// O firmware aguarda indefinidamente o primeiro pulso, respeitando apenas
// o timeout global de segurança (SESSION_TIMEOUT_MS).

void processDispensing() {
  unsigned long now = millis();
  unsigned long sessionElapsedMs = now - dispensingStartTime;
  
  // ============================================
  // DETECTAR PRIMEIRO PULSO (usuário abriu a torneira)
  // ============================================
  if (!flowStarted && pulseCount > 0) {
    flowStarted = true;
    firstPulseTime = now;
    Serial.println("[DISPENSE] 🚿 Fluxo detectado! Usuário abriu a torneira.");
  }
  
  // ============================================
  // CALCULAR ML DISPENSADOS
  // ============================================
  if (flowStarted) {
    // Usar sensor de fluxo como fonte primária
    float mlFromSensor = pulseCount * (1000.0 / pulsosPorLitro);
    
    // Fallback por tempo: APENAS se o sensor parou de funcionar após ter iniciado
    unsigned long timeSinceLastPulse = now - lastPulseTime;
    
    if (pulseCount > 0) {
      // Sensor funcionando normalmente
      totalMlDispensed = mlFromSensor;
    } else if (timeSinceLastPulse > 3000) {
      // Sensor parou há mais de 3 segundos - possível falha do sensor
      // Usar estimativa por tempo como backup
      unsigned long flowElapsedMs = now - firstPulseTime;
      float mlFromTime = (flowElapsedMs / 1000.0) * mlPorSegundo;
      totalMlDispensed = max(mlFromSensor, mlFromTime);
      Serial.println("[DISPENSE] ⚠️ Usando fallback por tempo - sensor pode estar com problema");
    }
  } else {
    // Aguardando usuário abrir a torneira - não calcular por tempo!
    totalMlDispensed = 0;
  }
  
  // ============================================
  // CALCULAR PROGRESSO E TEMPOS
  // ============================================
  int progress = (targetMl > 0) ? (int)((totalMlDispensed / targetMl) * 100) : 0;
  if (progress > 100) progress = 100;
  
  int elapsedSeconds = sessionElapsedMs / 1000;
  int remainingSeconds = (SESSION_TIMEOUT_MS - sessionElapsedMs) / 1000;
  if (remainingSeconds < 0) remainingSeconds = 0;
  
  // ============================================
  // LED: Feedback visual
  // ============================================
  if (!flowStarted) {
    // Aguardando: LED pisca lento (1s on, 1s off)
    if ((now / 1000) % 2 == 0) {
      digitalWrite(LED_PIN, HIGH);
    } else {
      digitalWrite(LED_PIN, LOW);
    }
  } else {
    // Dispensando: LED pisca rápido (250ms)
    if ((now / 250) % 2 == 0) {
      digitalWrite(LED_PIN, HIGH);
    } else {
      digitalWrite(LED_PIN, LOW);
    }
  }
  
  // ============================================
  // ENVIAR PROGRESSO (a cada 250ms)
  // ============================================
  if (now - lastStatusUpdate > 250) {
    sendProgressExtended(
      currentOrderId.c_str(), 
      currentCup, 
      totalCups,
      totalMlDispensed, 
      targetMl, 
      progress,
      flowStarted,
      elapsedSeconds,
      remainingSeconds
    );
    lastStatusUpdate = now;
    
    // Log no serial
    if (flowStarted) {
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
      Serial.print("%) | Pulsos: ");
      Serial.println(pulseCount);
    } else {
      Serial.println("[DISPENSE] ⏳ Aguardando usuário abrir a torneira... (" + String(elapsedSeconds) + "s)");
    }
  }
  
  // ============================================
  // VERIFICAR CONCLUSÃO DO COPO
  // ============================================
  if (flowStarted && totalMlDispensed >= targetMl) {
    // Copo concluído!
    closeValve();
    
    // LED ACESO fixo por 1 segundo (sucesso)
    digitalWrite(LED_PIN, HIGH);
    delay(1000);
    digitalWrite(LED_PIN, LOW);
    
    sendStatus(currentOrderId.c_str(), "cup_complete", 
      "Copo " + String(currentCup) + " concluído (" + String(targetMl) + "ml)");
    
    Serial.println();
    Serial.println("[DISPENSE] ✅ Copo " + String(currentCup) + " concluído!");
    
    // Verificar se há mais copos
    if (currentCup < totalCups) {
      // Aguardar antes do próximo copo
      sendStatus(currentOrderId.c_str(), "waiting_next", "Aguardando para próximo copo...");
      
      // LED piscando lento durante espera
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
      flowStarted = false;        // Resetar - aguardar usuário abrir novamente
      firstPulseTime = 0;
      dispensingStartTime = millis();  // Resetar timer da sessão
      
      // Abrir válvula para próximo copo
      openValve();
      sendStatus(currentOrderId.c_str(), "dispensing", 
        "Dispensando copo " + String(currentCup) + " de " + String(totalCups));
    } else {
      // Todos os copos concluídos!
      isDispensing = false;
      
      // LED com 3 piscadas longas (pedido completo!)
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
    return;
  }
  
  // ============================================
  // TIMEOUT: Fluxo parou após ter iniciado
  // ============================================
  if (flowStarted) {
    unsigned long timeSinceLastPulse = now - lastPulseTime;
    
    // Se o sensor não detecta pulsos há NO_FLOW_TIMEOUT_MS após ter iniciado
    if (timeSinceLastPulse > NO_FLOW_TIMEOUT_MS && totalMlDispensed < targetMl) {
      Serial.println("[DISPENSE] ⚠️ Fluxo parou - usuário fechou a torneira antes de completar?");
      // Não fechar automaticamente - pode ser pausa temporária
      // Apenas avisar no log
    }
  }
  
  // ============================================
  // TIMEOUT GLOBAL DE SEGURANÇA
  // ============================================
  if (sessionElapsedMs > SESSION_TIMEOUT_MS) {
    closeValve();
    isDispensing = false;
    
    // LED piscando rápido (ERRO!)
    Serial.println("[ERROR] ⚠️ Timeout global! Sessão expirada após " + String(SESSION_TIMEOUT_MS/1000) + " segundos");
    for (int i = 0; i < 5; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(100);
      digitalWrite(LED_PIN, LOW);
      delay(100);
    }
    
    sendStatus(currentOrderId.c_str(), "error", "Timeout - sessão expirada por segurança");
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

// Enviar progresso estendido (para torneira manual com mais informações)
void sendProgressExtended(const char* orderId, int cup, int totalCupsCount, float mlDispensed, int target, int percent, bool flowStartedFlag, int elapsedSec, int remainingSec) {
  JsonDocument doc;
  doc["type"] = "progress";
  doc["orderId"] = orderId;
  doc["cup"] = cup;
  doc["total_cups"] = totalCupsCount;
  doc["ml"] = (int)mlDispensed;
  doc["target"] = target;
  doc["percent"] = percent;
  doc["flow_started"] = flowStartedFlag;
  doc["elapsed_seconds"] = elapsedSec;
  doc["remaining_seconds"] = remainingSec;
  
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
// FUNÇÕES NVS (PERSISTÊNCIA)
// ============================================================================

// Carregar configurações do NVS
void loadSettings() {
  // Carregar calibração do sensor de fluxo
  if (preferences.isKey("pulsos_litro")) {
    pulsosPorLitro = preferences.getFloat("pulsos_litro", 450.0);
  }
  if (preferences.isKey("ml_segundo")) {
    mlPorSegundo = preferences.getFloat("ml_segundo", 50.0);
  }
  
  Serial.println("[NVS] ✅ Configurações carregadas");
}

// Salvar configurações no NVS
void saveSettings() {
  preferences.putFloat("pulsos_litro", pulsosPorLitro);
  preferences.putFloat("ml_segundo", mlPorSegundo);
  Serial.println("[NVS] ✅ Configurações salvas");
}

// Handler: Salvar calibração
String handleSaveCalibration(JsonDocument& doc) {
  float novoPulsos = doc["pulsos_por_litro"] | pulsosPorLitro;
  float novoMlSeg = doc["ml_por_segundo"] | mlPorSegundo;
  
  // Validar valores
  if (novoPulsos <= 0 || novoPulsos > 10000) {
    return "{\"type\":\"error\",\"code\":\"INVALID_PARAMS\",\"message\":\"pulsos_por_litro deve ser entre 1 e 10000\"}";
  }
  if (novoMlSeg <= 0 || novoMlSeg > 500) {
    return "{\"type\":\"error\",\"code\":\"INVALID_PARAMS\",\"message\":\"ml_por_segundo deve ser entre 1 e 500\"}";
  }
  
  // Aplicar novos valores
  pulsosPorLitro = novoPulsos;
  mlPorSegundo = novoMlSeg;
  
  // Salvar no NVS
  saveSettings();
  
  Serial.println("[CALIB] ✅ Nova calibração salva:");
  Serial.println("  → Pulsos/Litro: " + String(pulsosPorLitro));
  Serial.println("  → ML/Segundo: " + String(mlPorSegundo));
  
  JsonDocument response;
  response["type"] = "success";
  response["message"] = "Calibração salva no NVS";
  response["pulsos_por_litro"] = pulsosPorLitro;
  response["ml_por_segundo"] = mlPorSegundo;
  
  String json;
  serializeJson(response, json);
  return json;
}

// Handler: Obter configurações atuais
String handleGetSettings() {
  JsonDocument doc;
  doc["type"] = "settings";
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["pulsos_por_litro"] = pulsosPorLitro;
  doc["ml_por_segundo"] = mlPorSegundo;
  doc["ml_por_pulso"] = 1000.0 / pulsosPorLitro;
  
  // WiFi Access Point info
  doc["wifi_mode"] = "access_point";
  doc["wifi_ssid"] = AP_SSID;
  doc["wifi_ip"] = WiFi.softAPIP().toString();
  doc["wifi_clients"] = WiFi.softAPgetStationNum();
  doc["mac"] = WiFi.macAddress();
  doc["mdns_hostname"] = String(MDNS_HOSTNAME) + ".local";
  doc["ble_name"] = BLE_DEVICE_NAME;
  doc["uptime_ms"] = millis();
  
  String json;
  serializeJson(doc, json);
  return json;
}

// Handler: Info do Access Point WiFi
String handleWifiInfo() {
  JsonDocument doc;
  doc["type"] = "wifi_info";
  doc["mode"] = "access_point";
  doc["ssid"] = AP_SSID;
  doc["password"] = AP_PASSWORD;
  doc["ip"] = WiFi.softAPIP().toString();
  doc["clients"] = WiFi.softAPgetStationNum();
  doc["hostname"] = String(MDNS_HOSTNAME) + ".local";
  doc["mac"] = WiFi.macAddress();
  
  String json;
  serializeJson(doc, json);
  return json;
}

// NOTA: handleResetWifi e handleStartWifiPortal REMOVIDOS na v3.0
// O sistema usa Access Point fixo (Kiosk_Bier) - não precisa configuração

// ============================================================================
// DIAGNÓSTICO DE GPIO - Para debugar problemas de hardware
// ============================================================================

// Função auxiliar para testar um pino OUTPUT
bool testOutputPin(int pin, const char* pinName) {
  Serial.println();
  Serial.println("┌─────────────────────────────────────────┐");
  Serial.println("│ Testando " + String(pinName) + " (GPIO" + String(pin) + ")");
  Serial.println("└─────────────────────────────────────────┘");
  
  // Salvar modo atual e configurar como OUTPUT
  pinMode(pin, OUTPUT);
  
  // Teste LOW
  digitalWrite(pin, LOW);
  delay(50);
  int stateLow = digitalRead(pin);
  Serial.println("  LOW  → Leitura: " + String(stateLow ? "HIGH ❌" : "LOW ✓"));
  
  // Teste HIGH (mantém por 500ms para medir com multímetro)
  Serial.println("  HIGH → Mantendo por 500ms... MEÇA AGORA!");
  digitalWrite(pin, HIGH);
  delay(500);
  int stateHigh = digitalRead(pin);
  Serial.println("  HIGH → Leitura: " + String(stateHigh ? "HIGH ✓" : "LOW ❌"));
  
  // Voltar para LOW
  digitalWrite(pin, LOW);
  
  bool ok = (stateLow == LOW && stateHigh == HIGH);
  Serial.println("  Resultado: " + String(ok ? "✅ FUNCIONAL" : "❌ PROBLEMA"));
  
  return ok;
}

// Função auxiliar para testar um pino INPUT
bool testInputPin(int pin, const char* pinName) {
  Serial.println();
  Serial.println("┌─────────────────────────────────────────┐");
  Serial.println("│ Testando " + String(pinName) + " (GPIO" + String(pin) + ")");
  Serial.println("└─────────────────────────────────────────┘");
  
  pinMode(pin, INPUT_PULLUP);
  delay(50);
  
  int state = digitalRead(pin);
  Serial.println("  INPUT_PULLUP → Leitura: " + String(state ? "HIGH (pull-up ativo)" : "LOW (algo puxando para GND)"));
  
  // Para sensor, verificar se há pulsos
  Serial.println("  Aguardando pulsos por 2 segundos...");
  unsigned long startCount = pulseCount;
  delay(2000);
  unsigned long endCount = pulseCount;
  unsigned long pulsos = endCount - startCount;
  
  Serial.println("  Pulsos detectados: " + String(pulsos));
  
  bool ok = (state == HIGH);  // Com pull-up, deve estar HIGH se não há sinal
  Serial.println("  Resultado: " + String(ok ? "✅ FUNCIONAL" : "⚠️ VERIFICAR CONEXÃO"));
  
  return ok;
}

String handleDiagnoseGPIO() {
  Serial.println();
  Serial.println("╔══════════════════════════════════════════════════════════╗");
  Serial.println("║     🔧 DIAGNÓSTICO COMPLETO DE TODOS OS GPIOs            ║");
  Serial.println("╠══════════════════════════════════════════════════════════╣");
  Serial.println("║  GPIO5  (D4) = Válvula     │  GPIO4 (D3) = Alternativo   ║");
  Serial.println("║  GPIO6  (D5) = Sensor      │  GPIO21(D10)= LED           ║");
  Serial.println("╚══════════════════════════════════════════════════════════╝");
  Serial.println();
  
  // Testar todos os pinos OUTPUT
  bool gpio5_ok = testOutputPin(5, "VALVE (D4)");
  bool gpio4_ok = testOutputPin(4, "ALT   (D3)");
  bool gpio21_ok = testOutputPin(21, "LED  (D10)");
  
  // Testar pino INPUT (sensor)
  bool gpio6_ok = testInputPin(6, "SENSOR(D5)");
  
  // Restaurar configurações originais
  pinMode(VALVE_PIN, OUTPUT);
  digitalWrite(VALVE_PIN, LOW);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  
  // Resumo
  Serial.println();
  Serial.println("╔══════════════════════════════════════════════════════════╗");
  Serial.println("║                    📊 RESUMO                              ║");
  Serial.println("╠══════════════════════════════════════════════════════════╣");
  Serial.println("║  GPIO5  (D4) Válvula:    " + String(gpio5_ok ? "✅ OK " : "❌ FAIL") + "                         ║");
  Serial.println("║  GPIO4  (D3) Alternativo:" + String(gpio4_ok ? "✅ OK " : "❌ FAIL") + "                         ║");
  Serial.println("║  GPIO21(D10) LED:        " + String(gpio21_ok ? "✅ OK " : "❌ FAIL") + "                         ║");
  Serial.println("║  GPIO6  (D5) Sensor:     " + String(gpio6_ok ? "✅ OK " : "⚠️ VER ") + "                         ║");
  Serial.println("╚══════════════════════════════════════════════════════════╝");
  Serial.println();
  
  // Recomendação
  if (!gpio5_ok && gpio4_ok) {
    Serial.println("💡 RECOMENDAÇÃO: GPIO5 com problema. Use GPIO4 (D3) em vez de GPIO5 (D4)!");
    Serial.println("   1. Edite firmware.ino linha ~77");
    Serial.println("   2. Comente 'const int VALVE_PIN = 5;'");
    Serial.println("   3. Descomente 'const int VALVE_PIN = 4;'");
    Serial.println("   4. Mova o fio MARROM do D4 para D3");
  } else if (!gpio5_ok && !gpio4_ok) {
    Serial.println("⚠️ ATENÇÃO: Ambos GPIO4 e GPIO5 com problema!");
    Serial.println("   Possíveis causas:");
    Serial.println("   1. ESP32 danificado - considere trocar a placa");
    Serial.println("   2. Problema na protoboard");
    Serial.println("   3. Curto-circuito nas conexões");
  } else if (gpio5_ok) {
    Serial.println("✅ GPIO5 (D4) está funcionando!");
    Serial.println("   Se a válvula não aciona, verifique:");
    Serial.println("   1. Conexão física entre D4 e protoboard");
    Serial.println("   2. Jumper MARROM está bem conectado");
    Serial.println("   3. Resistor de 100Ω e MOSFET");
  }
  Serial.println();
  
  // Retornar JSON com todos os resultados
  String result = "{\"type\":\"gpio_diagnostic\",\"results\":{";
  result += "\"gpio5_valve\":" + String(gpio5_ok ? "true" : "false");
  result += ",\"gpio4_alt\":" + String(gpio4_ok ? "true" : "false");
  result += ",\"gpio21_led\":" + String(gpio21_ok ? "true" : "false");
  result += ",\"gpio6_sensor\":" + String(gpio6_ok ? "true" : "false");
  result += "},\"recommendation\":\"";
  
  if (!gpio5_ok && gpio4_ok) {
    result += "Use GPIO4 instead of GPIO5";
  } else if (!gpio5_ok && !gpio4_ok) {
    result += "Check ESP32 or replace board";
  } else {
    result += "GPIOs OK - check physical connections";
  }
  result += "\"}";
  
  return result;
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
 * 3. Obter configurações:
 *    {"action":"get_settings"}
 * 
 * 4. Dispensar 300ml x 1 copo:
 *    {"action":"release_drink","orderId":"TEST-001","mlPerUnit":300,"quantity":1,"sizeLabel":"Pequeno"}
 * 
 * 5. Dispensar 500ml x 2 copos:
 *    {"action":"release_drink","orderId":"TEST-002","mlPerUnit":500,"quantity":2,"sizeLabel":"Médio"}
 * 
 * 6. Parar dispensação:
 *    {"action":"stop"}
 * 
 * 7. Testar válvula (abre por 2 segundos):
 *    {"action":"test_valve","duration":2000}
 * 
 * 8. Testar sensor de fluxo (5 segundos - abra água manualmente):
 *    {"action":"test_flow","duration":5000}
 * 
 * 9. Calibração (abre válvula e conta pulsos):
 *    {"action":"calibrate","duration":5000}
 * 
 * 10. Salvar calibração:
 *     {"action":"save_calibration","pulsos_por_litro":450,"ml_por_segundo":50}
 * 
 * 11. Info do Access Point WiFi:
 *     {"action":"wifi_info"}
 * 
 * 12. Diagnóstico de GPIO (verificar se pino funciona):
 *     {"action":"diagnose_gpio"}
 * 
 * ============================================================================
 */
