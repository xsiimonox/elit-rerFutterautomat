# Elitärer Ultimativer Futterautomat - bebilderte Bauanleitung

Diese Anleitung beschreibt den Aufbau fuer einen ESP32-WROOM-32E mit zwei 2-poligen DC-Motoren, die ueber H-Bruecken angesteuert werden: eine vor/zurueck drehende Peristaltikpumpe und ein DC-Ruehrmotor. Dazu kommt eine 8x8 WS2812 LED-Matrix.

![Verdrahtung](assets/wiring.svg)

## Funktion

![Ablauf](assets/flow.svg)

Pro Fuetterungszeit passiert automatisch:

1. 30 Sekunden vor der eingestellten Zeit startet der DC-Ruehrmotor.
2. Der Ruehrmotor laeuft 20 Sekunden.
3. Danach wartet das System bis zur exakten Fuetterungszeit.
4. Die Peristaltikpumpe dosiert die eingestellte Futtermenge.
5. Danach dreht die Pumpe rueckwaerts und zieht die eingestellte Rueckzugsmenge ein.

## WLAN Setup

Die WLAN-Daten muessen nicht im Code eingetragen werden.

Beim ersten Start oder wenn das gespeicherte WLAN nicht erreichbar ist, oeffnet der ESP32 diesen Setup-Hotspot:

```text
SSID: EU-Futterautomat-Setup
Passwort: futter1234
Adresse: http://192.168.4.1
```

Viele Handys zeigen automatisch ein Anmeldefenster. Falls nicht, verbinde dich mit dem Hotspot und oeffne `http://192.168.4.1` im Browser. Dort kannst du WLAN-Name und Passwort eintragen. Nach erfolgreicher Verbindung schliesst der ESP32 den Hotspot und ist im Haus-WLAN ueber seine Router-IP erreichbar.

## Bauteile

- ESP32-WROOM-32E Dev Board
- Peristaltikpumpe mit 2-poligem DC-Motor
- 2-poliger DC-Ruehrmotor
- 2 H-Bruecken-Kanaele, z. B. TB6612FNG, L298N oder DRV8833
- 8x8 WS2812B LED-Matrix mit 64 LEDs, Anschluesse: 5V, GND, DIN
- Externes Netzteil passend zu Motoren und LED-Matrix
- Schlaeuche fuer Fluessigfutter
- Rueckschlagventil, wenn mechanisch sinnvoll
- Gemeinsame Masseleitung
- Optional: 330-470 Ohm Widerstand in der WS2812-Datenleitung
- Optional: 470-1000 uF Elko am 5V-Eingang der LED-Matrix

## Pinbelegung

| Funktion | ESP32 Pin | Anschluss |
|---|---:|---|
| Pumpe PWM / Enable | GPIO25 | EN/PWM der Pumpen-H-Bruecke |
| Pumpe Richtung 1 | GPIO26 | IN1 der Pumpen-H-Bruecke |
| Pumpe Richtung 2 | GPIO27 | IN2 der Pumpen-H-Bruecke |
| Ruehrmotor PWM / Enable | GPIO14 | EN/PWM der Ruehrmotor-H-Bruecke |
| Ruehrmotor Richtung 1 | GPIO33 | IN1 der Ruehrmotor-H-Bruecke |
| Ruehrmotor Richtung 2 | GPIO32 | IN2 der Ruehrmotor-H-Bruecke |
| WS2812B DIN | GPIO4 | Daten-Eingang DIN der 8x8 Matrix |
| WS2812B 5V | Externes 5V Netzteil | 5V/VCC der Matrix, nicht vom ESP32-3V3 |
| WS2812B GND | Gemeinsame Masse | GND der Matrix mit ESP32-GND und Netzteil-GND verbinden |
| Masse | GND | GND von Netzteil, H-Bruecken, LED-Matrix und ESP32 verbinden |

## Wichtige Hinweise zur Stromversorgung

Der ESP32 darf die Motoren und die LED-Matrix nicht direkt versorgen. Nutze ein externes Netzteil fuer Motoren und LEDs. Wichtig ist, dass alle GND-Leitungen verbunden sind:

- GND ESP32
- GND H-Bruecken
- GND Motor-Netzteil
- GND LED-Matrix
- 5V Netzteil an 5V/VCC der WS2812B Matrix
- GPIO4 an DIN der WS2812B Matrix

Die WS2812-Matrix kann bei voller Helligkeit viel Strom ziehen. Eine 8x8 Matrix hat 64 LEDs. Bei Weiss und voller Helligkeit koennen theoretisch bis zu ca. 3,8 A fliessen. In diesem Projekt sollte die Helligkeit begrenzt werden.

## Aufbau Schritt fuer Schritt

1. ESP32 noch nicht mit den Motoren verbinden.
2. H-Bruecke fuer die Peristaltikpumpe anschliessen.
3. Die zwei Leitungen der Pumpe an OUT1/OUT2 der Pumpen-H-Bruecke anschliessen.
4. GPIO25, GPIO26 und GPIO27 mit EN/PWM, IN1 und IN2 der Pumpen-H-Bruecke verbinden.
5. H-Bruecke fuer den Ruehrmotor anschliessen.
6. Die zwei Leitungen des Ruehrmotors an OUT1/OUT2 der Ruehrmotor-H-Bruecke anschliessen.
7. GPIO14, GPIO33 und GPIO32 mit EN/PWM, IN1 und IN2 der Ruehrmotor-H-Bruecke verbinden.
8. WS2812B Matrix mit externem 5V an 5V/VCC und GND versorgen.
9. GPIO4 ueber optional 330-470 Ohm an DIN der Matrix anschliessen.
10. Alle GNDs miteinander verbinden.
11. ESP32 per USB flashen.
12. Im seriellen Monitor die IP-Adresse ablesen.
13. Browser im gleichen Netzwerk oeffnen und die IP-Adresse aufrufen.

## Kalibrierung

1. Schlauch mit Fluessigfutter fuellen.
2. Eine definierte Zeit pumpen, z. B. 10 Sekunden.
3. Ausgetretene Menge in ml messen.
4. `mlPerSec` berechnen:

```text
mlPerSec = gemessene_ml / sekunden
```

Beispiel:

```text
25 ml in 10 Sekunden = 2.5 ml/s
```

## Rueckzugsmenge einstellen

Die Rueckzugsmenge ist die Menge, die nach der Dosierung wieder zurueckgezogen wird. Sie soll den Schlauch sauber halten, aber nicht zu viel Futter aus dem Aquarium oder Luft in ungewollte Bereiche ziehen.

Starte vorsichtig, z. B. mit 2-5 ml, und pruefe mechanisch, ob der Schlauch danach sauber bleibt.

## GitHub Pages Simulation

Die Simulation liegt im Ordner `docs/`.

GitHub Pages aktivieren:

1. Repository auf GitHub oeffnen.
2. `Settings` oeffnen.
3. `Pages` auswaehlen.
4. Source auf `Deploy from a branch` stellen.
5. Branch `main` waehlen.
6. Folder `/docs` waehlen.
7. Speichern.

Danach ist die Simulation unter einer Adresse wie dieser erreichbar:

```text
https://DEINNAME.github.io/REPOSITORY-NAME/
```
