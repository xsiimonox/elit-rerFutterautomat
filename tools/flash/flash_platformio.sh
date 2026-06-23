#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

if ! command -v pio >/dev/null 2>&1; then
  echo "PlatformIO wurde nicht gefunden."
  echo "Installiere es z. B. mit: python3 -m pip install platformio"
  exit 1
fi

pio run -t upload

