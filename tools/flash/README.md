# Flash Tool

## PlatformIO

ESP32 per USB anschliessen und im Projektordner ausfuehren:

```sh
tools/flash/flash_platformio.sh
```

Oder direkt:

```sh
pio run -t upload
```

Seriellen Monitor oeffnen:

```sh
pio device monitor
```

## Vor dem Flashen

In `esp32/FutterautomatVita/FutterautomatVita.ino` eintragen:

```cpp
const char* WIFI_SSID = "DEIN_WLAN_NAME";
const char* WIFI_PASSWORD = "DEIN_WLAN_PASSWORT";
```

Nach dem Start gibt der ESP32 seine IP im seriellen Monitor aus. Diese IP im Browser aufrufen, wenn dein Rechner im gleichen Netzwerk ist.

