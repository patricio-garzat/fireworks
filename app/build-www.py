"""Arma la carpeta www/ de la app de iOS a partir del juego web.

El juego vive en ../src/ y se arma en un solo archivo (../index.html) con ../tools/build.py:
lo que cambies ahí sale igual en la web y en la app. Diferencias de la app:
- Sin zoom de ninguna forma (pellizco ni doble toque).
- La versión que se ve en Ajustes → Acerca de es la de la app (MARKETING_VERSION del proyecto de Xcode, la que sube release.sh).

Uso: python3 build-www.py   (o npm run build, que además copia www/ al proyecto de Xcode)
"""
import os
import re
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
WWW = os.path.join(HERE, "www")

# Versión de la app: la del proyecto de Xcode
pbx = open(os.path.join(HERE, "ios", "App", "App.xcodeproj", "project.pbxproj"), encoding="utf-8").read()
version = re.search(r"MARKETING_VERSION = ([0-9.]+);", pbx).group(1)
build = re.search(r"CURRENT_PROJECT_VERSION = (\d+);", pbx).group(1)

# Arma ../index.html con los últimos cambios de src/ (con la versión del juego que está en ../VERSION)
game = open(os.path.join(ROOT, "VERSION"), encoding="utf-8").read().strip()
subprocess.run(["python3", os.path.join(ROOT, "tools", "build.py"), game], check=True)
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

# Sin zoom en la app: ni pellizco ni doble toque (el WKWebView además lo bloquea en AppDelegate.swift)
vp = re.search(r'<meta name="viewport" content="[^"]*">', html)
assert vp, "no encontré el viewport"
html = html.replace(vp.group(0), '<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">')
# (touch-action ya viene en el juego: none en body y manipulation en los botones; aquí no se toca)
no_zoom = """<style>html, body { -webkit-text-size-adjust: 100%; }</style>
<script>
  // Bloquea el pellizco (gestos de WebKit). Los toques con varios dedos siguen llegando al juego como pointer events.
  ["gesturestart", "gesturechange", "gestureend"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
</script>
"""
html = html.replace("</head>", no_zoom + "</head>", 1)

# Versión de la app en Ajustes (solo la versión, p. ej. 1.0.0, sin el número de build)
html, n = re.subn(r'window\.APP_VERSION = "[^"]*";', f'window.APP_VERSION = "{version}";', html, count=1)
assert n == 1, "no encontré window.APP_VERSION"

shutil.rmtree(WWW, ignore_errors=True)
os.makedirs(WWW)
shutil.copytree(os.path.join(ROOT, "brand"), os.path.join(WWW, "brand"))
open(os.path.join(WWW, "index.html"), "w", encoding="utf-8").write(html)
print("www/ listo:", len(html) // 1024, "KB · app", version, f"({build}) · juego {game}")
