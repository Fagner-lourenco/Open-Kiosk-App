/*
 * TESTE SIMPLES - ESP32-S3
 * Apenas pisca LED e envia mensagem serial
 */

// LED do XIAO ESP32S3
// GPIO21 = USER_LED interno da placa (LED amarelo)
#define LED_PIN 21  // USER_LED interno do XIAO ESP32S3

void setup() {
  Serial.begin(115200);
  delay(2000);  // Aguarda 2 segundos para estabilizar
  
  Serial.println();
  Serial.println("=== TESTE SIMPLES ===");
  Serial.println("ESP32-S3 Iniciado!");
  
  pinMode(LED_PIN, OUTPUT);
  Serial.println("LED configurado no GPIO21 (USER_LED interno)");
}

void loop() {
  Serial.println("LED ON");
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  
  Serial.println("LED OFF");
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
