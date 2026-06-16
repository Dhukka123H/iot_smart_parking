#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Servo.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "secrets.h"

// ═════════ SERVER ═════════
const int SERVER_PORT = 3000;

// ═════════ PIN MAP ═════════
#define IR_ENTRY_PIN D5
#define IR_EXIT_PIN  D6
#define SERVO_PIN    D4  

#define GREEN_LED    D3
#define RED_LED      D7

#define SDA_PIN D1
#define SCL_PIN D2

// ═════════ OBJECTS ═════════
Servo gate;
WiFiClient client;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ═════════ STATE ═════════
int availableSlots = 4;
int totalSlots = 4;

bool entryFlag = false;
bool exitFlag = false;

bool gateOpen = false;

unsigned long lastEntry = 0;
unsigned long lastExit = 0;
const int debounceTime = 3000;

// ═════════ SETUP ═════════
void setup() {
  Serial.begin(115200);

  pinMode(IR_ENTRY_PIN, INPUT_PULLUP);
  pinMode(IR_EXIT_PIN, INPUT_PULLUP);

  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);

  gate.attach(SERVO_PIN);
  closeGate();

  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init();
  lcd.backlight();

  Serial.println("\nSystem Booting...");

  connectWiFi();
  fetchStatus();   // 🔥 get initial data from server

  setRed();
  showStatus();

  Serial.println("System Ready");
}

// ═════════ LOOP ═════════
void loop() {

  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  unsigned long now = millis();

  // ENTRY
  if (digitalRead(IR_ENTRY_PIN) == LOW && !entryFlag && (now - lastEntry > debounceTime)) {
    entryFlag = true;
    lastEntry = now;

    Serial.println("\nENTRY DETECTED");
    handleEntry();
  }

  if (digitalRead(IR_ENTRY_PIN) == HIGH) entryFlag = false;

  // EXIT
  if (digitalRead(IR_EXIT_PIN) == LOW && !exitFlag && (now - lastExit > debounceTime)) {
    exitFlag = true;
    lastExit = now;

    Serial.println("\nEXIT DETECTED");
    handleExit();
  }

  if (digitalRead(IR_EXIT_PIN) == HIGH) exitFlag = false;

  delay(1000);
}

// ═════════ ENTRY ═════════
void handleEntry() {

  if (availableSlots <= 0) {
    Serial.println("FULL - Gate Locked");

    setRed();
    closeGate();
    lcdPrint("PARKING FULL", "NO SLOT TO PARK");
    delay(3000);
    showStatus();
    return;
  }

  setGreen();
  openGate();

  lcdPrint("ENTRY OPEN", slotsText());
  Serial.println("Gate OPEN");

  delay(3000);

  availableSlots--;

  sendEntryToServer();   // 🔥 SEND TO BACKEND

  closeGate();
  setRed();

  Serial.println("Gate CLOSED");
  showStatus();
}

// ═════════ EXIT ═════════
void handleExit() {

  // If no cars are available to exit
  if (availableSlots == totalSlots) {
    Serial.println("EMPTY - No cars to exit");

    setRed();          // Turn on Red LED to indicate failure
    closeGate();       // Keep the gate closed
    lcdPrint("PARKING EMPTY", "NO CARS TO EXIT");
    delay(3000);
    showStatus();
    return;
  }

  setGreen();
  openGate();

  lcdPrint("EXIT OPEN", slotsText());
  Serial.println("Gate OPEN");

  delay(3000);

  if (availableSlots < totalSlots) {
    availableSlots++;
  }

  sendExitToServer();   // 🔥 SEND TO BACKEND

  closeGate();
  setRed();

  Serial.println("Gate CLOSED");
  showStatus();
}

// ═════════ SERVER CALLS ═════════
void sendEntryToServer() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;

    String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/entry";
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST("{}");

    if (httpCode > 0) {
      Serial.println("ENTRY SENT");
      Serial.println(http.getString());
    } else {
      Serial.println("ENTRY FAILED");
    }

    http.end();
  }
}

void sendExitToServer() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;

    String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/exit";
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST("{}");

    if (httpCode > 0) {
      Serial.println("EXIT SENT");
      Serial.println(http.getString());
    } else {
      Serial.println("EXIT FAILED");
    }

    http.end();
  }
}

void fetchStatus() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;

    String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/status";
    http.begin(client, url);

    int httpCode = http.GET();

    if (httpCode > 0) {
      Serial.println("STATUS FETCHED:");
      Serial.println(http.getString());
    } else {
      Serial.println("STATUS FAILED");
    }

    http.end();
  }
}

// ═════════ LED ═════════
void setRed() {
  digitalWrite(RED_LED, LOW);
  digitalWrite(GREEN_LED, HIGH);
}

void setGreen() {
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, HIGH);
}

// ═════════ SERVO ═════════
void openGate() {
  gate.write(80);
  gateOpen = true;
}

void closeGate() {
  gate.write(20);
  gateOpen = false;
}

// ═════════ LCD ═════════
void showStatus() {
  lcd.clear();

  lcd.setCursor(0,0);
  lcd.print("Slots:");
  lcd.print(availableSlots);
  lcd.print("/");

  lcd.print(totalSlots);

  lcd.setCursor(0,1);
  lcd.print(gateOpen ? "Gate OPEN" : "Gate CLOSED");
}

void lcdPrint(String l1, String l2) {
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print(l1);
  lcd.setCursor(0,1);
  lcd.print(l2);
}

String slotsText() {
  return "Slots " + String(availableSlots) + "/" + String(totalSlots);
}

// ═════════ WIFI ═════════
void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  lcdPrint("Connecting WiFi", "");
  Serial.println("Connecting WiFi...");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  lcdPrint("WiFi Connected!", "");
  Serial.println("\nWiFi Connected!");

  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  lcdPrint("System Ready", "");
  delay(1000);

  showStatus();
}