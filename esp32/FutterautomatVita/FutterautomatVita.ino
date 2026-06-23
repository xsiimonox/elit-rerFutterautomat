#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include <time.h>

WebServer server(80);
WebSocketsServer ws(81);
DNSServer dnsServer;
Preferences prefs;

constexpr uint8_t PUMP_IN1 = 26;
constexpr uint8_t PUMP_IN2 = 27;
constexpr uint8_t PUMP_EN = 25;
constexpr uint8_t MIX_IN1 = 33;
constexpr uint8_t MIX_IN2 = 32;
constexpr uint8_t MIX_EN = 14;
constexpr uint8_t LED_PIN = 4;
constexpr uint8_t LED_WIDTH = 8;
constexpr uint8_t LED_HEIGHT = 8;
constexpr uint8_t LED_COUNT = LED_WIDTH * LED_HEIGHT;

Adafruit_NeoPixel matrix(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

constexpr uint8_t PUMP_PWM_CH = 0;
constexpr uint8_t MIX_PWM_CH = 1;
constexpr uint16_t PWM_FREQ = 1000;
constexpr uint8_t PWM_BITS = 8;

constexpr uint8_t MAX_JOBS = 20;
constexpr unsigned long MIX_BEFORE_MS = 30000;
constexpr unsigned long MIX_MS = 20000;
constexpr byte DNS_PORT = 53;
const char* SETUP_AP_SSID = "Futterautomat-Setup";
const char* SETUP_AP_PASSWORD = "futter1234";
IPAddress setupApIP(192, 168, 4, 1);
String wifiSsid = "";
String wifiPassword = "";
bool setupPortalActive = false;
bool timeConfigured = false;
unsigned long lastWiFiCheck = 0;

enum State { IDLE, MIXING, WAITING, DOSING, BACKFLOW };
State state = IDLE;
unsigned long stateStart = 0;

struct Job {
  bool enabled;
  bool days[7];
  uint8_t h;
  uint8_t m;
  float ml;
};

Job jobs[MAX_JOBS];
uint8_t jobCount = 0;
float tubeML = 5.0;
float mlPerSec = 1.0;
float maxDoseML = 50.0;
uint8_t mixerSpeed = 70;
uint8_t ledBrightness = 40;
float activeML = 0.0;
unsigned long activeFeedAt = 0;
int lastStartedYday[MAX_JOBS];

const char index_html[] PROGMEM = R"rawliteral(
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Futterautomat Vita</title>
<style>
body{margin:0;background:#111418;color:#eef4f6;font-family:Arial,Helvetica,sans-serif}
main{width:min(980px,calc(100% - 28px));margin:auto;padding:20px 0}
header{display:flex;justify-content:space-between;gap:12px;align-items:center}
h1{font-size:28px;margin:0}p{color:#99a8b1}.panel{background:#1b2229;border:1px solid #33414b;border-radius:8px;padding:14px;margin-top:12px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.status{padding:10px 12px;border-radius:8px;background:#202a33;color:#28c7b7;font-weight:700;text-transform:uppercase}
label{display:grid;gap:5px;color:#99a8b1}input{min-height:38px;border:1px solid #33414b;border-radius:6px;background:#111820;color:#eef4f6;padding:7px 9px}
button{min-height:38px;border:0;border-radius:6px;background:#28c7b7;color:#061312;font-weight:700;padding:0 12px}.danger{background:#e65757;color:white}
.row{display:flex;gap:10px;align-items:end}.jobs div,.log div{background:#141b22;border-radius:6px;padding:9px;margin-top:7px}
@media(max-width:720px){.grid,.row,header{display:block}.row>*{margin-top:8px}}
</style>
</head>
<body>
<main>
<header><div><h1>Futterautomat Vita</h1><p>ESP32 Fluessigfutter-Dosierer</p></div><div class="status" id="status">idle</div></header>
<section class="grid">
<div class="panel"><h2>Manuell</h2><div class="row"><label>Menge ml<input id="manualMl" type="number" value="2.5" step="0.1"></label><button onclick="dose()">Start</button><button class="danger" onclick="stopDose()">Stop</button></div></div>
<div class="panel"><h2>Job</h2><div class="row"><label>Zeit<input id="time" type="time"></label><label>Menge ml<input id="ml" type="number" value="2.5" step="0.1"></label><button onclick="addJob()">Hinzufuegen</button></div></div>
<div class="panel"><h2>Jobs</h2><div class="jobs" id="jobs"></div></div>
<div class="panel"><h2>Log</h2><div class="log" id="log"></div></div>
</section>
</main>
<script>
let ws;const $=id=>document.getElementById(id);
function log(t){$("log").innerHTML=`<div>${new Date().toLocaleTimeString()} ${t}</div>`+$("log").innerHTML}
function render(data){$("status").textContent=data.status;if(data.jobs){$("jobs").innerHTML=data.jobs.map((j,i)=>`<div>${String(j.h).padStart(2,"0")}:${String(j.m).padStart(2,"0")} / ${j.ml} ml <button onclick="delJob(${i})">Loeschen</button></div>`).join("")||"<p>Keine Jobs.</p>"}}
async function api(path,body){const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body||{})});return r.json()}
async function addJob(){const result=await api("/api/job",{time:$("time").value,ml:Number($("ml").value)});if(!result.ok)alert(result.error)}
async function delJob(i){await api("/api/job/delete",{index:i})}
async function dose(){const result=await api("/api/dose",{ml:Number($("manualMl").value)});if(!result.ok)alert(result.error)}
async function stopDose(){await api("/api/stop",{})}
function connect(){ws=new WebSocket(`ws://${location.hostname}:81`);ws.onmessage=e=>{const d=JSON.parse(e.data);render(d);log(d.status)};ws.onclose=()=>setTimeout(connect,1000)}
fetch("/api/state").then(r=>r.json()).then(render);connect();
</script>
</body>
</html>
)rawliteral";

const char wifi_setup_html[] PROGMEM = R"rawliteral(
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Futterautomat WLAN Setup</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#14263a,#050b14 62%);color:#f3f7fb;font-family:Arial,Helvetica,sans-serif}
.card{width:min(440px,calc(100% - 28px));padding:28px;border:1px solid rgba(125,60,255,.45);border-radius:14px;background:rgba(12,23,35,.92);box-shadow:0 24px 80px rgba(0,0,0,.35)}
h1{margin:0;font-size:30px;line-height:1.05;background:linear-gradient(90deg,#ffae29,#ff4cf3,#39d8ff);-webkit-background-clip:text;color:transparent}
p{color:#aab7c4;line-height:1.45}label{display:grid;gap:7px;margin-top:16px;color:#d7e0ea}
input{min-height:44px;border:1px solid rgba(111,136,165,.35);border-radius:8px;background:#07101b;color:#f3f7fb;padding:8px 12px;font-size:16px}
button{width:100%;min-height:48px;margin-top:22px;border:0;border-radius:8px;background:linear-gradient(135deg,#7041e8,#3c149b);color:white;font-size:16px;font-weight:700}
.hint{font-size:13px}.status{margin-top:16px;padding:12px;border-radius:8px;background:#07101b;color:#38d866}
</style>
</head>
<body>
<form class="card" method="post" action="/wifi-save">
<h1>Futterautomat<br>WLAN Setup</h1>
<p>Verbinde den Futterautomaten mit deinem Haus-WLAN. Danach schaltet der ESP den Setup-Hotspot automatisch ab.</p>
<label>WLAN Name<input name="ssid" autocomplete="off" required placeholder="Mein WLAN"></label>
<label>WLAN Passwort<input name="password" type="password" autocomplete="current-password" placeholder="Passwort"></label>
<button type="submit">Verbinden</button>
<p class="hint">Setup-Hotspot: Futterautomat-Setup · Passwort: futter1234 · Adresse: 192.168.4.1</p>
</form>
</body>
</html>
)rawliteral";

void pumpStop() {
  ledcWrite(PUMP_PWM_CH, 0);
  digitalWrite(PUMP_IN1, LOW);
  digitalWrite(PUMP_IN2, LOW);
}

void pumpFwd() {
  ledcWrite(PUMP_PWM_CH, 255);
  digitalWrite(PUMP_IN1, HIGH);
  digitalWrite(PUMP_IN2, LOW);
}

void pumpBack() {
  ledcWrite(PUMP_PWM_CH, 255);
  digitalWrite(PUMP_IN1, LOW);
  digitalWrite(PUMP_IN2, HIGH);
}

void mixerRun() {
  ledcWrite(MIX_PWM_CH, map(mixerSpeed, 0, 100, 0, 255));
  digitalWrite(MIX_IN1, HIGH);
  digitalWrite(MIX_IN2, LOW);
}

void mixerStop() {
  ledcWrite(MIX_PWM_CH, 0);
  digitalWrite(MIX_IN1, LOW);
  digitalWrite(MIX_IN2, LOW);
}

void setMatrixColor(uint32_t color) {
  matrix.setBrightness(ledBrightness);
  for (uint8_t i = 0; i < LED_COUNT; i++) matrix.setPixelColor(i, color);
  matrix.show();
}

void updateMatrixStatus() {
  switch (state) {
    case MIXING:
      setMatrixColor(matrix.Color(220, 30, 40));
      break;
    case WAITING:
      setMatrixColor(matrix.Color(140, 70, 255));
      break;
    case DOSING:
      setMatrixColor(matrix.Color(30, 210, 80));
      break;
    case BACKFLOW:
      setMatrixColor(matrix.Color(40, 120, 255));
      break;
    default:
      setMatrixColor(matrix.Color(240, 190, 60));
      break;
  }
}

const char* stateName() {
  switch (state) {
    case MIXING: return "mixing";
    case WAITING: return "waiting";
    case DOSING: return "dosing";
    case BACKFLOW: return "backflow";
    default: return "idle";
  }
}

void sendStateTo(uint8_t client = 255) {
  updateMatrixStatus();
  StaticJsonDocument<2048> doc;
  doc["status"] = stateName();
  doc["ip"] = WiFi.localIP().toString();
  doc["tubeML"] = tubeML;
  doc["mlPerSec"] = mlPerSec;
  doc["maxDoseML"] = maxDoseML;
  doc["mixerSpeed"] = mixerSpeed;
  JsonArray arr = doc.createNestedArray("jobs");
  for (uint8_t i = 0; i < jobCount; i++) {
    JsonObject item = arr.createNestedObject();
    item["h"] = jobs[i].h;
    item["m"] = jobs[i].m;
    item["ml"] = jobs[i].ml;
    item["enabled"] = jobs[i].enabled;
  }
  String out;
  serializeJson(doc, out);
  if (client == 255) ws.broadcastTXT(out);
  else ws.sendTXT(client, out);
}

void persistJobs() {
  StaticJsonDocument<2048> doc;
  JsonArray arr = doc.to<JsonArray>();
  for (uint8_t i = 0; i < jobCount; i++) {
    JsonObject item = arr.createNestedObject();
    item["enabled"] = jobs[i].enabled;
    item["h"] = jobs[i].h;
    item["m"] = jobs[i].m;
    item["ml"] = jobs[i].ml;
    JsonArray days = item.createNestedArray("days");
    for (uint8_t d = 0; d < 7; d++) days.add(jobs[i].days[d]);
  }
  String out;
  serializeJson(doc, out);
  prefs.putString("jobs", out);
}

void loadJobs() {
  String raw = prefs.getString("jobs", "[]");
  StaticJsonDocument<2048> doc;
  if (deserializeJson(doc, raw)) return;
  jobCount = 0;
  for (JsonObject item : doc.as<JsonArray>()) {
    if (jobCount >= MAX_JOBS) break;
    Job& job = jobs[jobCount++];
    job.enabled = item["enabled"] | true;
    job.h = item["h"] | 0;
    job.m = item["m"] | 0;
    job.ml = item["ml"] | 1.0;
    JsonArray days = item["days"];
    for (uint8_t d = 0; d < 7; d++) job.days[d] = days.isNull() ? true : (days[d] | true);
  }
}

bool startJob(float ml) {
  if (state != IDLE) return false;
  if (ml <= 0 || ml > maxDoseML || mlPerSec <= 0) return false;
  activeML = ml;
  activeFeedAt = millis() + MIX_MS;
  state = MIXING;
  stateStart = millis();
  sendStateTo();
  return true;
}

bool startScheduledJob(float ml, unsigned long feedDelayMs) {
  if (state != IDLE) return false;
  if (ml <= 0 || ml > maxDoseML || mlPerSec <= 0) return false;
  activeML = ml;
  activeFeedAt = millis() + feedDelayMs;
  state = MIXING;
  stateStart = millis();
  sendStateTo();
  return true;
}

void updateMachine() {
  unsigned long now = millis();
  switch (state) {
    case IDLE:
      break;
    case MIXING:
      mixerRun();
      if (now - stateStart >= MIX_MS) {
        mixerStop();
        state = WAITING;
        sendStateTo();
      }
      break;
    case WAITING:
      if ((long)(now - activeFeedAt) >= 0) {
        state = DOSING;
        stateStart = now;
        sendStateTo();
      }
      break;
    case DOSING: {
      pumpFwd();
      unsigned long doseMs = (unsigned long)((activeML / mlPerSec) * 1000.0);
      if (now - stateStart >= doseMs) {
        pumpStop();
        state = BACKFLOW;
        stateStart = now;
        sendStateTo();
      }
      break;
    }
    case BACKFLOW: {
      pumpBack();
      unsigned long backMs = (unsigned long)((tubeML / mlPerSec) * 1000.0);
      if (now - stateStart >= backMs) {
        pumpStop();
        activeML = 0;
        activeFeedAt = 0;
        state = IDLE;
        sendStateTo();
      }
      break;
    }
  }
}

void checkJobs() {
  if (state != IDLE) return;
  struct tm t;
  if (!getLocalTime(&t)) return;

  uint8_t wd = t.tm_wday;
  long nowAbs = (long)t.tm_yday * 86400L + (long)t.tm_hour * 3600L + (long)t.tm_min * 60L + (long)t.tm_sec;
  for (uint8_t i = 0; i < jobCount; i++) {
    if (!jobs[i].enabled || !jobs[i].days[wd]) continue;
    if (lastStartedYday[i] == t.tm_yday) continue;

    long feedAbs = (long)t.tm_yday * 86400L + (long)jobs[i].h * 3600L + (long)jobs[i].m * 60L;
    long startAbs = feedAbs - 30L;
    if (nowAbs >= startAbs && nowAbs < feedAbs + 60L) {
      unsigned long feedDelayMs = nowAbs >= feedAbs ? 0UL : (unsigned long)(feedAbs - nowAbs) * 1000UL;
      if (startScheduledJob(jobs[i].ml, feedDelayMs)) lastStartedYday[i] = t.tm_yday;
      return;
    }
  }
}

void handleState() {
  StaticJsonDocument<2048> doc;
  doc["status"] = stateName();
  doc["ip"] = WiFi.localIP().toString();
  JsonArray arr = doc.createNestedArray("jobs");
  for (uint8_t i = 0; i < jobCount; i++) {
    JsonObject item = arr.createNestedObject();
    item["h"] = jobs[i].h;
    item["m"] = jobs[i].m;
    item["ml"] = jobs[i].ml;
  }
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handleAddJob() {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"Ungueltiges JSON\"}");
    return;
  }
  if (jobCount >= MAX_JOBS) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"Maximal 20 Jobs\"}");
    return;
  }

  const char* timeValue = doc["time"] | "";
  float ml = doc["ml"] | 0.0;
  int h = String(timeValue).substring(0, 2).toInt();
  int m = String(timeValue).substring(3, 5).toInt();
  if (h < 0 || h > 23 || m < 0 || m > 59 || ml <= 0 || ml > maxDoseML) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"Ungueltige Werte\"}");
    return;
  }

  Job& job = jobs[jobCount++];
  job.enabled = true;
  job.h = h;
  job.m = m;
  job.ml = ml;
  for (uint8_t d = 0; d < 7; d++) job.days[d] = true;
  persistJobs();
  sendStateTo();
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleDeleteJob() {
  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }
  int index = doc["index"] | -1;
  if (index < 0 || index >= jobCount) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }
  for (uint8_t i = index; i + 1 < jobCount; i++) jobs[i] = jobs[i + 1];
  jobCount--;
  persistJobs();
  sendStateTo();
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleDose() {
  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }
  bool ok = startJob(doc["ml"] | 0.0);
  server.send(ok ? 200 : 400, "application/json", ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"Kann Dosierung nicht starten\"}");
}

void handleStop() {
  pumpStop();
  mixerStop();
  activeML = 0;
  state = IDLE;
  sendStateTo();
  server.send(200, "application/json", "{\"ok\":true}");
}

bool connectWiFi(unsigned long timeoutMs = 12000) {
  if (wifiSsid.length() == 0) return false;

  WiFi.mode(setupPortalActive ? WIFI_AP_STA : WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  Serial.print("Verbinde WLAN: ");
  Serial.println(wifiSsid);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Verbunden, IP: ");
    Serial.println(WiFi.localIP());
    if (!timeConfigured) {
      configTime(3600, 3600, "pool.ntp.org", "time.nist.gov");
      timeConfigured = true;
    }
    return true;
  }

  Serial.println("WLAN Verbindung fehlgeschlagen.");
  return false;
}

void stopSetupPortal() {
  if (!setupPortalActive) return;
  dnsServer.stop();
  WiFi.softAPdisconnect(true);
  setupPortalActive = false;
  if (WiFi.status() == WL_CONNECTED) WiFi.mode(WIFI_STA);
  Serial.println("Setup-Hotspot geschlossen.");
}

void startSetupPortal() {
  if (setupPortalActive) return;
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(setupApIP, setupApIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(SETUP_AP_SSID, SETUP_AP_PASSWORD);
  dnsServer.start(DNS_PORT, "*", setupApIP);
  setupPortalActive = true;
  Serial.println("Setup-Hotspot aktiv.");
  Serial.print("SSID: ");
  Serial.println(SETUP_AP_SSID);
  Serial.print("IP: ");
  Serial.println(setupApIP);
}

void handleRoot() {
  if (WiFi.status() == WL_CONNECTED) {
    server.send_P(200, "text/html", index_html);
  } else {
    server.send_P(200, "text/html", wifi_setup_html);
  }
}

void handleWifiSave() {
  String ssid = server.arg("ssid");
  String password = server.arg("password");
  ssid.trim();

  if (ssid.length() == 0) {
    server.send(400, "text/html", "<h1>WLAN Name fehlt</h1><p><a href='/'>Zurueck</a></p>");
    return;
  }

  wifiSsid = ssid;
  wifiPassword = password;
  prefs.putString("wifiSsid", wifiSsid);
  prefs.putString("wifiPass", wifiPassword);

  server.send(200, "text/html", "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{font-family:Arial;background:#07101b;color:white;display:grid;place-items:center;min-height:100vh}.card{max-width:420px;padding:24px;border:1px solid #7d3cff;border-radius:12px;background:#111c29}p{color:#aab7c4}</style></head><body><div class='card'><h1>WLAN wird verbunden...</h1><p>Wenn alles passt, verschwindet der Setup-Hotspot gleich. Oeffne danach die IP aus dem seriellen Monitor oder schaue im Router nach.</p></div></body></html>");
  delay(600);
  if (connectWiFi(15000)) stopSetupPortal();
  else startSetupPortal();
}

void handleCaptivePortal() {
  server.sendHeader("Location", String("http://") + setupApIP.toString(), true);
  server.send(302, "text/plain", "");
}

void monitorWiFi() {
  if (millis() - lastWiFiCheck < 5000) return;
  lastWiFiCheck = millis();

  if (WiFi.status() == WL_CONNECTED) {
    if (setupPortalActive) stopSetupPortal();
    return;
  }

  if (wifiSsid.length() > 0) connectWiFi(2500);
  if (WiFi.status() != WL_CONNECTED) startSetupPortal();
}

void setup() {
  Serial.begin(115200);
  pinMode(PUMP_IN1, OUTPUT);
  pinMode(PUMP_IN2, OUTPUT);
  pinMode(MIX_IN1, OUTPUT);
  pinMode(MIX_IN2, OUTPUT);

  ledcSetup(PUMP_PWM_CH, PWM_FREQ, PWM_BITS);
  ledcSetup(MIX_PWM_CH, PWM_FREQ, PWM_BITS);
  ledcAttachPin(PUMP_EN, PUMP_PWM_CH);
  ledcAttachPin(MIX_EN, MIX_PWM_CH);
  matrix.begin();
  matrix.clear();
  matrix.show();
  pumpStop();
  mixerStop();

  prefs.begin("vita", false);
  for (uint8_t i = 0; i < MAX_JOBS; i++) lastStartedYday[i] = -1;
  tubeML = prefs.getFloat("tubeML", tubeML);
  mlPerSec = prefs.getFloat("mlPerSec", mlPerSec);
  maxDoseML = prefs.getFloat("maxDoseML", maxDoseML);
  mixerSpeed = prefs.getUChar("mixer", mixerSpeed);
  ledBrightness = prefs.getUChar("led", ledBrightness);
  wifiSsid = prefs.getString("wifiSsid", "");
  wifiPassword = prefs.getString("wifiPass", "");
  loadJobs();

  if (!connectWiFi()) startSetupPortal();

  server.on("/", HTTP_GET, handleRoot);
  server.on("/wifi-save", HTTP_POST, handleWifiSave);
  server.on("/generate_204", HTTP_GET, handleCaptivePortal);
  server.on("/gen_204", HTTP_GET, handleCaptivePortal);
  server.on("/hotspot-detect.html", HTTP_GET, handleCaptivePortal);
  server.on("/connecttest.txt", HTTP_GET, handleCaptivePortal);
  server.on("/ncsi.txt", HTTP_GET, handleCaptivePortal);
  server.on("/api/state", HTTP_GET, handleState);
  server.on("/api/job", HTTP_POST, handleAddJob);
  server.on("/api/job/delete", HTTP_POST, handleDeleteJob);
  server.on("/api/dose", HTTP_POST, handleDose);
  server.on("/api/stop", HTTP_POST, handleStop);
  server.onNotFound(handleRoot);
  server.begin();

  ws.begin();
  ws.onEvent([](uint8_t num, WStype_t type, uint8_t*, size_t) {
    if (type == WStype_CONNECTED) sendStateTo(num);
  });
}

void loop() {
  if (setupPortalActive) dnsServer.processNextRequest();
  monitorWiFi();
  server.handleClient();
  ws.loop();
  updateMachine();
  checkJobs();
}
