#!/bin/bash
# Instala "Fireworks Dev" en el iPhone conectado (por cable o Wi-Fi), sin pasar por App Store Connect.
# Es una app aparte (com.blubergames.fireworks.dev, ícono con franja DEV): no toca la de la App Store.
# Uso: ./dev-install.sh            → compila con los últimos cambios del juego y la instala
set -euo pipefail
cd "$(dirname "$0")"
source "$HOME/.appstoreconnect/cubeswipe.env"  # la clave Admin del estudio (sirve para todos los juegos)

DEVICE=$(xcrun devicectl list devices 2>/dev/null | awk '/available \(paired\)/ && /iPhone/ {for (i=1;i<=NF;i++) if ($i ~ /^[0-9A-F-]{36}$/) {print $i; exit}}')
[ -n "$DEVICE" ] || { echo "No encontré un iPhone conectado y disponible. Conéctalo y desbloquéalo."; exit 1; }
UDID=$(xcrun devicectl device info details --device "$DEVICE" 2>/dev/null | awk '/udid:/ {print $NF; exit}')
echo "iPhone: $DEVICE ($UDID)"

npm run build >/dev/null
AUTH=(-allowProvisioningUpdates -allowProvisioningDeviceRegistration -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$UDID" -derivedDataPath ios/DerivedData-dev "${AUTH[@]}" \
  BUNDLE_ID_SUFFIX=.dev APP_DISPLAY_NAME="Fireworks Dev" APP_ICON_SUFFIX=-Dev \
  build | grep -E 'error:|BUILD (SUCCEEDED|FAILED)'

APP=ios/DerivedData-dev/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device install app --device "$DEVICE" "$APP" | grep -E -i 'installed|error' || true
xcrun devicectl device process launch --device "$DEVICE" com.blubergames.fireworks.dev >/dev/null 2>&1 || true
echo "Listo: Fireworks Dev instalada en tu iPhone."
