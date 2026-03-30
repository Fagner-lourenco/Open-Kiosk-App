/*
 * ============================================================================
 * ESP32-S3 Drink Dispenser Controller - Versão 4.0 (Multi-Tap)
 * ============================================================================
 * 
 * DESCRIÇÃO:
 * Este firmware controla um dispensador de bebidas com válvula solenóide
 * e sensor de fluxo. Compatível com o Open Kiosk App.
 * 
 * 🆕 VERSÃO 4.0 - MULTI-TAP:
 * - Suporte a 2 torneiras independentes por ESP32
 * - Calibração individual por torneira (NVS)
 * - LED compartilhado com padrões diferentes por tap
 * - BLE aberto (PIN removido na v4.1.3)
 * - Retrocompatível: tapId opcional (default = 0)
 * 
 * COMUNICAÇÃO SUPORTADA:
 * - WiFi Access Point fixo (Kiosk_Bier) ✅ ATIVADO
 * - HTTP REST API (192.168.4.1) ✅ ATIVADO
 * - Bluetooth Low Energy (BLE) ✅ ATIVADO (aberto, sem PIN)
 * - USB Serial (para testes e debug) ✅ ATIVADO
 * - mDNS: http://kiosk-bier.local ✅ ATIVADO
 * 
 * HARDWARE NECESSÁRIO:
 * - ESP32-S3 DevKit ou XIAO ESP32S3
 * - 2x Módulo Relé 5V (para controlar as válvulas)
 * - 2x Válvula Solenóide 12V (controle de fluxo)
 * - 2x Sensor de Fluxo (medir volume) — calibrar empiricamente
 * - Fonte 12V 2A (alimentar as válvulas)
 * - LED indicador (GPIO21 = USER_LED interno) - COMPARTILHADO
 * 
 * CONEXÕES (XIAO ESP32S3 - MULTI-TAP):
 * ────────────────────────────────────────────────────────
 * │ ⚠️ MAPEAMENTO OFICIAL XIAO ESP32S3:                  │
 * │   D2=GPIO3, D3=GPIO4, D4=GPIO5, D5=GPIO6             │
 * │   D6=TX(GPIO43), D7=RX(GPIO44) - NÃO USAR!           │
 * │   USER_LED interno = GPIO21                          │
 * ├──────────────────────────────────────────────────────┤
 * │ Tap 0 (Torneira 1) - Conectores PCB                  │
 * │   GPIO 5 (D4):  CARGA1 - Válvula 0 (via relé)        │
 * │   GPIO 3 (D2):  SENSOR1 - Sensor de fluxo 0          │
 * ├──────────────────────────────────────────────────────┤
 * │ Tap 1 (Torneira 2) - Conectores PCB                  │
 * │   GPIO 6 (D5):  CARGA2 - Válvula 1 (via relé)        │
 * │   GPIO 4 (D3):  SENSOR2 - Sensor de fluxo 1          │
 * ├──────────────────────────────────────────────────────┤
 * │ Compartilhado                                        │
 * │   GPIO21: LED indicador (USER_LED interno)           │
 * ────────────────────────────────────────────────────────
 * 
 * 🔴 PADRÕES DE LED PARA DEBUG:
 * ────────────────────────────────────────────────────────
 * 2 piscadas      = Pinos configurados OK
 * 3 piscadas      = Bluetooth iniciado OK
 * 5 piscadas      = Sistema PRONTO (pode receber comandos)
 * Piscando lento  = Tap 0 dispensando
 * Piscando rápido = Tap 1 dispensando
 * Aceso 1 segundo = Copo concluído com sucesso
 * 3 piscadas longo= Pedido completamente finalizado
 * 5 piscadas rápidas = ERRO - Timeout na dispensação
 * ────────────────────────────────────────────────────────
 * 
 * AUTOR: Open Kiosk Project
 * DATA: 20/01/2026
 * VERSÃO: 4.1.4 (Multi-Tap)
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
#include <BLESecurity.h>       // Para BLESecurity e segurança BLE
#ifdef CONFIG_NIMBLE_ENABLED
  #include <host/ble_gap.h>    // Para ble_gap_conn_desc (NimBLE)
#endif
// WiFiManager REMOVIDO - Agora usa Access Point fixo (Kiosk_Bier)
#include <Preferences.h>       // NVS - Salvar configurações na flash
#include <ESPmDNS.h>           // mDNS - Acessar via kiosk-bier.local
#include <esp_task_wdt.h>      // Watchdog Timer para segurança
// NOTA: BLE2902 removido - deprecated no ESP32 Core 3.x (NimBLE adiciona automaticamente)
#include <Update.h>            // v4.1.0: OTA firmware update

// ============================================================================
// ⚙️ CONFIGURAÇÕES - AJUSTE CONFORME SUA NECESSIDADE
// ============================================================================

// ----- WIFI ACCESS POINT (MODO SERVIDOR LOCAL) -----
// O ESP32 cria uma rede WiFi própria para o Kiosk se conectar
// Não depende de roteador externo - funciona offline
const char* AP_SSID = "Kiosk_Bier";       // Nome da rede WiFi do Kiosk
const char* AP_PASSWORD = "bier2026";     // Senha da rede WiFi (HARDCODED - NÃO ALTERAR)
// IP padrão do Access Point: 192.168.4.1 (fixo do ESP32)

// ----- MDNS -----
const char* MDNS_HOSTNAME = "kiosk-bier";  // Acessar via http://kiosk-bier.local

// ----- CONFIGURAÇÃO MULTI-TAP -----
// Número de torneiras suportadas por este ESP32
const int NUM_TAPS = 2;

// ----- PINOS DO HARDWARE (MULTI-TAP) -----
// XIAO ESP32S3: Pinos D2=GPIO3, D3=GPIO4, D4=GPIO5, D5=GPIO6
// PCB Sinais: SENSOR1, SENSOR2, CARGA1, CARGA2
// 
// Tap 0 (Torneira 1) - Conectores SENSOR1 e CARGA1
const int VALVE_PIN_0 = 5;        // GPIO5 (D4) = CARGA1 - Válvula/Relé
const int FLOW_SENSOR_PIN_0 = 3;  // GPIO3 (D2) = SENSOR1 - Sensor de fluxo
//
// Tap 1 (Torneira 2) - Conectores SENSOR2 e CARGA2
const int VALVE_PIN_1 = 6;        // GPIO6 (D5) = CARGA2 - Válvula/Relé
const int FLOW_SENSOR_PIN_1 = 4;  // GPIO4 (D3) = SENSOR2 - Sensor de fluxo
//
// LED compartilhado
// XIAO ESP32S3: GPIO21 = USER_LED interno da placa
// Se usar LED externo no D10, mudar para GPIO10
const int LED_PIN = 21;           // GPIO21 = USER_LED interno do XIAO

// Aliases para retrocompatibilidade (aponta para Tap 0)
#define VALVE_PIN VALVE_PIN_0
#define FLOW_SENSOR_PIN FLOW_SENSOR_PIN_0

// ----- CALIBRAÇÃO DO SENSOR DE FLUXO (valores padrão) -----
// Estes valores podem ser alterados e salvos via NVS por torneira
// ⚠️ Valor provisório para calibração empírica. NÃO usar valores de catálogo cegamente.
// Calibre na linha real: pulsos_por_litro = pulsos_contados / (ml_real / 1000)
const float DEFAULT_PULSOS_POR_LITRO = 660.0;  // Valor inicial provisório — calibrar na linha real
const float DEFAULT_ML_POR_SEGUNDO = 50.0;      // Vazão média da válvula em ml/s

// ----- BLUETOOTH -----
const char* BLE_DEVICE_NAME = "Kiosk_Bier";  // Nome do dispositivo BLE (igual ao WiFi)
// NOTA: BLE aberto (sem PIN) desde v4.1.3 — PIN removido

// UUIDs para BLE (padrão do Open Kiosk)
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ----- VERSÃO DO FIRMWARE -----
const char* FIRMWARE_VERSION = "4.1.4";  // FIX: Pinos NVS em initTaps, referências de sensor, diagnóstico GPIO

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
volatile int connectedCount = 0;
int oldConnectedCount = 0;

// ============================================================================
// 🆕 ESTRUTURAS MULTI-TAP
// ============================================================================

// Configuração de cada torneira (pinos + calibração)
struct TapConfig {
  int valvePin;
  int sensorPin;
  float pulsosPorLitro;
  float mlPorSegundo;
};

// 🆕 v4.0.6: Fases da máquina de estados para dispensação não-bloqueante
enum TapPhase {
  TAP_PHASE_IDLE,           // Aguardando comando
  TAP_PHASE_DISPENSING,     // Dispensando bebida
  TAP_PHASE_LED_SUCCESS,    // LED aceso indicando sucesso (1s)
  TAP_PHASE_WAIT_NEXT_CUP,  // Piscando LED entre copos (2s)
  TAP_PHASE_COMPLETE_BLINK, // Piscando LED final (3 piscadas)
  TAP_PHASE_DONE            // Finalizado, voltar para IDLE
};

// Estado de cada torneira durante dispensação
struct TapState {
  bool isDispensing;
  String orderId;
  volatile unsigned long pulseCount;
  float mlDispensed;
  unsigned long lastPulseTime;
  unsigned long dispensingStartTime;
  unsigned long firstPulseTime;
  bool flowStarted;
  int currentCup;
  int totalCups;
  int targetMl;
  // 🆕 Ajuste 1: Status update por tap (evita conflito entre taps)
  unsigned long lastStatusUpdate;
  // 🆕 Ajuste 2: Timeout por tap (permite calibração por torneira)
  unsigned long sessionTimeoutMs;
  // 🆕 v4.0.6: Máquina de estados não-bloqueante
  TapPhase phase;
  unsigned long phaseStartTime;
  int blinkCount;
};

// Arrays para as torneiras
TapConfig tapConfig[NUM_TAPS];
TapState tapState[NUM_TAPS];

// ----- Variáveis de compatibilidade (legado - usadas em algumas funções) -----
// NOTA: Mantidas para retrocompatibilidade com código existente
volatile unsigned long pulseCount = 0;  // Alias para tap 0
float totalMlDispensed = 0;
unsigned long lastPulseTime = 0;
bool isDispensing = false;
String currentOrderId = "";
int currentCup = 0;
int totalCups = 0;
int targetMl = 0;
unsigned long dispensingStartTime = 0;
unsigned long firstPulseTime = 0;
bool flowStarted = false;

// ----- Timing -----
// NOTA: lastStatusUpdate movido para TapState (por tap)
unsigned long lastHeartbeat = 0;

// ----- Timeout de Segurança (Torneira Manual) -----
// 🔧 v4.0.6: Reduzido de 5 minutos para 2 minutos
// Evita bloqueio prolongado da torneira em caso de abandono
const unsigned long SESSION_TIMEOUT_MS = 120000;  // 2 minutos (120 segundos)
// Timeout após o fluxo parar (sensor parou de detectar pulsos)
// 🔧 v4.1.4: Aumentado de 30s para 60s — chopp artesanal pode ter pausas prolongadas
// (espuma, bolha de ar, queda momentânea de pressão na linha, troca de barril)
const unsigned long NO_FLOW_TIMEOUT_MS = 60000;   // 60 segundos sem pulsos após iniciar

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
String handleStopTap(int tapId);
String handleTestValve(int durationMs);
String handleTestValveTap(int tapId, int durationMs);
String handleTestFlow(int durationMs, int tapId = 0);  // 🆕 Multi-Tap: tapId opcional
String handleCalibration(int durationMs, int tapId = 0);  // 🆕 Multi-Tap: tapId opcional
String getStatusJson();

// 🆕 ISRs para Multi-Tap (uma por sensor)
void IRAM_ATTR flowPulseCounter0();
void IRAM_ATTR flowPulseCounter1();

// 🆕 Funções Multi-Tap v4.0
void initTaps();
void openValveTap(int tapId);
void closeValveTap(int tapId);
void processDispensingTap(int tapId);
String handleGetTaps();
// handleReleaseDrinkTap removida: nunca implementada, handleReleaseDrink é a função real
void sendStatusTap(int tapId, const char* orderId, const char* stage, String message);
void sendProgressTap(int tapId, const char* orderId, int cup, int totalCupsCount, float mlDispensed, int target, int percent, bool flowStartedFlag, int elapsedSec, int remainingSec);

// Funções v3.0
void loadSettings();
void saveSettings();
String handleSaveCalibration(JsonDocument& doc);
String handleGetSettings();
String handleWifiInfo();
String handleDiagnoseGPIO();  // Diagnóstico de GPIO para debugging
// handleResetWifi e handleStartWifiPortal REMOVIDOS - Access Point fixo

// v4.1.0: set_config (dynamic pin assignment from Admin/Kiosk)
String handleSetConfig(JsonDocument& doc);
void applyTapPins();  // Re-attach interrupts after pin change

// v4.1.0: OTA
bool otaEnabled = true;  // Can be disabled via NVS flag
String otaUsername = "admin";
String otaPassword = "kiosk2026";
void initOTA();



// ============================================================================
// CALLBACKS BLUETOOTH
// ============================================================================

// Callback quando um cliente BLE conecta/desconecta
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    connectedCount++;
    Serial.println("[BLE] Cliente conectado! Total: " + String(connectedCount));

    // 🔧 FIX v4.1.1: Solicitar connection parameters otimizados para energia
    // Isso evita que Android/MIUI classifique a conexão como "alto consumo" e a mate.
    // Parâmetros: minInterval=80(100ms), maxInterval=160(200ms), latency=4, timeout=600(6s)
#ifdef CONFIG_NIMBLE_ENABLED
    struct ble_gap_conn_desc desc;
    int rc = ble_gap_conn_find(0, &desc);
    if (rc == 0) {
      Serial.printf("[BLE] conn_interval=%d (%.1fms) latency=%d supervision=%d (%dms)\n",
        desc.conn_itvl, desc.conn_itvl * 1.25,
        desc.conn_latency,
        desc.supervision_timeout, desc.supervision_timeout * 10);
      
      // NOTA v4.1.2: ble_gap_update_params() removido.
      // Solicitar conn params imediatamente em onConnect() causa rejeição
      // instantânea pelo Android/MIUI (disconnect no mesmo segundo).
      // A correção real é via otimização de bateria no Android app.
    }
#endif

    server->startAdvertising();  // keep advertising to allow multiple clients
  }

  void onDisconnect(BLEServer* server) override {
    if (connectedCount > 0) {
      connectedCount--;
    }
    
    // 🔧 FIX v4.1.1: Logar desconexão com uptime
    Serial.printf("[BLE] Desconectado! uptime=%lums Total=%d\n", millis(), connectedCount);

#ifdef CONFIG_NIMBLE_ENABLED
    // Tentar ler conn params do último peer para diagnóstico
    struct ble_gap_conn_desc desc;
    int rc = ble_gap_conn_find(0, &desc);
    if (rc == 0) {
      Serial.printf("[BLE] Último peer: interval=%d latency=%d timeout=%d\n",
        desc.conn_itvl, desc.conn_latency, desc.supervision_timeout);
    }
#endif

    server->startAdvertising();  // resume advertising after disconnect
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

// NOTA: Classe MySecurity removida na v4.1.3 — BLE agora usa conexão aberta sem PIN.

// ============================================================================
// INTERRUPÇÕES DOS SENSORES DE FLUXO (MULTI-TAP)
// ============================================================================
// 🔧 CORREÇÃO v4.0.1: ISRs simplificadas como na v2.1 que funcionava
// - Variáveis globais simples (não struct)
// - Sem portENTER_CRITICAL_ISR (causa problemas)
// - Operações atômicas naturais

// Variáveis globais SIMPLES para ISR (como na v2.1 que funcionava)
volatile unsigned long isr_pulseCount0 = 0;
volatile unsigned long isr_lastPulseTime0 = 0;
volatile unsigned long isr_pulseCount1 = 0;
volatile unsigned long isr_lastPulseTime1 = 0;

// ISR para Tap 0 (Torneira 1) - SIMPLIFICADO como v2.1
void IRAM_ATTR flowPulseCounter0() {
  isr_pulseCount0++;
  isr_lastPulseTime0 = millis();
}

// ISR para Tap 1 (Torneira 2) - SIMPLIFICADO como v2.1
void IRAM_ATTR flowPulseCounter1() {
  isr_pulseCount1++;
  isr_lastPulseTime1 = millis();
}

// 🔧 Função para sincronizar contadores da ISR para tapState
// Chamada no loop principal (FORA da ISR, seguro)
void syncPulseCounters() {
  noInterrupts();
  tapState[0].pulseCount = isr_pulseCount0;
  tapState[0].lastPulseTime = isr_lastPulseTime0;
  tapState[1].pulseCount = isr_pulseCount1;
  tapState[1].lastPulseTime = isr_lastPulseTime1;
  // Compatibilidade legada
  pulseCount = isr_pulseCount0;
  lastPulseTime = isr_lastPulseTime0;
  interrupts();
}

// 🔧 Função para zerar contador de um tap
void resetPulseCounter(int tapId) {
  noInterrupts();
  if (tapId == 0) {
    isr_pulseCount0 = 0;
    isr_lastPulseTime0 = 0;
  } else if (tapId == 1) {
    isr_pulseCount1 = 0;
    isr_lastPulseTime1 = 0;
  }
  interrupts();
  syncPulseCounters();
}

// ============================================================================
// INICIALIZAÇÃO DAS TORNEIRAS (MULTI-TAP)
// ============================================================================

void initTaps() {
  Serial.println("[INIT] Configurando " + String(NUM_TAPS) + " torneiras...");
  
  // ----- Tap 0 (Torneira 1) -----
  // 🔧 NÃO sobrescrever pinos nem calibração — loadSettings() já carregou do NVS
  
  tapState[0].isDispensing = false;
  tapState[0].orderId = "";
  tapState[0].pulseCount = 0;
  tapState[0].mlDispensed = 0;
  tapState[0].lastPulseTime = 0;
  tapState[0].dispensingStartTime = 0;
  tapState[0].firstPulseTime = 0;
  tapState[0].flowStarted = false;
  tapState[0].currentCup = 0;
  tapState[0].totalCups = 0;
  tapState[0].targetMl = 0;
  tapState[0].lastStatusUpdate = 0;  // 🆕 Por tap
  tapState[0].sessionTimeoutMs = SESSION_TIMEOUT_MS;  // 🆕 Timeout por tap
  // 🆕 v4.0.6: Máquina de estados não-bloqueante
  tapState[0].phase = TAP_PHASE_IDLE;
  tapState[0].phaseStartTime = 0;
  tapState[0].blinkCount = 0;
  
  pinMode(tapConfig[0].valvePin, OUTPUT);
  digitalWrite(tapConfig[0].valvePin, LOW);
  pinMode(tapConfig[0].sensorPin, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(tapConfig[0].sensorPin), flowPulseCounter0, FALLING);
  Serial.println("  → Tap 0: Válvula GPIO" + String(tapConfig[0].valvePin) + ", Sensor GPIO" + String(tapConfig[0].sensorPin));
  Serial.println("    Calibração: " + String(tapConfig[0].pulsosPorLitro) + " pulsos/L");
  
  // ----- Tap 1 (Torneira 2) -----
  // 🔧 NÃO sobrescrever pinos nem calibração — loadSettings() já carregou do NVS
  
  tapState[1].isDispensing = false;
  tapState[1].orderId = "";
  tapState[1].pulseCount = 0;
  tapState[1].mlDispensed = 0;
  tapState[1].lastPulseTime = 0;
  tapState[1].dispensingStartTime = 0;
  tapState[1].firstPulseTime = 0;
  tapState[1].flowStarted = false;
  tapState[1].currentCup = 0;
  tapState[1].totalCups = 0;
  tapState[1].targetMl = 0;
  tapState[1].lastStatusUpdate = 0;  // 🆕 Por tap
  tapState[1].sessionTimeoutMs = SESSION_TIMEOUT_MS;  // 🆕 Timeout por tap
  // 🆕 v4.0.6: Máquina de estados não-bloqueante
  tapState[1].phase = TAP_PHASE_IDLE;
  tapState[1].phaseStartTime = 0;
  tapState[1].blinkCount = 0;
  
  pinMode(tapConfig[1].valvePin, OUTPUT);
  digitalWrite(tapConfig[1].valvePin, LOW);
  pinMode(tapConfig[1].sensorPin, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(tapConfig[1].sensorPin), flowPulseCounter1, FALLING);
  Serial.println("  → Tap 1: Válvula GPIO" + String(tapConfig[1].valvePin) + ", Sensor GPIO" + String(tapConfig[1].sensorPin));
  
  Serial.println("[INIT] ✅ Torneiras configuradas!");
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
  Serial.println("Open Kiosk Project - MULTI-TAP");
  Serial.println("=====================================");
  Serial.println();
  
  // ----- Carregar configurações do NVS -----
  Serial.println("[INIT] Carregando configurações do NVS...");
  preferences.begin("openkiosk", false);
  loadSettings();  // Carrega calibração para cada tap
  
  // 🟡 FASE 1: Configurar Torneiras (Multi-Tap)
  Serial.println("[INIT] FASE 1: Configurando torneiras...");
  digitalWrite(LED_PIN, HIGH);  // LED ACESO
  delay(200);
  
  initTaps();  // Configura pinos e interrupções para todas as torneiras
  
  Serial.println("  → LED (GPIO " + String(LED_PIN) + "): OK");
  
  // 🟡 FASE 1 Concluída: piscar 2x
  Serial.println("[INIT] ✅ Torneiras OK!");
  for (int i = 0; i < 2; i++) {
    digitalWrite(LED_PIN, LOW);
    delay(150);
    digitalWrite(LED_PIN, HIGH);
    delay(150);
  }
  digitalWrite(LED_PIN, LOW);
  delay(300);
  
  // 🟡 FASE 2: Iniciar Bluetooth com segurança
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
  Serial.println("[INIT] ✅ Bluetooth OK (conexão aberta)!");
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
  Serial.println("[INIT] Sistema MULTI-TAP pronto!");
  Serial.println("[INIT] Torneiras: " + String(NUM_TAPS));
  Serial.println("[INIT] Aguardando comandos via USB, WiFi ou BLE");
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
  
  // 🆕 Ajuste 4: Watchdog de segurança (10 segundos)
  // Se o loop travar por mais de 10s, o ESP32 reinicia automaticamente
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = 10000,           // 10 segundos
    .idle_core_mask = (1 << 0),    // Core 0
    .trigger_panic = true          // Reinicia se travar
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);       // Adiciona a task atual ao watchdog
  Serial.println("[INIT] ✅ Watchdog configurado (10s)");
  
  // Enviar status inicial
  sendStatus("", "ready", "ESP32-S3 pronto para receber pedidos via USB e Bluetooth");
}

// ============================================================================
// LOOP PRINCIPAL - EXECUTA CONTINUAMENTE
// ============================================================================

void loop() {
  // 🆕 Reset do watchdog (indica que o loop está funcionando)
  esp_task_wdt_reset();
  
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
  
  // ----- Sincronizar contadores de pulso das ISRs -----
  // 🔧 CORREÇÃO v4.0.1: Copiar valores das ISRs para tapState
  syncPulseCounters();
  
  // ----- Gerenciar conexão Bluetooth -----
  // Reconectar se desconectou
  if (connectedCount == 0 && oldConnectedCount > 0) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("[BLE] Aguardando nova conexão...");
    oldConnectedCount = connectedCount;
  }
  if (connectedCount > 0 && oldConnectedCount == 0) {
    oldConnectedCount = connectedCount;
  }
  
  // ----- Processar dispensação em andamento (Multi-Tap) -----
  bool anyDispensing = false;
  for (int i = 0; i < NUM_TAPS; i++) {
    if (tapState[i].isDispensing) {
      processDispensingTap(i);
      anyDispensing = true;
    }
  }
  // Atualizar flag global para compatibilidade
  isDispensing = anyDispensing;
  
  // ----- Heartbeat do LED -----
  if (!anyDispensing && millis() - lastHeartbeat > 2000) {
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
  
  // 🆕 Handler OPTIONS para /taps (Multi-Tap)
  server.on("/taps", HTTP_OPTIONS, []() {
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
  
  // 🆕 Rota: Status de todas as torneiras (Multi-Tap)
  server.on("/taps", HTTP_GET, []() {
    sendCORSHeaders();
    String response = handleGetTaps();
    server.send(200, "application/json", response);
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
    doc["num_taps"] = NUM_TAPS;  // 🆕 Número de torneiras
    doc["status"] = isDispensing ? "dispensing" : "ready";
    doc["ble_name"] = BLE_DEVICE_NAME;
    doc["ble_open"] = true;  // BLE aberto (sem PIN desde v4.1.3)
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
    html += ".tap{background:#e8f5e9;padding:10px;border-radius:5px;margin:5px 0;}";
    html += ".tap.busy{background:#fff3e0;}";
    html += ".info{background:#f8f9fa;padding:15px;border-radius:8px;margin:15px 0;text-align:left;}";
    html += "h1{color:#2c3e50;margin-bottom:5px;}</style></head>";
    html += "<body><div class='card'>";
    html += "<h1>🍺 Kiosk Bier</h1>";
    html += "<p>Servidor Multi-Tap</p>";
    html += "<p>Status: <span class='status'>✅ Online</span></p>";
    html += "<div class='info'>";
    html += "<p><strong>🚿 Torneiras:</strong></p>";
    for (int i = 0; i < NUM_TAPS; i++) {
      String tapClass = tapState[i].isDispensing ? "tap busy" : "tap";
      String tapStatus = tapState[i].isDispensing ? "Dispensando" : "Livre";
      html += "<div class='" + tapClass + "'>Tap " + String(i) + ": " + tapStatus + "</div>";
    }
    html += "</div>";
    html += "<div class='info'>";
    html += "<p>📡 WiFi: " + String(AP_SSID) + "</p>";
    html += "<p>🔑 Senha WiFi: " + String(AP_PASSWORD) + "</p>";
    html += "<p>� BLE: Aberto (sem PIN)</p>";
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

  // 🔧 FIX v4.1.1: Registrar headers customizados ANTES de server.begin()
  // Sem isso, server.header("Content-Length") retorna "" sempre
  const char* collectHeader[] = {"Content-Length"};
  server.collectHeaders(collectHeader, 1);

  // Register OTA endpoint before server.begin()
  initOTA();

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
  doc["ble_connected"] = (connectedCount > 0);
  
  // Hardware — v4.1.0: show actual pin assignments (from NVS, not compile-time defaults)
  doc["led_pin"] = LED_PIN;
  doc["num_taps"] = NUM_TAPS;
  JsonArray statusTaps = doc["taps_config"].to<JsonArray>();
  for (int i = 0; i < NUM_TAPS; i++) {
    JsonObject tc = statusTaps.add<JsonObject>();
    tc["id"] = i;
    tc["valve_pin"] = tapConfig[i].valvePin;
    tc["sensor_pin"] = tapConfig[i].sensorPin;
    tc["pulsos_por_litro"] = tapConfig[i].pulsosPorLitro;
    tc["ml_por_segundo"] = tapConfig[i].mlPorSegundo;
    tc["is_dispensing"] = tapState[i].isDispensing;
  }
  
  // 🆕 Ajuste 3: Identificação do hardware (facilita suporte técnico)
  char chipId[18];
  uint64_t efuse = ESP.getEfuseMac();
  snprintf(chipId, sizeof(chipId), "%04X%08X", (uint16_t)(efuse >> 32), (uint32_t)efuse);
  doc["chip_id"] = chipId;
  doc["board"] = "XIAO_ESP32S3";
  doc["sdk_version"] = ESP.getSdkVersion();
  doc["cpu_freq_mhz"] = ESP.getCpuFreqMHz();
  doc["free_heap"] = ESP.getFreeHeap();
  
  // Calibração (tap 0 para retrocompatibilidade)
  doc["pulsos_por_litro"] = tapConfig[0].pulsosPorLitro;
  doc["ml_por_segundo"] = tapConfig[0].mlPorSegundo;
  
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
// INICIALIZAÇÃO BLUETOOTH (COM SEGURANÇA PIN)
// ============================================================================

void initBluetooth() {
  BLEDevice::init(BLE_DEVICE_NAME);
  
  // ✅ FIX v4.1.3: SEM configuração de segurança BLE.
  // A v4.1.2 e anteriores usavam ESP_LE_AUTH_REQ_SC_MITM_BOND + ESP_IO_CAP_OUT (Display Only).
  // Isso fazia o Android iniciar um fluxo de pairing com PIN; o BleClient.connect()
  // não trata esse fluxo, então o security procedure timeout expirava em ~28s,
  // gerando GATT_CONN_TERMINATE_LOCAL_HOST (status=22) + showUnbondMessage: reason: 9.
  // Para um kiosk com acesso físico controlado, conexão BLE aberta é segura e suficiente.
  
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
  
  Serial.println("[BLE] ✅ Bluetooth iniciado (sem pareamento)!");
  Serial.println("  → Nome: " + String(BLE_DEVICE_NAME));
  Serial.println("  → Conexão aberta, sem PIN/bonding (FIX v4.1.3)");
}

// ============================================================================
// PROCESSAMENTO DE COMANDOS
// ============================================================================

void processCommand(String jsonString) {
  String result = processCommandAndGetResult(jsonString);
  
  // Enviar via Serial (USB)
  Serial.println("[RESULT] " + result);
  
  // 🔧 CORREÇÃO v4.0.4: Enviar também via Bluetooth (se conectado)
  // Isso garante que o Android receba as respostas dos comandos
  if (connectedCount > 0 && pCharacteristic != NULL) {
    // 🔧 FIX: Adicionar \n para que o app reconheça linha completa
    String bleResult = result + "\n";
    pCharacteristic->setValue(bleResult.c_str());
    pCharacteristic->notify();
    Serial.println("[BLE] Resultado enviado (" + String(result.length()) + " bytes)");
  }
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
  
  // 🔧 FIX: Detectar JSON duplamente encapsulado
  // Ex: {"action":"{\"action\":\"ping\"}"} ao invés de {"action":"ping"}
  const char* action = doc["action"];
  if (action != nullptr && action[0] == '{') {
    Serial.println("[WARN] JSON duplamente encapsulado detectado, extraindo...");
    // O valor de action é outro JSON, re-parsear
    JsonDocument innerDoc;
    DeserializationError innerError = deserializeJson(innerDoc, action);
    if (!innerError) {
      // Usar o JSON interno
      return processCommandAndGetResult(String(action));
    }
  }
  
  if (action == nullptr) {
    return "{\"type\":\"error\",\"code\":\"NO_ACTION\",\"message\":\"Campo 'action' obrigatório\"}";
  }
  
  // ----- AÇÃO: PING -----
  if (strcmp(action, "ping") == 0) {
    return handlePing();
  }
  
  // ----- AÇÃO: DISPENSAR BEBIDA (com tapId opcional) -----
  else if (strcmp(action, "release_drink") == 0) {
    return handleReleaseDrink(doc);
  }
  
  // ----- AÇÃO: PARAR DISPENSAÇÃO -----
  else if (strcmp(action, "stop") == 0) {
    int tapId = doc["tapId"] | -1;  // -1 = parar todas
    if (tapId >= 0 && tapId < NUM_TAPS) {
      return handleStopTap(tapId);
    }
    return handleStop();  // Parar todas
  }
  
  // ----- AÇÃO: TESTAR VÁLVULA (com tapId opcional) -----
  else if (strcmp(action, "test_valve") == 0) {
    int duration = doc["duration"] | 1000;  // Padrão 1 segundo
    int tapId = doc["tapId"] | 0;  // Padrão tap 0
    return handleTestValveTap(tapId, duration);
  }
  
  // ----- AÇÃO: TESTAR SENSOR DE FLUXO (com tapId opcional) -----
  else if (strcmp(action, "test_flow") == 0) {
    int duration = doc["duration"] | 5000;  // Padrão 5 segundos
    int tapId = doc["tapId"] | 0;  // 🆕 Multi-Tap: suporte a tapId
    return handleTestFlow(duration, tapId);
  }
  
  // ----- AÇÃO: CALIBRAR -----
  else if (strcmp(action, "calibrate") == 0) {
    int duration = doc["duration"] | 5000;
    int tapId = doc["tapId"] | 0;  // 🆕 Multi-Tap: suporte a tapId
    return handleCalibration(duration, tapId);
  }
  
  // ----- AÇÃO: STATUS -----
  else if (strcmp(action, "status") == 0) {
    return getStatusJson();
  }
  
  // 🆕 ----- AÇÃO: STATUS DAS TORNEIRAS (MULTI-TAP) -----
  else if (strcmp(action, "get_taps") == 0) {
    return handleGetTaps();
  }
  
  // ----- AÇÃO: BEEP (feedback visual com LED) -----
  else if (strcmp(action, "beep") == 0) {
    int times = doc["times"] | 1;
    if (times > 20) times = 20;  // Limite seguro para evitar watchdog reset
    Serial.println("[BEEP] Piscando LED " + String(times) + " vez(es)");
    for (int i = 0; i < times; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(150);
      digitalWrite(LED_PIN, LOW);
      delay(150);
      esp_task_wdt_reset();
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

  // ----- AÇÃO: SET_CONFIG (v4.1.0 — dynamic pin + calibration from Admin/Kiosk) -----
  else if (strcmp(action, "set_config") == 0 || strcmp(action, "configure_taps") == 0) {
    return handleSetConfig(doc);
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
  
  // 🆕 Multi-Tap: Informar quantas torneiras existem
  doc["num_taps"] = NUM_TAPS;
  
  String response;
  serializeJson(doc, response);
  return response;
}

// ----- DISPENSAR BEBIDA (MULTI-TAP) -----
String handleReleaseDrink(JsonDocument& doc) {
  // 🆕 Pegar tapId (opcional, default = 0 para retrocompatibilidade)
  int tapId = doc["tapId"] | 0;
  
  // Validar tapId
  if (tapId < 0 || tapId >= NUM_TAPS) {
    return "{\"type\":\"error\",\"code\":\"INVALID_TAP\",\"message\":\"tapId deve ser entre 0 e " + String(NUM_TAPS - 1) + "\"}";
  }
  
  // Verificar se ESTA torneira já está dispensando
  if (tapState[tapId].isDispensing) {
    return "{\"type\":\"error\",\"code\":\"BUSY\",\"message\":\"Torneira " + String(tapId) + " ocupada com outro pedido\"}";
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
  
  // Configurar dispensação para este tap
  tapState[tapId].orderId = String(orderId);
  tapState[tapId].targetMl = mlPerUnit;
  tapState[tapId].totalCups = quantity;
  tapState[tapId].currentCup = 1;
  tapState[tapId].mlDispensed = 0;
  tapState[tapId].flowStarted = false;
  tapState[tapId].firstPulseTime = 0;
  tapState[tapId].dispensingStartTime = millis();
  tapState[tapId].isDispensing = true;
  // 🆕 v4.0.6: Inicializar máquina de estados
  tapState[tapId].phase = TAP_PHASE_DISPENSING;
  tapState[tapId].phaseStartTime = 0;
  tapState[tapId].blinkCount = 0;
  
  // 🔧 CORREÇÃO v4.0.1: Zerar contador via função
  resetPulseCounter(tapId);
  
  // Compatibilidade: atualizar variáveis globais legadas (para tap 0)
  if (tapId == 0) {
    currentOrderId = tapState[0].orderId;
    targetMl = tapState[0].targetMl;
    totalCups = tapState[0].totalCups;
    currentCup = tapState[0].currentCup;
    totalMlDispensed = 0;
    flowStarted = false;
    firstPulseTime = 0;
    dispensingStartTime = tapState[0].dispensingStartTime;
  }
  isDispensing = true;
  
  // Log detalhado
  Serial.println();
  Serial.println("╔════════════════════════════════════════╗");
  Serial.println("║        NOVO PEDIDO RECEBIDO            ║");
  Serial.println("╠════════════════════════════════════════╣");
  Serial.println("║ Tap: " + String(tapId));
  Serial.println("║ Pedido: " + tapState[tapId].orderId);
  Serial.println("║ Tamanho: " + String(sizeLabel));
  Serial.println("║ Volume: " + String(tapState[tapId].targetMl) + "ml x " + String(tapState[tapId].totalCups) + " copo(s)");
  Serial.println("╚════════════════════════════════════════╝");
  Serial.println();
  
  // Abrir válvula deste tap
  openValveTap(tapId);
  
  // Enviar confirmação
  sendStatusTap(tapId, tapState[tapId].orderId.c_str(), "received", "Pedido recebido na torneira " + String(tapId));
  
  return "{\"type\":\"success\",\"message\":\"Dispensação iniciada\",\"orderId\":\"" + tapState[tapId].orderId + "\",\"tapId\":" + String(tapId) + "}";
}

// ----- PARAR TODAS AS TORNEIRAS -----
String handleStop() {
  bool anyActive = false;
  for (int i = 0; i < NUM_TAPS; i++) {
    if (tapState[i].isDispensing) {
      closeValveTap(i);
      tapState[i].isDispensing = false;
      sendStatusTap(i, tapState[i].orderId.c_str(), "stopped", "Dispensação interrompida");
      anyActive = true;
    }
  }
  isDispensing = false;
  if (anyActive) {
    return "{\"type\":\"success\",\"message\":\"Todas as dispensações interrompidas\"}";
  }
  return "{\"type\":\"info\",\"message\":\"Nenhuma dispensação em andamento\"}";
}

// ----- PARAR UMA TORNEIRA ESPECÍFICA -----
String handleStopTap(int tapId) {
  if (tapId < 0 || tapId >= NUM_TAPS) {
    return "{\"type\":\"error\",\"code\":\"INVALID_TAP\",\"message\":\"tapId inválido\"}";
  }
  if (tapState[tapId].isDispensing) {
    closeValveTap(tapId);
    tapState[tapId].isDispensing = false;
    sendStatusTap(tapId, tapState[tapId].orderId.c_str(), "stopped", "Dispensação interrompida");
    // Verificar se ainda há alguma torneira dispensando
    isDispensing = false;
    for (int i = 0; i < NUM_TAPS; i++) {
      if (tapState[i].isDispensing) {
        isDispensing = true;
        break;
      }
    }
    return "{\"type\":\"success\",\"message\":\"Torneira " + String(tapId) + " interrompida\",\"tapId\":" + String(tapId) + "}";
  }
  return "{\"type\":\"info\",\"message\":\"Torneira " + String(tapId) + " não está dispensando\"}";
}

// ----- TESTE DE VÁLVULA (LEGADO - tap 0) -----
String handleTestValve(int durationMs) {
  return handleTestValveTap(0, durationMs);
}

// ----- TESTE DE VÁLVULA POR TAP -----
String handleTestValveTap(int tapId, int durationMs) {
  if (tapId < 0 || tapId >= NUM_TAPS) {
    return "{\"type\":\"error\",\"code\":\"INVALID_TAP\",\"message\":\"tapId inválido\"}";
  }
  
  // Limitar duração máxima a 10 segundos para segurança
  if (durationMs > 10000) durationMs = 10000;
  
  Serial.println("[TEST] 🔴 Testando válvula do Tap " + String(tapId) + " por " + String(durationMs) + "ms");
  
  // LED ligado durante o teste
  digitalWrite(LED_PIN, HIGH);
  openValveTap(tapId);
  
  // 🔧 FIX: Usar loop com reset do watchdog ao invés de delay() bloqueante
  unsigned long start = millis();
  while (millis() - start < (unsigned long)durationMs) {
    esp_task_wdt_reset();  // Evitar timeout do watchdog
    delay(100);  // Pequena pausa para não sobrecarregar CPU
  }
  
  closeValveTap(tapId);
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

// ----- TESTE DE SENSOR DE FLUXO (MULTI-TAP) -----
String handleTestFlow(int durationMs, int tapId) {
  // 🆕 Validar tapId
  if (tapId < 0 || tapId >= NUM_TAPS) {
    return "{\"type\":\"error\",\"code\":\"INVALID_TAP\",\"message\":\"tapId inválido: " + String(tapId) + "\"}";
  }
  
  Serial.println("[TEST] 🟡 Testando sensor de fluxo (Tap " + String(tapId) + ") por " + String(durationMs/1000) + "s");
  Serial.println("[TEST] Abra a água manualmente e observe os pulsos");
  Serial.println("[TEST] Calibração atual: " + String(tapConfig[tapId].pulsosPorLitro) + " pulsos/litro");
  
  // 🔧 CORREÇÃO v4.0.1: Usar função resetPulseCounter
  resetPulseCounter(tapId);
  
  unsigned long start = millis();
  unsigned long lastPrint = 0;
  
  while (millis() - start < durationMs) {
    // 🔧 FIX: Reset do watchdog para evitar timeout em testes longos
    esp_task_wdt_reset();
    
    // LED piscando
    if ((millis() / 300) % 2 == 0) {
      digitalWrite(LED_PIN, HIGH);
    } else {
      digitalWrite(LED_PIN, LOW);
    }
    
    // 🔧 CORREÇÃO v4.0.1: Sincronizar e ler
    syncPulseCounters();
    unsigned long currentPulses = tapState[tapId].pulseCount;
    
    // Mostrar progresso a cada 500ms
    if (millis() - lastPrint > 500) {
      float mlCalculado = currentPulses * (1000.0 / tapConfig[tapId].pulsosPorLitro);
      Serial.println("[FLOW] Pulsos: " + String(currentPulses) + " | ML: " + String(mlCalculado, 1));
      lastPrint = millis();
    }
    delay(10);
  }
  
  digitalWrite(LED_PIN, LOW);
  
  // 🔧 CORREÇÃO v4.0.1: Leitura final via sync
  syncPulseCounters();
  unsigned long finalPulses = tapState[tapId].pulseCount;
  
  float totalMl = finalPulses * (1000.0 / tapConfig[tapId].pulsosPorLitro);
  
  JsonDocument doc;
  doc["type"] = "flow_test";
  doc["duration_ms"] = durationMs;
  doc["pulses"] = finalPulses;
  doc["ml_calculated"] = totalMl;
  doc["tapId"] = tapId;
  doc["pulses_per_liter_configured"] = tapConfig[tapId].pulsosPorLitro;
  doc["message"] = "Meça o volume real e calcule: pulsos_por_litro = pulses / (ml_real / 1000)";
  
  String response;
  serializeJson(doc, response);
  
  Serial.println("[TEST] ✅ Teste de fluxo concluído!");
  Serial.println("[TEST] Total pulsos: " + String(finalPulses));
  Serial.println("[TEST] ML calculado: " + String(totalMl, 1));
  // NOTA: Não imprimir response aqui - já será impresso em processCommand()
  
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

// ----- CALIBRAÇÃO (MULTI-TAP) -----
String handleCalibration(int durationMs, int tapId) {
  // 🆕 Validar tapId
  if (tapId < 0 || tapId >= NUM_TAPS) {
    Serial.println("[CALIBRATE] ❌ tapId inválido: " + String(tapId));
    return "{\"type\":\"error\",\"message\":\"tapId inválido\"}";
  }
  
  Serial.println("[CALIBRATE] Iniciando calibração do Tap " + String(tapId) + "...");
  Serial.println("[CALIBRATE] Abrindo válvula por " + String(durationMs/1000) + " segundos");
  Serial.println("[CALIBRATE] Calibração atual: " + String(tapConfig[tapId].pulsosPorLitro) + " pulsos/litro");
  
  // 🔧 CORREÇÃO v4.0.1: Usar função resetPulseCounter
  resetPulseCounter(tapId);
  
  // 🆕 Abrir válvula do tap específico
  openValveTap(tapId);
  
  // Monitorar pulsos durante a calibração
  unsigned long start = millis();
  unsigned long lastPrint = 0;
  while (millis() - start < durationMs) {
    // 🔧 CORREÇÃO v4.0.6: Reset do watchdog para calibrações longas (> 10s)
    esp_task_wdt_reset();
    
    // 🔧 CORREÇÃO v4.0.1: Sincronizar e ler
    syncPulseCounters();
    
    // Mostrar progresso a cada 500ms
    if (millis() - lastPrint > 500) {
      unsigned long currentPulses = tapState[tapId].pulseCount;
      Serial.println("[CALIBRATE] Pulsos: " + String(currentPulses));
      lastPrint = millis();
    }
    delay(10);
  }
  
  closeValveTap(tapId);
  
  // 🔧 CORREÇÃO v4.0.1: Leitura final via sync
  syncPulseCounters();
  unsigned long finalPulses = tapState[tapId].pulseCount;
  
  // 🆕 Usar configurações do tap específico
  float mlEstimated = (durationMs / 1000.0) * tapConfig[tapId].mlPorSegundo;
  float calculatedPulsesPerLiter = (mlEstimated > 0) ? (finalPulses / (mlEstimated / 1000.0)) : 0;
  
  JsonDocument doc;
  doc["type"] = "calibration";
  doc["tapId"] = tapId;  // 🆕 Incluir tapId na resposta
  doc["duration_ms"] = durationMs;
  doc["pulses"] = finalPulses;
  doc["ml_estimated"] = mlEstimated;
  doc["calculated_pulses_per_liter"] = calculatedPulsesPerLiter;
  doc["message"] = "Meça o volume real dispensado e calcule: pulsos_por_litro = pulses / (ml_real / 1000)";
  
  String response;
  serializeJson(doc, response);
  
  Serial.println("[CALIBRATE] Tap " + String(tapId) + " - Resultado: " + response);
  return response;
}

// ----- STATUS JSON (atualizado para Multi-Tap) -----
String getStatusJson() {
  JsonDocument doc;
  doc["type"] = "status";
  doc["device"] = "Kiosk_Bier";
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["status"] = isDispensing ? "dispensing" : "ready";
  doc["uptime_ms"] = millis();
  doc["num_taps"] = NUM_TAPS;
  
  // WiFi Access Point
  doc["wifi_mode"] = "access_point";
  doc["wifi_ssid"] = AP_SSID;
  doc["wifi_ip"] = WiFi.softAPIP().toString();
  doc["wifi_clients"] = WiFi.softAPgetStationNum();
  doc["mac"] = WiFi.macAddress();
  
  // Bluetooth
  doc["ble_name"] = BLE_DEVICE_NAME;
  doc["ble_open"] = true;  // Sem PIN desde v4.1.3
  doc["ble_connected"] = (connectedCount > 0);
  
  // 🆕 Status de cada torneira
  JsonArray tapsArray = doc["taps"].to<JsonArray>();
  for (int i = 0; i < NUM_TAPS; i++) {
    JsonObject tap = tapsArray.add<JsonObject>();
    tap["id"] = i;
    tap["isDispensing"] = tapState[i].isDispensing;
    tap["valvePin"] = tapConfig[i].valvePin;
    tap["sensorPin"] = tapConfig[i].sensorPin;
    tap["pulsosPorLitro"] = tapConfig[i].pulsosPorLitro;
    tap["mlPorSegundo"] = tapConfig[i].mlPorSegundo;
    
    if (tapState[i].isDispensing) {
      tap["orderId"] = tapState[i].orderId;
      tap["currentCup"] = tapState[i].currentCup;
      tap["totalCups"] = tapState[i].totalCups;
      tap["targetMl"] = tapState[i].targetMl;
      tap["mlDispensed"] = tapState[i].mlDispensed;
      int progress = (tapState[i].targetMl > 0) ? (int)((tapState[i].mlDispensed / tapState[i].targetMl) * 100) : 0;
      tap["progress"] = progress;
      tap["flowStarted"] = tapState[i].flowStarted;
    }
  }
  
  // Compatibilidade: manter current_order legado para tap 0
  if (tapState[0].isDispensing) {
    JsonObject order = doc["current_order"].to<JsonObject>();
    order["order_id"] = tapState[0].orderId;
    order["current_cup"] = tapState[0].currentCup;
    order["total_cups"] = tapState[0].totalCups;
    order["target_ml"] = tapState[0].targetMl;
    order["ml_dispensed"] = tapState[0].mlDispensed;
    order["progress"] = (tapState[0].targetMl > 0) ? (int)((tapState[0].mlDispensed / tapState[0].targetMl) * 100) : 0;
    order["flow_started"] = tapState[0].flowStarted;
    order["tap_id"] = 0;
  }
  
  String response;
  serializeJson(doc, response);
  return response;
}

// 🆕 ----- STATUS DAS TORNEIRAS (MULTI-TAP) -----
String handleGetTaps() {
  JsonDocument doc;
  doc["type"] = "taps_status";
  doc["num_taps"] = NUM_TAPS;
  doc["timestamp"] = millis();
  
  JsonArray tapsArray = doc["taps"].to<JsonArray>();
  for (int i = 0; i < NUM_TAPS; i++) {
    JsonObject tap = tapsArray.add<JsonObject>();
    tap["id"] = i;
    tap["isDispensing"] = tapState[i].isDispensing;
    tap["valvePin"] = tapConfig[i].valvePin;
    tap["sensorPin"] = tapConfig[i].sensorPin;
    tap["pulsosPorLitro"] = tapConfig[i].pulsosPorLitro;
    tap["mlDispensed"] = tapState[i].mlDispensed;
    tap["pulseCount"] = (unsigned long)tapState[i].pulseCount;
    
    if (tapState[i].isDispensing) {
      tap["orderId"] = tapState[i].orderId;
      tap["currentCup"] = tapState[i].currentCup;
      tap["totalCups"] = tapState[i].totalCups;
      tap["targetMl"] = tapState[i].targetMl;
      int progress = (tapState[i].targetMl > 0) ? (int)((tapState[i].mlDispensed / tapState[i].targetMl) * 100) : 0;
      tap["progress"] = progress;
      tap["flowStarted"] = tapState[i].flowStarted;
    }
  }
  
  String response;
  serializeJson(doc, response);
  return response;
}

// ============================================================================
// CONTROLE DA VÁLVULA (MULTI-TAP)
// ============================================================================

// Abrir válvula legada (compatibilidade - usa tap 0)
void openValve() {
  openValveTap(0);
}

// Fechar válvula legada (compatibilidade - usa tap 0)
void closeValve() {
  closeValveTap(0);
}

// 🆕 Abrir válvula de um tap específico
void openValveTap(int tapId) {
  if (tapId < 0 || tapId >= NUM_TAPS) return;
  
  digitalWrite(tapConfig[tapId].valvePin, HIGH);
  digitalWrite(LED_PIN, HIGH);
  Serial.println("[VALVE] 🟢 Tap " + String(tapId) + " - Válvula ABERTA (GPIO" + String(tapConfig[tapId].valvePin) + ")");
}

// 🆕 Fechar válvula de um tap específico
void closeValveTap(int tapId) {
  if (tapId < 0 || tapId >= NUM_TAPS) return;
  
  digitalWrite(tapConfig[tapId].valvePin, LOW);
  
  // Só apagar LED se nenhum tap estiver dispensando
  bool anyDispensing = false;
  for (int i = 0; i < NUM_TAPS; i++) {
    if (tapState[i].isDispensing && i != tapId) {
      anyDispensing = true;
      break;
    }
  }
  if (!anyDispensing) {
    digitalWrite(LED_PIN, LOW);
  }
  
  Serial.println("[VALVE] 🔴 Tap " + String(tapId) + " - Válvula FECHADA (GPIO" + String(tapConfig[tapId].valvePin) + ")");
}

// ============================================================================
// PROCESSAMENTO DA DISPENSAÇÃO POR TAP (MULTI-TAP)
// ============================================================================

// Legado: processa tap 0 (para compatibilidade)
void processDispensing() {
  processDispensingTap(0);
}

// 🆕 Processa dispensação de um tap específico
// 🔧 v4.0.6: Reescrito com máquina de estados NÃO-BLOQUEANTE
void processDispensingTap(int tapId) {
  if (tapId < 0 || tapId >= NUM_TAPS) return;
  if (!tapState[tapId].isDispensing) return;
  
  unsigned long now = millis();
  unsigned long sessionElapsedMs = now - tapState[tapId].dispensingStartTime;
  
  // 🔧 CORREÇÃO v4.0.1: Ler valores já sincronizados pelo loop principal
  unsigned long currentPulseCount = tapState[tapId].pulseCount;
  unsigned long currentLastPulseTime = tapState[tapId].lastPulseTime;
  
  // ============================================
  // MÁQUINA DE ESTADOS NÃO-BLOQUEANTE (v4.0.6)
  // ============================================
  
  switch (tapState[tapId].phase) {
    
    // -----------------------------------------
    // FASE: LED DE SUCESSO (1 segundo aceso)
    // -----------------------------------------
    case TAP_PHASE_LED_SUCCESS:
      if (now - tapState[tapId].phaseStartTime >= 1000) {
        digitalWrite(LED_PIN, LOW);
        
        // Verificar se há mais copos
        if (tapState[tapId].currentCup < tapState[tapId].totalCups) {
          sendStatusTap(tapId, tapState[tapId].orderId.c_str(), "waiting_next", "Aguardando próximo copo...");
          tapState[tapId].phase = TAP_PHASE_WAIT_NEXT_CUP;
          tapState[tapId].phaseStartTime = now;
          tapState[tapId].blinkCount = 0;
        } else {
          // Último copo - ir para piscadas finais
          Serial.println("[DISPENSE] Tap " + String(tapId) + " 🎉 Todos os copos concluídos!");
          tapState[tapId].phase = TAP_PHASE_COMPLETE_BLINK;
          tapState[tapId].phaseStartTime = now;
          tapState[tapId].blinkCount = 0;
        }
      }
      return;  // Não processar mais nada enquanto LED aceso
    
    // -----------------------------------------
    // FASE: ESPERA ENTRE COPOS (4 piscadas = 2s)
    // -----------------------------------------
    case TAP_PHASE_WAIT_NEXT_CUP: {
      unsigned long phaseElapsed = now - tapState[tapId].phaseStartTime;
      int currentBlink = phaseElapsed / 250;  // 250ms por estado (on/off)
      
      // LED pisca: 0=on, 1=off, 2=on, 3=off, 4=on, 5=off, 6=on, 7=off
      if (currentBlink < 8) {
        digitalWrite(LED_PIN, (currentBlink % 2 == 0) ? HIGH : LOW);
      }
      
      // Após 2 segundos (8 x 250ms), preparar próximo copo
      if (phaseElapsed >= 2000) {
        digitalWrite(LED_PIN, LOW);
        
        // Preparar próximo copo
        tapState[tapId].currentCup++;
        tapState[tapId].mlDispensed = 0;
        tapState[tapId].flowStarted = false;
        tapState[tapId].firstPulseTime = 0;
        tapState[tapId].dispensingStartTime = millis();
        resetPulseCounter(tapId);
        
        // Compatibilidade tap 0
        if (tapId == 0) {
          currentCup = tapState[0].currentCup;
          totalMlDispensed = 0;
          flowStarted = false;
          firstPulseTime = 0;
          dispensingStartTime = tapState[0].dispensingStartTime;
        }
        
        openValveTap(tapId);
        sendStatusTap(tapId, tapState[tapId].orderId.c_str(), "dispensing",
          "Dispensando copo " + String(tapState[tapId].currentCup) + " de " + String(tapState[tapId].totalCups));
        
        tapState[tapId].phase = TAP_PHASE_DISPENSING;
      }
      return;
    }
    
    // -----------------------------------------
    // FASE: PISCADAS FINAIS (3 piscadas longas)
    // -----------------------------------------
    case TAP_PHASE_COMPLETE_BLINK: {
      unsigned long phaseElapsed = now - tapState[tapId].phaseStartTime;
      int currentBlink = phaseElapsed / 300;  // 300ms por estado
      
      // LED pisca: 0=on, 1=off, 2=on, 3=off, 4=on, 5=off
      if (currentBlink < 6) {
        digitalWrite(LED_PIN, (currentBlink % 2 == 0) ? HIGH : LOW);
      }
      
      // Após 1.8 segundos (6 x 300ms), finalizar
      if (phaseElapsed >= 1800) {
        digitalWrite(LED_PIN, LOW);
        
        Serial.println("╔════════════════════════════════════════╗");
        Serial.println("║        PEDIDO CONCLUÍDO! ✅            ║");
        Serial.println("║ Tap: " + String(tapId));
        Serial.println("║ Pedido: " + tapState[tapId].orderId);
        Serial.println("║ Total: " + String(tapState[tapId].totalCups) + " copo(s) de " + String(tapState[tapId].targetMl) + "ml");
        Serial.println("╚════════════════════════════════════════╝");
        
        sendStatusTap(tapId, tapState[tapId].orderId.c_str(), "completed",
          "Pedido concluído! " + String(tapState[tapId].totalCups) + " copo(s) dispensados");
        
        tapState[tapId].orderId = "";
        tapState[tapId].isDispensing = false;
        tapState[tapId].phase = TAP_PHASE_IDLE;
        
        // Atualizar flag global
        isDispensing = false;
        for (int i = 0; i < NUM_TAPS; i++) {
          if (tapState[i].isDispensing) {
            isDispensing = true;
            break;
          }
        }
        
        // Compatibilidade tap 0
        if (tapId == 0) {
          currentOrderId = "";
        }
      }
      return;
    }
    
    // -----------------------------------------
    // FASE PADRÃO: DISPENSANDO
    // -----------------------------------------
    case TAP_PHASE_DISPENSING:
    default:
      break;  // Continua o processamento normal abaixo
  }
  
  // ============================================
  // DETECTAR PRIMEIRO PULSO (usuário abriu a torneira)
  // ============================================
  if (!tapState[tapId].flowStarted && currentPulseCount > 0) {
    tapState[tapId].flowStarted = true;
    tapState[tapId].firstPulseTime = now;
    Serial.println("[DISPENSE] Tap " + String(tapId) + " 🚿 Fluxo detectado!");
    
    // Compatibilidade tap 0
    if (tapId == 0) {
      flowStarted = true;
      firstPulseTime = now;
    }
  }
  
  // ============================================
  // CALCULAR ML DISPENSADOS
  // ============================================
  if (tapState[tapId].flowStarted) {
    float mlFromSensor = currentPulseCount * (1000.0 / tapConfig[tapId].pulsosPorLitro);
    unsigned long timeSinceLastPulse = now - currentLastPulseTime;
    
    if (currentPulseCount > 0) {
      tapState[tapId].mlDispensed = mlFromSensor;
    } else if (timeSinceLastPulse > 3000) {
      unsigned long flowElapsedMs = now - tapState[tapId].firstPulseTime;
      float mlFromTime = (flowElapsedMs / 1000.0) * tapConfig[tapId].mlPorSegundo;
      tapState[tapId].mlDispensed = max(mlFromSensor, mlFromTime);
    }
    
    // Compatibilidade tap 0
    if (tapId == 0) {
      totalMlDispensed = tapState[0].mlDispensed;
    }
  } else {
    tapState[tapId].mlDispensed = 0;
  }
  
  // ============================================
  // CALCULAR PROGRESSO E TEMPOS
  // ============================================
  int progress = (tapState[tapId].targetMl > 0) ? (int)((tapState[tapId].mlDispensed / tapState[tapId].targetMl) * 100) : 0;
  if (progress > 100) progress = 100;
  
  int elapsedSeconds = sessionElapsedMs / 1000;
  int remainingSeconds = 0;
  if (sessionElapsedMs < tapState[tapId].sessionTimeoutMs) {
    remainingSeconds = (tapState[tapId].sessionTimeoutMs - sessionElapsedMs) / 1000;
  }
  
  // ============================================
  // LED: Feedback visual diferenciado por tap
  // ============================================
  if (!tapState[tapId].flowStarted) {
    // Aguardando: LED pisca lento
    if ((now / 1000) % 2 == 0) {
      digitalWrite(LED_PIN, HIGH);
    } else {
      digitalWrite(LED_PIN, LOW);
    }
  } else {
    // Dispensando: padrão diferente por tap
    int blinkRate = (tapId == 0) ? 500 : 250;
    if ((now / blinkRate) % 2 == 0) {
      digitalWrite(LED_PIN, HIGH);
    } else {
      digitalWrite(LED_PIN, LOW);
    }
  }
  
  // ============================================
  // ENVIAR PROGRESSO (a cada 250ms) - POR TAP
  // ============================================
  if (now - tapState[tapId].lastStatusUpdate > 250) {
    sendProgressTap(
      tapId,
      tapState[tapId].orderId.c_str(),
      tapState[tapId].currentCup,
      tapState[tapId].totalCups,
      tapState[tapId].mlDispensed,
      tapState[tapId].targetMl,
      progress,
      tapState[tapId].flowStarted,
      elapsedSeconds,
      remainingSeconds
    );
    tapState[tapId].lastStatusUpdate = now;
    
    // Log no serial
    if (tapState[tapId].flowStarted) {
      Serial.print("[DISPENSE] Tap ");
      Serial.print(tapId);
      Serial.print(" | Copo ");
      Serial.print(tapState[tapId].currentCup);
      Serial.print("/");
      Serial.print(tapState[tapId].totalCups);
      Serial.print(" | ");
      Serial.print(tapState[tapId].mlDispensed, 0);
      Serial.print("/");
      Serial.print(tapState[tapId].targetMl);
      Serial.print("ml (");
      Serial.print(progress);
      Serial.print("%) | Pulsos: ");
      Serial.println((unsigned long)tapState[tapId].pulseCount);
    } else {
      Serial.println("[DISPENSE] Tap " + String(tapId) + " ⏳ Aguardando abrir torneira... (" + String(elapsedSeconds) + "s)");
    }
  }
  
  // ============================================
  // VERIFICAR TIMEOUT DE FLUXO PARADO (v4.1.1)
  // Se o fluxo já iniciou mas parou por NO_FLOW_TIMEOUT_MS, fechar válvula
  // ============================================
  if (tapState[tapId].flowStarted && currentPulseCount > 0) {
    unsigned long timeSinceLastPulseForTimeout = now - currentLastPulseTime;
    if (timeSinceLastPulseForTimeout > NO_FLOW_TIMEOUT_MS) {
      closeValveTap(tapId);
      tapState[tapId].isDispensing = false;
      tapState[tapId].phase = TAP_PHASE_IDLE;
      
      Serial.println("[ERROR] Tap " + String(tapId) + " ⚠️ Fluxo parado por " + String(NO_FLOW_TIMEOUT_MS / 1000) + "s - fechando válvula");
      sendStatusTap(tapId, tapState[tapId].orderId.c_str(), "error", "Fluxo parado - torneira fechada por segurança");
      tapState[tapId].orderId = "";
      
      // Atualizar flag global
      isDispensing = false;
      for (int i = 0; i < NUM_TAPS; i++) {
        if (tapState[i].isDispensing) {
          isDispensing = true;
          break;
        }
      }
      return;
    }
  }
  
  // ============================================
  // VERIFICAR CONCLUSÃO DO COPO (v4.0.6: Não-bloqueante)
  // ============================================
  if (tapState[tapId].flowStarted && tapState[tapId].mlDispensed >= tapState[tapId].targetMl) {
    closeValveTap(tapId);
    
    // 🔧 v4.0.6: Iniciar fase LED_SUCCESS ao invés de delay()
    digitalWrite(LED_PIN, HIGH);
    tapState[tapId].phase = TAP_PHASE_LED_SUCCESS;
    tapState[tapId].phaseStartTime = now;
    
    sendStatusTap(tapId, tapState[tapId].orderId.c_str(), "cup_complete",
      "Copo " + String(tapState[tapId].currentCup) + " concluído (" + String(tapState[tapId].targetMl) + "ml)");
    
    Serial.println("[DISPENSE] Tap " + String(tapId) + " ✅ Copo " + String(tapState[tapId].currentCup) + " concluído!");
    return;
  }
  
  // ============================================
  // TIMEOUT GLOBAL DE SEGURANÇA (POR TAP)
  // ============================================
  if (sessionElapsedMs > tapState[tapId].sessionTimeoutMs) {
    closeValveTap(tapId);
    tapState[tapId].isDispensing = false;
    tapState[tapId].phase = TAP_PHASE_IDLE;
    
    // 🔧 v4.0.6: Piscadas de erro também não-bloqueantes seria ideal,
    // mas para simplificar mantemos aqui (erro é raro)
    Serial.println("[ERROR] Tap " + String(tapId) + " ⚠️ Timeout!");
    for (int i = 0; i < 5; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(100);
      esp_task_wdt_reset();  // Reset watchdog durante piscadas
      digitalWrite(LED_PIN, LOW);
      delay(100);
    }
    
    sendStatusTap(tapId, tapState[tapId].orderId.c_str(), "error", "Timeout - sessão expirada");
    tapState[tapId].orderId = "";
    
    // Atualizar flag global
    isDispensing = false;
    for (int i = 0; i < NUM_TAPS; i++) {
      if (tapState[i].isDispensing) {
        isDispensing = true;
        break;
      }
    }
  }
}

// ============================================================================
// ENVIO DE MENSAGENS
// ============================================================================

// Enviar status geral (legado - para compatibilidade)
void sendStatus(const char* orderId, const char* stage, String message) {
  sendStatusTap(0, orderId, stage, message);
}

// 🆕 Enviar status por tap
void sendStatusTap(int tapId, const char* orderId, const char* stage, String message) {
  JsonDocument doc;
  doc["type"] = "status";
  doc["tapId"] = tapId;
  doc["orderId"] = orderId;
  doc["stage"] = stage;
  doc["message"] = message;
  doc["timestamp"] = millis();
  
  // 🆕 Sempre incluir num_taps para o frontend saber quantas torneiras existem
  doc["num_taps"] = NUM_TAPS;
  
  String json;
  serializeJson(doc, json);
  
  // Enviar via Serial
  Serial.println(json);
  
  // Enviar via Bluetooth (se conectado)
  if (connectedCount > 0 && pCharacteristic != NULL) {
    // 🔧 FIX v4.0.4: Adicionar \n para que o app reconheça linha completa
    String bleJson = json + "\n";
    pCharacteristic->setValue(bleJson.c_str());
    pCharacteristic->notify();
  }
}

// Enviar progresso da dispensação (legado)
void sendProgress(const char* orderId, int cup, float mlDispensed, int target, int percent) {
  sendProgressTap(0, orderId, cup, 1, mlDispensed, target, percent, false, 0, 0);
}

// Enviar progresso estendido (legado)
void sendProgressExtended(const char* orderId, int cup, int totalCupsCount, float mlDispensed, int target, int percent, bool flowStartedFlag, int elapsedSec, int remainingSec) {
  sendProgressTap(0, orderId, cup, totalCupsCount, mlDispensed, target, percent, flowStartedFlag, elapsedSec, remainingSec);
}

// 🆕 Enviar progresso por tap
void sendProgressTap(int tapId, const char* orderId, int cup, int totalCupsCount, float mlDispensed, int target, int percent, bool flowStartedFlag, int elapsedSec, int remainingSec) {
  JsonDocument doc;
  doc["type"] = "progress";
  doc["tapId"] = tapId;
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
  if (connectedCount > 0 && pCharacteristic != NULL) {
    // 🔧 FIX v4.0.4: Adicionar \n para que o app reconheça linha completa
    String bleJson = json + "\n";
    pCharacteristic->setValue(bleJson.c_str());
    pCharacteristic->notify();
  }
}

// ============================================================================
// FUNÇÕES NVS (PERSISTÊNCIA) - MULTI-TAP
// ============================================================================

// Carregar configurações do NVS (Multi-Tap)
void loadSettings() {
  // Inicializar tapConfig com valores padrão
  for (int i = 0; i < NUM_TAPS; i++) {
    tapConfig[i].pulsosPorLitro = DEFAULT_PULSOS_POR_LITRO;
    tapConfig[i].mlPorSegundo = DEFAULT_ML_POR_SEGUNDO;
  }
  
  // v4.1.0: Load pin assignments from NVS (set by set_config)
  for (int i = 0; i < NUM_TAPS; i++) {
    String kVP = "tap" + String(i) + "_vpin";
    String kSP = "tap" + String(i) + "_spin";
    int defaultVP = (i == 0) ? VALVE_PIN_0 : VALVE_PIN_1;
    int defaultSP = (i == 0) ? FLOW_SENSOR_PIN_0 : FLOW_SENSOR_PIN_1;
    tapConfig[i].valvePin = preferences.getInt(kVP.c_str(), defaultVP);
    tapConfig[i].sensorPin = preferences.getInt(kSP.c_str(), defaultSP);
  }

  // Carregar calibração por tap do NVS
  // Migração legada: se chaves per-tap não existem, tentar chaves legadas (tap 0 only)
  for (int i = 0; i < NUM_TAPS; i++) {
    String keyPulsos = "tap" + String(i) + "_pulsos";
    String keyMl = "tap" + String(i) + "_ml";
    
    if (preferences.isKey(keyPulsos.c_str())) {
      tapConfig[i].pulsosPorLitro = preferences.getFloat(keyPulsos.c_str(), DEFAULT_PULSOS_POR_LITRO);
    } else if (i == 0 && preferences.isKey("pulsos_litro")) {
      // Migração: chave legada existe, usar para tap 0
      tapConfig[0].pulsosPorLitro = preferences.getFloat("pulsos_litro", DEFAULT_PULSOS_POR_LITRO);
    }
    
    if (preferences.isKey(keyMl.c_str())) {
      tapConfig[i].mlPorSegundo = preferences.getFloat(keyMl.c_str(), DEFAULT_ML_POR_SEGUNDO);
    } else if (i == 0 && preferences.isKey("ml_segundo")) {
      // Migração: chave legada existe, usar para tap 0
      tapConfig[0].mlPorSegundo = preferences.getFloat("ml_segundo", DEFAULT_ML_POR_SEGUNDO);
    }
    
    Serial.println("  → Tap " + String(i) + ": " + String(tapConfig[i].pulsosPorLitro) + " pulsos/L, " + String(tapConfig[i].mlPorSegundo) + " ml/s");
  }
  
  Serial.println("[NVS] ✅ Configurações carregadas (default: " + String(DEFAULT_PULSOS_POR_LITRO, 0) + " pulsos/L)");
}

// Salvar configurações no NVS (Multi-Tap)
void saveSettings() {
  // Salvar calibração per-tap (fonte canônica)
  for (int i = 0; i < NUM_TAPS; i++) {
    String keyPulsos = "tap" + String(i) + "_pulsos";
    String keyMl = "tap" + String(i) + "_ml";
    preferences.putFloat(keyPulsos.c_str(), tapConfig[i].pulsosPorLitro);
    preferences.putFloat(keyMl.c_str(), tapConfig[i].mlPorSegundo);
  }
  // Manter chaves legadas para migração (espelha tap 0)
  preferences.putFloat("pulsos_litro", tapConfig[0].pulsosPorLitro);
  preferences.putFloat("ml_segundo", tapConfig[0].mlPorSegundo);
  
  Serial.println("[NVS] ✅ Configurações salvas");
}

// Handler: Salvar calibração (Multi-Tap)
String handleSaveCalibration(JsonDocument& doc) {
  int tapId = doc["tapId"] | 0;  // Padrão tap 0 para retrocompatibilidade
  
  if (tapId < 0 || tapId >= NUM_TAPS) {
    return "{\"type\":\"error\",\"code\":\"INVALID_TAP\",\"message\":\"tapId inválido\"}";
  }
  
  float novoPulsos = doc["pulsos_por_litro"] | tapConfig[tapId].pulsosPorLitro;
  float novoMlSeg = doc["ml_por_segundo"] | tapConfig[tapId].mlPorSegundo;
  
  // Validar valores
  if (novoPulsos <= 0 || novoPulsos > 10000) {
    return "{\"type\":\"error\",\"code\":\"INVALID_PARAMS\",\"message\":\"pulsos_por_litro deve ser entre 1 e 10000\"}";
  }
  if (novoMlSeg <= 0 || novoMlSeg > 500) {
    return "{\"type\":\"error\",\"code\":\"INVALID_PARAMS\",\"message\":\"ml_por_segundo deve ser entre 1 e 500\"}";
  }
  
  // Aplicar novos valores ao tap específico
  tapConfig[tapId].pulsosPorLitro = novoPulsos;
  tapConfig[tapId].mlPorSegundo = novoMlSeg;
  
  // Salvar no NVS
  saveSettings();
  
  Serial.println("[CALIB] ✅ Nova calibração salva para Tap " + String(tapId) + ":");
  Serial.println("  → Pulsos/Litro: " + String(tapConfig[tapId].pulsosPorLitro));
  Serial.println("  → ML/Segundo: " + String(tapConfig[tapId].mlPorSegundo));
  
  JsonDocument response;
  response["type"] = "success";
  response["message"] = "Calibração salva no NVS";
  response["tapId"] = tapId;
  response["pulsos_por_litro"] = tapConfig[tapId].pulsosPorLitro;
  response["ml_por_segundo"] = tapConfig[tapId].mlPorSegundo;
  
  String json;
  serializeJson(response, json);
  return json;
}

// Handler: Obter configurações atuais (Multi-Tap)
String handleGetSettings() {
  JsonDocument doc;
  doc["type"] = "settings";
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["num_taps"] = NUM_TAPS;
  
  // Valores de tap 0 nos campos flat para retrocompatibilidade
  doc["pulsos_por_litro"] = tapConfig[0].pulsosPorLitro;
  doc["ml_por_segundo"] = tapConfig[0].mlPorSegundo;
  doc["ml_por_pulso"] = 1000.0 / tapConfig[0].pulsosPorLitro;
  
  // 🆕 Array de calibração por tap
  JsonArray tapsArray = doc["taps"].to<JsonArray>();
  for (int i = 0; i < NUM_TAPS; i++) {
    JsonObject tap = tapsArray.add<JsonObject>();
    tap["id"] = i;
    tap["pulsos_por_litro"] = tapConfig[i].pulsosPorLitro;
    tap["ml_por_segundo"] = tapConfig[i].mlPorSegundo;
    tap["ml_por_pulso"] = 1000.0 / tapConfig[i].pulsosPorLitro;
    tap["valve_pin"] = tapConfig[i].valvePin;
    tap["sensor_pin"] = tapConfig[i].sensorPin;
  }
  
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
// 🔧 CORREÇÃO v4.0.6: Recebe tapId para usar contador correto por torneira
bool testInputPin(int pin, const char* pinName, int tapId = 0) {
  Serial.println();
  Serial.println("┌─────────────────────────────────────────┐");
  Serial.println("│ Testando " + String(pinName) + " (GPIO" + String(pin) + ") Tap" + String(tapId));
  Serial.println("└─────────────────────────────────────────┘");
  
  pinMode(pin, INPUT_PULLUP);
  delay(50);
  
  int state = digitalRead(pin);
  Serial.println("  INPUT_PULLUP → Leitura: " + String(state ? "HIGH (pull-up ativo)" : "LOW (algo puxando para GND)"));
  
  // Para sensor, verificar se há pulsos usando o contador CORRETO por tap
  Serial.println("  Aguardando pulsos por 2 segundos...");
  
  // 🔧 CORREÇÃO v4.0.6: Usar contador específico do tap, não variável global
  if (tapId >= 0 && tapId < NUM_TAPS) {
    resetPulseCounter(tapId);
    
    // Loop com reset do watchdog para evitar timeout
    unsigned long start = millis();
    while (millis() - start < 2000) {
      esp_task_wdt_reset();
      delay(100);
    }
    
    syncPulseCounters();
    unsigned long pulsos = tapState[tapId].pulseCount;
    Serial.println("  Pulsos detectados (Tap" + String(tapId) + "): " + String(pulsos));
  } else {
    Serial.println("  ⚠️ tapId inválido, pulso não testado");
  }
  
  bool ok = (state == HIGH);  // Com pull-up, deve estar HIGH se não há sinal
  Serial.println("  Resultado: " + String(ok ? "✅ FUNCIONAL" : "⚠️ VERIFICAR CONEXÃO"));
  
  return ok;
}

String handleDiagnoseGPIO() {
  Serial.println();
  Serial.println("╔══════════════════════════════════════════════════════════╗");
  Serial.println("║     🔧 DIAGNÓSTICO COMPLETO - MULTI-TAP                  ║");
  Serial.println("╠══════════════════════════════════════════════════════════╣");
  Serial.println("║  Tap 0: GPIO" + String(tapConfig[0].valvePin) + " = Válvula | GPIO" + String(tapConfig[0].sensorPin) + " = Sensor");
  Serial.println("║  Tap 1: GPIO" + String(tapConfig[1].valvePin) + " = Válvula | GPIO" + String(tapConfig[1].sensorPin) + " = Sensor");
  Serial.println("║  Comum: GPIO" + String(LED_PIN) + " = USER_LED interno");
  Serial.println("╚══════════════════════════════════════════════════════════╝");
  Serial.println();
  
  // Testar todos os pinos OUTPUT (Válvulas) — usa tapConfig (pode ter sido alterado via set_config)
  bool valve0_ok = testOutputPin(tapConfig[0].valvePin, "TAP0 VALVE");
  bool valve1_ok = testOutputPin(tapConfig[1].valvePin, "TAP1 VALVE");
  bool led_ok = testOutputPin(LED_PIN, "LED (USER_LED)");
  
  // Testar pinos INPUT (sensores de fluxo)
  bool sensor0_ok = testInputPin(tapConfig[0].sensorPin, "TAP0 SENSOR", 0);
  bool sensor1_ok = testInputPin(tapConfig[1].sensorPin, "TAP1 SENSOR", 1);
  
  // Testar contagem de pulsos
  Serial.println();
  Serial.println("[TEST] 🔄 Testando ISRs por 3 segundos...");
  Serial.println("[TEST] Abra uma torneira para ver os pulsos");
  
  resetPulseCounter(0);
  resetPulseCounter(1);
  
  unsigned long start = millis();
  while (millis() - start < 3000) {
    esp_task_wdt_reset();  // Evitar timeout do watchdog durante testes
    delay(500);
    syncPulseCounters();
    unsigned long p0 = tapState[0].pulseCount;
    unsigned long p1 = tapState[1].pulseCount;
    Serial.println("[TEST] Tap0: " + String(p0) + " pulsos | Tap1: " + String(p1) + " pulsos");
  }
  
  syncPulseCounters();
  unsigned long finalP0 = tapState[0].pulseCount;
  unsigned long finalP1 = tapState[1].pulseCount;
  
  // Restaurar configurações originais (usa tapConfig, não constantes de compile-time)
  pinMode(tapConfig[0].valvePin, OUTPUT);
  digitalWrite(tapConfig[0].valvePin, LOW);
  pinMode(tapConfig[1].valvePin, OUTPUT);
  digitalWrite(tapConfig[1].valvePin, LOW);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(tapConfig[0].sensorPin, INPUT_PULLUP);
  pinMode(tapConfig[1].sensorPin, INPUT_PULLUP);
  
  // Resumo
  Serial.println();
  Serial.println("╔══════════════════════════════════════════════════════════╗");
  Serial.println("║                    📊 RESUMO MULTI-TAP                    ║");
  Serial.println("╠══════════════════════════════════════════════════════════╣");
  Serial.println("║  Tap 0 Válvula (GPIO" + String(tapConfig[0].valvePin) + "): " + String(valve0_ok ? "✅ OK" : "❌ FAIL"));
  Serial.println("║  Tap 0 Sensor  (GPIO" + String(tapConfig[0].sensorPin) + "): " + String(sensor0_ok ? "✅ OK" : "⚠️ VER") + " Pulsos: " + String(finalP0));
  Serial.println("║  Tap 1 Válvula (GPIO" + String(tapConfig[1].valvePin) + "): " + String(valve1_ok ? "✅ OK" : "❌ FAIL"));
  Serial.println("║  Tap 1 Sensor  (GPIO" + String(tapConfig[1].sensorPin) + "): " + String(sensor1_ok ? "✅ OK" : "⚠️ VER") + " Pulsos: " + String(finalP1));
  Serial.println("║  LED           (GPIO" + String(LED_PIN) + "): " + String(led_ok ? "✅ OK" : "❌ FAIL"));
  Serial.println("╠══════════════════════════════════════════════════════════╣");
  Serial.println("║  Calibração Tap0: " + String(tapConfig[0].pulsosPorLitro, 0) + " pulsos/L");
  Serial.println("║  Calibração Tap1: " + String(tapConfig[1].pulsosPorLitro, 0) + " pulsos/L");
  Serial.println("╚══════════════════════════════════════════════════════════╝");
  Serial.println();
  
  // Retornar JSON com todos os resultados
  JsonDocument doc;
  doc["type"] = "gpio_diagnostic";
  doc["tap0_valve_ok"] = valve0_ok;
  doc["tap0_valve_pin"] = tapConfig[0].valvePin;
  doc["tap0_sensor_ok"] = sensor0_ok;
  doc["tap0_sensor_pin"] = tapConfig[0].sensorPin;
  doc["tap0_pulses"] = finalP0;
  doc["tap1_valve_ok"] = valve1_ok;
  doc["tap1_valve_pin"] = tapConfig[1].valvePin;
  doc["tap1_sensor_ok"] = sensor1_ok;
  doc["tap1_sensor_pin"] = tapConfig[1].sensorPin;
  doc["tap1_pulses"] = finalP1;
  doc["led_ok"] = led_ok;
  doc["led_pin"] = LED_PIN;
  doc["tap0_pulsos_por_litro"] = tapConfig[0].pulsosPorLitro;
  doc["tap1_pulsos_por_litro"] = tapConfig[1].pulsosPorLitro;
  
  String result;
  serializeJson(doc, result);
  return result;
}

// ============================================================================
// v4.1.0: SET_CONFIG — Dynamic pin + calibration from Admin/Kiosk
// ============================================================================
// Receives: {"action":"set_config","taps":[{"id":0,"valve_pin":5,"sensor_pin":6,...},...]}
// Persists to NVS, re-attaches ISRs, responds with config_applied ACK.

// Allowed GPIOs on XIAO ESP32-S3 (must match Admin board profile)
const int ALLOWED_GPIOS[] = {1,2,3,4,5,6,7,8,9,12,13,43,44};
const int ALLOWED_GPIOS_COUNT = 13;

bool isAllowedGpio(int pin) {
  for (int i = 0; i < ALLOWED_GPIOS_COUNT; i++) {
    if (ALLOWED_GPIOS[i] == pin) return true;
  }
  return false;
}

String handleSetConfig(JsonDocument& doc) {
  JsonArray tapsArr = doc["taps"].as<JsonArray>();
  if (tapsArr.isNull() || tapsArr.size() == 0) {
    return "{\"type\":\"error\",\"code\":\"INVALID_PARAMS\",\"message\":\"Array 'taps' obrigatorio\"}";
  }

  // Validate first, apply second
  int allValvePins[NUM_TAPS];
  int allSensorPins[NUM_TAPS];
  // Initialize with current config
  for (int i = 0; i < NUM_TAPS; i++) {
    allValvePins[i] = tapConfig[i].valvePin;
    allSensorPins[i] = tapConfig[i].sensorPin;
  }
  for (JsonVariant t : tapsArr) {
    int id = t["id"] | -1;
    if (id < 0 || id >= NUM_TAPS) {
      return "{\"type\":\"error\",\"code\":\"INVALID_TAP\",\"message\":\"tapId " + String(id) + " fora do range 0-" + String(NUM_TAPS-1) + "\"}";
    }
    int vp = t["valve_pin"] | -1;
    int sp = t["sensor_pin"] | -1;
    float ppl = t["pulsos_por_litro"] | -1.0f;
    float mps = t["ml_por_segundo"] | -1.0f;
    if (vp != -1 && !isAllowedGpio(vp)) {
      return "{\"type\":\"error\",\"code\":\"INVALID_PIN\",\"message\":\"valve_pin " + String(vp) + " nao permitido no XIAO ESP32-S3\"}";
    }
    if (sp != -1 && !isAllowedGpio(sp)) {
      return "{\"type\":\"error\",\"code\":\"INVALID_PIN\",\"message\":\"sensor_pin " + String(sp) + " nao permitido no XIAO ESP32-S3\"}";
    }
    if (vp != -1 && sp != -1 && vp == sp) {
      return "{\"type\":\"error\",\"code\":\"PIN_CONFLICT\",\"message\":\"Tap " + String(id) + ": valve_pin == sensor_pin (" + String(vp) + ")\"}";
    }
    // Validate calibration bounds
    if (ppl > 0 && ppl > 10000) {
      return "{\"type\":\"error\",\"code\":\"INVALID_CALIBRATION\",\"message\":\"pulsos_por_litro " + String(ppl) + " fora do range (max 10000)\"}";
    }
    if (mps > 0 && mps > 500) {
      return "{\"type\":\"error\",\"code\":\"INVALID_CALIBRATION\",\"message\":\"ml_por_segundo " + String(mps) + " fora do range (max 500)\"}";
    }
    // Collect pins for cross-tap conflict check
    if (vp != -1) allValvePins[id] = vp;
    if (sp != -1) allSensorPins[id] = sp;
  }
  // Cross-tap pin conflict check
  for (int i = 0; i < NUM_TAPS; i++) {
    for (int j = i + 1; j < NUM_TAPS; j++) {
      if (allValvePins[i] == allValvePins[j]) {
        return "{\"type\":\"error\",\"code\":\"PIN_CONFLICT\",\"message\":\"Taps " + String(i) + " e " + String(j) + " compartilham valve_pin " + String(allValvePins[i]) + "\"}";
      }
      if (allSensorPins[i] == allSensorPins[j]) {
        return "{\"type\":\"error\",\"code\":\"PIN_CONFLICT\",\"message\":\"Taps " + String(i) + " e " + String(j) + " compartilham sensor_pin " + String(allSensorPins[i]) + "\"}";
      }
      if (allValvePins[i] == allSensorPins[j] || allSensorPins[i] == allValvePins[j]) {
        return "{\"type\":\"error\",\"code\":\"PIN_CONFLICT\",\"message\":\"Conflito de pinos entre Taps " + String(i) + " e " + String(j) + "\"}";
      }
    }
  }

  // Close all valves before reconfiguring pins
  for (int i = 0; i < NUM_TAPS; i++) {
    if (tapState[i].isDispensing) {
      closeValveTap(i);
      tapState[i].isDispensing = false;
      tapState[i].phase = TAP_PHASE_IDLE;
    }
  }

  // Detach current ISRs
  detachInterrupt(digitalPinToInterrupt(tapConfig[0].sensorPin));
  if (NUM_TAPS > 1) {
    detachInterrupt(digitalPinToInterrupt(tapConfig[1].sensorPin));
  }

  // Apply new config
  for (JsonVariant t : tapsArr) {
    int id = t["id"];
    int vp = t["valve_pin"] | -1;
    int sp = t["sensor_pin"] | -1;
    float ppl = t["pulsos_por_litro"] | -1.0f;
    float mps = t["ml_por_segundo"] | -1.0f;

    if (vp != -1) tapConfig[id].valvePin = vp;
    if (sp != -1) tapConfig[id].sensorPin = sp;
    if (ppl > 0) tapConfig[id].pulsosPorLitro = ppl;
    if (mps > 0) tapConfig[id].mlPorSegundo = mps;

    Serial.println("[SET_CONFIG] Applied tap" + String(id) +
      " valvePin=" + String(tapConfig[id].valvePin) +
      " sensorPin=" + String(tapConfig[id].sensorPin) +
      " ppl=" + String(tapConfig[id].pulsosPorLitro) +
      " mps=" + String(tapConfig[id].mlPorSegundo));
  }

  // Persist pin config to NVS
  for (int i = 0; i < NUM_TAPS; i++) {
    String kVP = "tap" + String(i) + "_vpin";
    String kSP = "tap" + String(i) + "_spin";
    preferences.putInt(kVP.c_str(), tapConfig[i].valvePin);
    preferences.putInt(kSP.c_str(), tapConfig[i].sensorPin);
  }
  // Also save calibration
  saveSettings();

  // Re-apply pin modes and ISRs
  applyTapPins();

  // Get tapsVersion from doc if present
  int tapsVersion = doc["tapsVersion"] | 0;

  // Build ACK response (matching what ESP32Context expects in 'config_applied' handler)
  JsonDocument resp;
  resp["type"] = "config_applied";
  resp["stage"] = "config_applied";
  resp["applied"] = true;
  resp["tapsVersion"] = tapsVersion;
  resp["num_taps"] = NUM_TAPS;
  JsonArray appliedTaps = resp["taps"].to<JsonArray>();
  for (int i = 0; i < NUM_TAPS; i++) {
    JsonObject tap = appliedTaps.add<JsonObject>();
    tap["id"] = i;
    tap["valve_pin"] = tapConfig[i].valvePin;
    tap["sensor_pin"] = tapConfig[i].sensorPin;
    tap["pulsos_por_litro"] = tapConfig[i].pulsosPorLitro;
    tap["ml_por_segundo"] = tapConfig[i].mlPorSegundo;
  }

  String json;
  serializeJson(resp, json);
  return json;
}

void applyTapPins() {
  for (int i = 0; i < NUM_TAPS; i++) {
    pinMode(tapConfig[i].valvePin, OUTPUT);
    digitalWrite(tapConfig[i].valvePin, LOW);
    pinMode(tapConfig[i].sensorPin, INPUT_PULLUP);

    Serial.println("[PINS] Tap " + String(i) + ": valve=GPIO" +
      String(tapConfig[i].valvePin) + " sensor=GPIO" + String(tapConfig[i].sensorPin));
  }

  // Re-attach ISRs (only supports 2 taps currently via dedicated ISR functions)
  resetPulseCounter(0);
  resetPulseCounter(1);
  attachInterrupt(digitalPinToInterrupt(tapConfig[0].sensorPin), flowPulseCounter0, FALLING);
  if (NUM_TAPS > 1) {
    attachInterrupt(digitalPinToInterrupt(tapConfig[1].sensorPin), flowPulseCounter1, FALLING);
  }
  Serial.println("[PINS] ISRs re-attached OK");
}

// ============================================================================
// v4.1.1: OTA UPDATE via HTTP — reescrito para corrigir 3 bugs:
//   Bug 1: Auth dentro do upload callback não funciona (requestAuthentication()
//           não pode enviar headers 401 no meio de um stream multipart)
//   Bug 2: PowerShell envia Content-Type:application/octet-stream (raw body),
//           mas o upload callback só dispara com multipart/form-data.
//           O novo /ota lê o body diretamente do stream TCP.
//   Bug 3: server.header("Content-Length") retornava "" porque
//           collectHeaders() não era chamado antes de server.begin()
//           (corrigido em initHTTPServer()).
//
// Endpoints disponíveis após este fix:
//   POST /ota          → raw binary  (PowerShell, curl --data-binary)
//   POST /ota/upload   → multipart   (curl -F, browsers)
//   GET  /ota          → status JSON
// ============================================================================

void initOTA() {
  if (!otaEnabled) {
    Serial.println("[OTA] Disabled via NVS flag");
    return;
  }

  // ── GET /ota ─ página de status ──────────────────────────────────────────
  server.on("/ota", HTTP_GET, []() {
    sendCORSHeaders();
    String json = String("{\"ota\":\"ready\",\"firmware\":\"") + FIRMWARE_VERSION +
                  "\",\"chip\":\"" + ESP.getChipModel() +
                  "\",\"method\":\"POST /ota  Content-Type:application/octet-stream  Authorization:Basic <base64>\"}";
    server.send(200, "application/json", json);
  });

  // ── OPTIONS /ota ─ preflight CORS ────────────────────────────────────────
  server.on("/ota", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    server.send(204);
  });

  // ── POST /ota ─ raw binary body (PowerShell Invoke-RestMethod / curl --data-binary)
  //
  // O ESP32 Arduino WebServer NÃO consome o body para Content-Type que não
  // seja application/x-www-form-urlencoded ou multipart/form-data.
  // Logo, server.client().readBytes() lê o body intacto do buffer TCP.
  // O Content-Length é capturado via server.collectHeaders() (ver initHTTPServer).
  //
  // Uso PowerShell:
  //   $cred = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:kiosk2026"))
  //   Invoke-RestMethod -Uri http://192.168.4.1/ota -Method Post `
  //     -Headers @{"Authorization"="Basic $cred"} `
  //     -InFile firmware.ino.bin -ContentType application/octet-stream -TimeoutSec 180
  //
  // Uso curl:
  //   curl -X POST http://192.168.4.1/ota -u admin:kiosk2026 \
  //        -H "Content-Type: application/octet-stream" \
  //        --data-binary @firmware.ino.bin --max-time 180
  // ─────────────────────────────────────────────────────────────────────────
  server.on("/ota", HTTP_POST, []() {
    sendCORSHeaders();

    // 1) Autenticação ────────────────────────────────────────────────────────
    if (!server.authenticate(otaUsername.c_str(), otaPassword.c_str())) {
      return server.requestAuthentication();
    }

    // 2) Content-Length ───────────────────────────────────────────────────────
    String clHeader = server.header("Content-Length");
    int contentLength = clHeader.toInt();

    if (contentLength <= 0) {
      Serial.println("[OTA] Content-Length ausente ou zero");
      server.send(400, "application/json",
        "{\"error\":\"Content-Length obrigatorio\",\"dica\":\"Use -InFile no PowerShell ou --data-binary no curl\"}");
      return;
    }
    if (contentLength > 4 * 1024 * 1024) {
      server.send(400, "application/json", "{\"error\":\"Arquivo maior que 4MB\"}");
      return;
    }

    Serial.printf("[OTA] Iniciando: %d bytes\n", contentLength);

    // 3) Update.begin ─────────────────────────────────────────────────────────
    if (!Update.begin(contentLength)) {
      String err = String("{\"error\":\"Update.begin: ") + Update.errorString() + "\"}";
      Serial.println("[OTA] " + err);
      server.send(500, "application/json", err);
      return;
    }

    // 4) Leitura do stream TCP ────────────────────────────────────────────────
    WiFiClient& client = server.client();
    uint8_t buf[512];
    int remaining    = contentLength;
    int bytesWritten = 0;
    unsigned long lastLog = millis();

    while (remaining > 0) {
      esp_task_wdt_reset();

      int toRead    = min((int)sizeof(buf), remaining);
      int bytesRead = client.readBytes(buf, toRead);

      if (bytesRead <= 0) {
        Update.abort();
        Serial.printf("[OTA] Stream encerrou cedo: %d/%d bytes\n", bytesWritten, contentLength);
        server.send(500, "application/json",
          "{\"error\":\"Stream encerrado antes do fim do arquivo\"}");
        return;
      }

      size_t written = Update.write(buf, bytesRead);
      if ((int)written != bytesRead) {
        Update.abort();
        String err = String("{\"error\":\"Write: ") + Update.errorString() + "\"}";
        Serial.println("[OTA] " + err);
        server.send(500, "application/json", err);
        return;
      }

      remaining    -= bytesRead;
      bytesWritten += bytesRead;

      if (millis() - lastLog > 2000) {
        Serial.printf("[OTA] %d/%d bytes (%.0f%%)\n",
          bytesWritten, contentLength,
          (float)bytesWritten / contentLength * 100.0f);
        lastLog = millis();
      }
    }

    // 5) Finalizar ────────────────────────────────────────────────────────────
    if (!Update.end(true)) {
      String err = String("{\"error\":\"Update.end: ") + Update.errorString() + "\"}";
      Serial.println("[OTA] " + err);
      server.send(500, "application/json", err);
      return;
    }

    Serial.printf("[OTA] Sucesso! %d bytes gravados. Reiniciando...\n", bytesWritten);
    server.send(200, "application/json",
      String("{\"success\":true,\"bytes\":") + bytesWritten +
      ",\"message\":\"Firmware atualizado. Reiniciando em 1s...\"}");
    delay(1000);
    ESP.restart();
  });

  // ── POST /ota/upload ─ multipart (curl -F, browser form) ─────────────────
  //
  // Uso:
  //   curl -u admin:kiosk2026 -F "firmware=@firmware.ino.bin" http://192.168.4.1/ota/upload
  // ─────────────────────────────────────────────────────────────────────────
  server.on("/ota/upload", HTTP_POST, []() {
    sendCORSHeaders();
    if (Update.hasError()) {
      String err = String("{\"error\":\"") + Update.errorString() + "\"}";
      server.send(500, "application/json", err);
    } else {
      server.send(200, "application/json",
        "{\"success\":true,\"message\":\"Firmware atualizado. Reiniciando...\"}");
      delay(1000);
      ESP.restart();
    }
  }, []() {
    static bool authOk = false;
    HTTPUpload& upload  = server.upload();

    if (upload.status == UPLOAD_FILE_START) {
      // Verificar auth — se falhar, abortar update para que hasError()=true
      authOk = server.authenticate(otaUsername.c_str(), otaPassword.c_str());
      if (!authOk) {
        Serial.println("[OTA/upload] Auth falhou");
        Update.abort();
        return;
      }
      Serial.printf("[OTA/upload] Start: %s\n", upload.filename.c_str());
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Serial.printf("[OTA/upload] begin(): %s\n", Update.errorString());
      }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (!authOk) return;
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Serial.printf("[OTA/upload] write(): %s\n", Update.errorString());
      }
      esp_task_wdt_reset();
    } else if (upload.status == UPLOAD_FILE_END) {
      if (!authOk) return;
      if (Update.end(true)) {
        Serial.printf("[OTA/upload] Sucesso: %u bytes\n", upload.totalSize);
      } else {
        Serial.printf("[OTA/upload] end(): %s\n", Update.errorString());
      }
    }
  });

  Serial.println("[OTA] Endpoints prontos:");
  Serial.println("  POST /ota          raw binary (PowerShell / curl --data-binary)");
  Serial.println("  POST /ota/upload   multipart  (curl -F)");
  Serial.println("  GET  /ota          status JSON");
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
