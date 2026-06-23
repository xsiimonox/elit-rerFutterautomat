# Elitärer Ultimativer Futterautomat

ESP32-WROOM-32E Projekt fuer den Elitaeren Ultimativen Futterautomaten fuer Meerwasser-Aquarien.

## Funktionen

- Weboberflaeche im lokalen WLAN
- Frei einstellbare Fuetterungszeiten
- Futtermenge pro Zeitpunkt in ml
- Einstellbare Rueckzugsmenge in ml, damit der Schlauch sauber bleibt
- 30 Sekunden vor der Fuetterung ruehrt der DC-Motor fuer 20 Sekunden
- Danach dosiert die Pumpe die eingestellte Menge
- Danach zieht die Pumpe die eingestellte Rueckzugsmenge zurueck
- 8x8 WS2812 LED-Matrix Vorschau in der Simulation
- WLAN-Setup per eigenem Hotspot/Captive Portal, keine WLAN-Daten im Code noetig

## GitHub Pages Simulation

Die statische Simulation liegt in `docs/` und funktioniert ohne Server.

Lokal testen:

```sh
python3 -m http.server 8080 -d docs
```

Dann oeffnen:

```text
http://localhost:8080
```

Auf GitHub aktivieren:

1. Repository auf GitHub oeffnen.
2. `Settings` -> `Pages`.
3. Source: `Deploy from a branch`.
4. Branch: `main`.
5. Folder: `/docs`.
6. Speichern.

## Bebilderte Bauanleitung

Die Anleitung mit Pinbelegung, Ablaufgrafik und Verdrahtung liegt hier:

[docs/anleitung.html](docs/anleitung.html)

Markdown-Version:

[docs/Bauanleitung.md](docs/Bauanleitung.md)

## Flashen

ESP32-Code:

[esp32/ElitaererUltimativerFutterautomat/ElitaererUltimativerFutterautomat.ino](esp32/ElitaererUltimativerFutterautomat/ElitaererUltimativerFutterautomat.ino)

WLAN-Daten muessen nicht mehr im Code stehen. Beim ersten Start oeffnet der ESP32 den Hotspot `EU-Futterautomat-Setup`.

Setup-Hotspot:

```text
SSID: EU-Futterautomat-Setup
Passwort: futter1234
Adresse: http://192.168.4.1
```

Nach erfolgreicher Verbindung mit dem Haus-WLAN schliesst der ESP32 den Setup-Hotspot. Wenn das Haus-WLAN verloren geht, oeffnet er den Setup-Hotspot wieder.

Mit PlatformIO flashen:

```sh
tools/flash/flash_platformio.sh
```

Oder:

```sh
pio run -t upload
```

Serieller Monitor:

```sh
pio device monitor
```

## Pinbelegung kurz

| Funktion | ESP32 Pin |
|---|---:|
| Pumpen-H-Bruecke EN/PWM | GPIO25 |
| Pumpen-H-Bruecke IN1 | GPIO26 |
| Pumpen-H-Bruecke IN2 | GPIO27 |
| Ruehrmotor-H-Bruecke EN/PWM | GPIO14 |
| Ruehrmotor-H-Bruecke IN1 | GPIO33 |
| Ruehrmotor-H-Bruecke IN2 | GPIO32 |
| WS2812B 8x8 DIN | GPIO4 |
| WS2812B 8x8 5V | Externes 5V Netzteil |
| WS2812B 8x8 GND | Gemeinsame Masse |
| Gemeinsame Masse | GND |

Die beiden Motoren sind 2-polige DC-Motoren und werden ueber H-Bruecken an OUT1/OUT2 angeschlossen. Die WS2812B Matrix braucht 5V, GND und DIN; nur DIN geht an GPIO4. Motoren und LED-Matrix brauchen eine passende externe Stromversorgung. Alle GNDs muessen verbunden sein.

## Lokaler Node-Mock

Zusaetzlich gibt es einen Node-Mock mit API/WebSocket:

```sh
node mock/server.mjs
```

Oeffnen:

```text
http://localhost:8080
```
