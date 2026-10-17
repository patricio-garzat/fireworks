#!/bin/bash
# Arma y sube un build nuevo de Fireworks a App Store Connect (TestFlight), sin abrir Xcode.
# Uso:  ./release.sh            → sube el número de build en 1 y lo sube
#       ./release.sh 1.1        → además cambia la versión a 1.1
# Ojo: si una versión ya fue aprobada por Apple, no acepta builds nuevos con ese número:
#      hay que subir con una versión mayor (por ejemplo ./release.sh 1.0.1).
# Usa la clave del estudio: ~/.appstoreconnect/cubeswipe.env con ASC_KEY_ID, ASC_ISSUER_ID y ASC_KEY_PATH (clave Admin).
set -euo pipefail
cd "$(dirname "$0")"
source "$HOME/.appstoreconnect/cubeswipe.env"
PBX=ios/App/App.xcodeproj/project.pbxproj

BUILD=$(( $(grep -m1 -o 'CURRENT_PROJECT_VERSION = [0-9]*' "$PBX" | grep -o '[0-9]*$') + 1 ))
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $BUILD;/g" "$PBX"
if [ $# -ge 1 ]; then sed -i '' "s/MARKETING_VERSION = [0-9.]*;/MARKETING_VERSION = $1;/g" "$PBX"; fi
VERSION=$(grep -m1 -o 'MARKETING_VERSION = [0-9.]*' "$PBX" | grep -o '[0-9.]*$')
echo "Fireworks $VERSION ($BUILD)"

npm run build
ARCH="$HOME/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/Fireworks $VERSION ($BUILD).xcarchive"
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ARCH" -derivedDataPath ios/DerivedData "${AUTH[@]}" archive | grep -E 'error:|ARCHIVE (SUCCEEDED|FAILED)'
rm -rf build/export
xcodebuild -exportArchive -archivePath "$ARCH" -exportOptionsPlist ExportOptions.plist -exportPath build/export "${AUTH[@]}" \
  | grep -E 'error:|Upload succeeded|EXPORT (SUCCEEDED|FAILED)|Uploaded'
echo "Subido Fireworks $VERSION ($BUILD). Esperando a que Apple lo procese…"
node tools/asc-status.js "$BUILD" 25
