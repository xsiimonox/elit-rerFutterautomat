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

## WLAN nach dem Flashen

WLAN-Daten werden nicht im Code eingetragen.

Nach dem ersten Start oeffnet der ESP32 diesen Hotspot:

```text
SSID: Futterautomat-Setup
Passwort: futter1234
Adresse: http://192.168.4.1
```

Verbinde dich damit und trage im Setup-Fenster dein Haus-WLAN ein. Nach erfolgreicher Verbindung gibt der ESP32 seine IP im seriellen Monitor aus. Diese IP im Browser aufrufen, wenn dein Rechner im gleichen Netzwerk ist.
