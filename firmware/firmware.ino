/*
 * ============================================================================
 * ESP32-S3 Drink Dispenser Controller - Versão 2.1
 * ============================================================================
 * 
 * DESCRIÇÃO:
 * Este firmware controla um dispensador de bebidas com válvula solenóide
 * e sensor de fluxo. Compatível com o Open Kiosk App.
 * 
 * COMUNICAÇÃO SUPORTADA:
 * - WiFi (HTTP REST API com WiFi Manager) ✅ ATIVADO
 * - Bluetooth Low Energy (BLE) ✅ ATIVADO
 * - USB Serial (para testes e debug) ✅ ATIVADO
 * - mDNS: http://openkiosk.local ✅ ATIVADO
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
 * VERSÃO: 2.1 (WiFi Manager + NVS + mDNS)
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
#include <WiFiManager.h>       // WiFi Manager - Portal AP para configurar WiFi
#include <Preferences.h>       // NVS - Salvar configurações na flash
#include <ESPmDNS.h>           // mDNS - Acessar via openkiosk.local
// NOTA: BLE2902 removido - deprecated no ESP32 Core 3.x (NimBLE adiciona automaticamente)

// ============================================================================
// ⚙️ CONFIGURAÇÕES - AJUSTE CONFORME SUA NECESSIDADE
// ============================================================================

// ----- WIFI MANAGER -----
// O ESP32 cria um Access Point para configurar o WiFi via celular
const char* AP_NAME = "OpenKiosk-Setup";  // Nome do AP de configuração
const int AP_TIMEOUT = 180;               // Timeout do portal em segundos (3 min)

// ----- MDNS -----
const char* MDNS_HOSTNAME = "openkiosk";  // Acessar via http://openkiosk.local

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
const char* BLE_DEVICE_NAME = "OpenKiosk-ESP32";  // Nome do dispositivo BLE

// UUIDs para BLE (padrão do Open Kiosk)
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ----- VERSÃO DO FIRMWARE -----
const char* FIRMWARE_VERSION = "2.1.0";

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

// Novas funções v2.1
void loadSettings();
void saveSettings();
String handleSaveCalibration(JsonDocument& doc);
String handleResetWifi();
String handleGetSettings();
String handleStartWifiPortal();
String handleDiagnoseGPIO();  // Diagnóstico de GPIO para debugging



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
// INICIALIZAÇÃO WIFI (com WiFi Manager - NÃO BLOQUEANTE)
// ============================================================================

void initWiFi() {
  // Criar instância do WiFi Manager
  WiFiManager wifiManager;
  
  // Configurações do portal - TIMEOUT CURTO para não bloquear
  wifiManager.setConfigPortalTimeout(30);  // Apenas 30 segundos no modo AP inicial
  wifiManager.setConnectTimeout(10);       // 10 segundos para tentar conectar
  
  // Modo não-bloqueante: se não tiver WiFi salvo, NÃO abre portal
  // O usuário pode resetar via comando para configurar
  wifiManager.setEnableConfigPortal(false);  // Desabilita portal automático
  
  Serial.println("  → Tentando conectar ao WiFi salvo...");
  
  // autoConnect com portal desabilitado: apenas tenta conectar ao WiFi salvo
  if (wifiManager.autoConnect(AP_NAME)) {
    // Conexão bem sucedida!
    Serial.println("[WIFI] ✅ Conectado!");
    Serial.println("  → IP: " + WiFi.localIP().toString());
    Serial.println("  → RSSI: " + String(WiFi.RSSI()) + " dBm");
    
    // Iniciar mDNS
    if (MDNS.begin(MDNS_HOSTNAME)) {
      MDNS.addService("http", "tcp", 80);
      MDNS.addService("openkiosk", "tcp", 80);
      Serial.println("  → mDNS: http://" + String(MDNS_HOSTNAME) + ".local");
    } else {
      Serial.println("  → mDNS: Falha ao iniciar");
    }
  } else {
    Serial.println("[WIFI] ⚠️ Sem WiFi configurado");
    Serial.println("  → Use {\"action\":\"start_wifi_portal\"} para configurar");
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
    doc["device"] = "OpenKiosk-ESP32";
    doc["type"] = "drink-dispenser";
    doc["version"] = FIRMWARE_VERSION;
    doc["ip"] = WiFi.localIP().toString();
    doc["mac"] = WiFi.macAddress();
    doc["hostname"] = String(MDNS_HOSTNAME) + ".local";
    doc["status"] = isDispensing ? "dispensing" : "ready";
    doc["ble_name"] = BLE_DEVICE_NAME;
    doc["uptime"] = millis();
    doc["rssi"] = WiFi.RSSI();
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });
  
  // Rota raiz
  server.on("/", HTTP_GET, []() {
    String html = "<html><head><title>OpenKiosk Dispenser</title>";
    html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
    html += "<style>body{font-family:Arial;text-align:center;padding:20px;background:#f0f0f0;}";
    html += ".card{background:white;border-radius:10px;padding:20px;max-width:400px;margin:auto;box-shadow:0 2px 10px rgba(0,0,0,0.1);}";
    html += ".status{color:green;font-weight:bold;}</style></head>";
    html += "<body><div class='card'>";
    html += "<h1>🍺 OpenKiosk Dispenser</h1>";
    html += "<p>Status: <span class='status'>Online</span></p>";
    html += "<p>🌐 IP: " + WiFi.localIP().toString() + "</p>";
    html += "<p>🏠 mDNS: http://" + String(MDNS_HOSTNAME) + ".local</p>";
    html += "<p>⏱️ Uptime: " + String(millis() / 1000) + " segundos</p>";
    html += "<p>📡 RSSI: " + String(WiFi.RSSI()) + " dBm</p>";
    html += "<hr><p>Firmware v" + String(FIRMWARE_VERSION) + "</p>";
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
  
  // ----- AÇÃO: INICIAR PORTAL WiFi -----
  else if (strcmp(action, "start_wifi_portal") == 0) {
    return handleStartWifiPortal();
  }
  
  // ----- AÇÃO: RESETAR WIFI -----
  else if (strcmp(action, "reset_wifi") == 0) {
    return handleResetWifi();
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
  float mlFromSensor = pulseCount * (1000.0 / pulsosPorLitro);
  
  // Calcular ml baseado no tempo (backup)
  unsigned long elapsedMs = millis() - dispensingStartTime;
  float mlFromTime = (elapsedMs / 1000.0) * mlPorSegundo;
  
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
  doc["wifi_ssid"] = WiFi.SSID();
  doc["wifi_ip"] = WiFi.localIP().toString();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["mdns_hostname"] = String(MDNS_HOSTNAME) + ".local";
  doc["ble_name"] = BLE_DEVICE_NAME;
  doc["uptime_ms"] = millis();
  
  String json;
  serializeJson(doc, json);
  return json;
}

// Handler: Resetar WiFi (apaga credenciais salvas)
String handleResetWifi() {
  Serial.println("[WIFI] ⚠️ Resetando credenciais WiFi...");
  
  // Resetar WiFi Manager settings
  WiFiManager wifiManager;
  wifiManager.resetSettings();
  
  Serial.println("[WIFI] ✅ Credenciais apagadas!");
  Serial.println("[WIFI] Use {\"action\":\"start_wifi_portal\"} ou reinicie o ESP32");
  
  return "{\"type\":\"success\",\"message\":\"WiFi resetado. Use start_wifi_portal para configurar nova rede.\"}";
}

// Handler: Iniciar portal de configuração WiFi
String handleStartWifiPortal() {
  Serial.println();
  Serial.println("╔════════════════════════════════════════╗");
  Serial.println("║     INICIANDO PORTAL WiFi...           ║");
  Serial.println("╠════════════════════════════════════════╣");
  Serial.println("║ 1. Conecte seu celular à rede:         ║");
  Serial.println("║    → " + String(AP_NAME) + "                  ║");
  Serial.println("║ 2. Abra o navegador                    ║");
  Serial.println("║ 3. Acesse: 192.168.4.1                 ║");
  Serial.println("║ 4. Selecione sua rede WiFi             ║");
  Serial.println("║                                        ║");
  Serial.println("║ ⚠️  O sistema ficará BLOQUEADO por     ║");
  Serial.println("║    até 3 minutos durante a config.     ║");
  Serial.println("╚════════════════════════════════════════╝");
  Serial.println();
  
  // LED piscando rápido = modo AP
  for (int i = 0; i < 5; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    delay(100);
  }
  
  // Criar WiFi Manager e iniciar portal
  WiFiManager wifiManager;
  wifiManager.setConfigPortalTimeout(180);  // 3 minutos
  
  // Iniciar portal de configuração (BLOQUEANTE)
  bool connected = wifiManager.startConfigPortal(AP_NAME);
  
  if (connected) {
    Serial.println("[WIFI] ✅ Conectado!");
    Serial.println("  → IP: " + WiFi.localIP().toString());
    
    // Iniciar mDNS se não estiver rodando
    if (MDNS.begin(MDNS_HOSTNAME)) {
      MDNS.addService("http", "tcp", 80);
      Serial.println("  → mDNS: http://" + String(MDNS_HOSTNAME) + ".local");
    }
    
    // Iniciar servidor HTTP se não estiver rodando
    initHTTPServer();
    
    return "{\"type\":\"success\",\"message\":\"WiFi configurado com sucesso!\",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
  } else {
    Serial.println("[WIFI] ❌ Portal fechado sem configurar WiFi");
    return "{\"type\":\"error\",\"code\":\"PORTAL_TIMEOUT\",\"message\":\"Portal fechado. WiFi não configurado.\"}";
  }
}

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
 * 11. Iniciar portal WiFi (BLOQUEANTE - para configurar rede):
 *     {"action":"start_wifi_portal"}
 * 
 * 12. Resetar WiFi (apaga credenciais salvas):
 *     {"action":"reset_wifi"}
 * 
 * 13. Diagnóstico de GPIO (verificar se pino funciona):
 *     {"action":"diagnose_gpio"}
 * 
 * ============================================================================
 */
