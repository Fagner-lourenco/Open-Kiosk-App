/*
 * TESTE SIMPLES - ESP32-S3
 * Apenas pisca LED e envia mensagem serial
 */

// LED do XIAO ESP32S3 (tente diferentes pinos se não funcionar)
#define LED_PIN 21  // D10 no XIAO

void setup() {
  Serial.begin(115200);
  delay(2000);  // Aguarda 2 segundos para estabilizar
  
  Serial.println();
  Serial.println("=== TESTE SIMPLES ===");
  Serial.println("ESP32-S3 Iniciado!");
  
  pinMode(LED_PIN, OUTPUT);
  Serial.println("LED configurado no GPIO 21");
}

void loop() {
  Serial.println("LED ON");
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  
  Serial.println("LED OFF");
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
