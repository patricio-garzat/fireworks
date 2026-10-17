# Fireworks · BluBer Games

El tercer juego de **BluBer Games** (nombre provisional): un simulador de fuegos artificiales tranquilo y muy satisfactorio para iPhone y la web. Toca el cielo de noche y llénalo de luz.

## Probarlo
```bash
python3 -m http.server 8795
```
Abre `http://localhost:8795/` (versión armada) o `http://localhost:8795/src/` (código fuente, sin armar). Desde el iPhone, en la misma red, entra con la IP de la Mac.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | El juego completo en un solo archivo. **Se genera**: no se edita a mano |
| `src/index.html`, `src/style.css` | La página y sus estilos |
| `src/js/` | El código, en archivos separados (ver abajo) |
| `tools/build.py` | Arma `index.html`: `python3 tools/build.py [versión]` |
| `tools/sound-lab.html` | Laboratorio de sonido: reproduce cada sonido del juego por separado y mide su volumen y sus agudos |
| `brand/` | Ícono |
| `app/` | App de iOS (Capacitor 7): ver abajo |
| `VERSION` | La versión que se ve en Ajustes |

### `src/js/`

| Archivo | Qué hace |
|---|---|
| `fx.js` | Motor de partículas (pool fijo con arreglos tipados), humo, luces y temporizadores |
| `renderer.js` | WebGL sin librerías: capa HDR con persistencia (estelas), bloom, cielo procedural, humo y reflejo del lago |
| `fireworks.js` | Paletas y las recetas de los 8 fuegos (más el gran cierre de la Gran Final) |
| `game.js` | Cohetes, Sparks, combos, Gran Final, retos y Show Creator |
| `scenes.js` | Los 10 escenarios, pintados con Canvas 2D (color + máscara de tierra y agua) |
| `photo.js` | "Tu foto": editor (zoom, mover, horizonte, noche, tierra o agua) y la foto vuelta de noche; se guarda en IndexedDB |
| `audio.js` | Sonido procedural (Web Audio): ignición, silbido, explosiones con eco, crackles, chispas y música ambiental |
| `haptics.js` | Vibración: Capacitor Haptics en la app; en Safari web no existe y no se finge |
| `input.js` | Gestos: tocar, mantener (carga), deslizar (cadena) y multitouch |
| `ui.js`, `i18n.js`, `store.js`, `main.js` | Interfaz, textos EN/ES, guardado y arranque |

## App de iOS
```bash
cd app && npm install && npm run build
```
`npm run build` arma el juego (`tools/build.py`), lo copia a `app/www/` sin zoom y con la versión de la app, y lo sincroniza con el proyecto de Xcode (`app/ios/App/App.xcodeproj`).

| Archivo | Qué hace |
|---|---|
| `app/build-www.py` | Arma `www/` a partir de `index.html` y `brand/` |
| `app/dev-install.sh` | Instala "Fireworks Dev" en el iPhone conectado (app aparte, ícono DEV) |
| `app/release.sh [versión]` | Sube el número de build, hace el archive y lo sube a App Store Connect |
| `app/tools/make-icons.py` | Genera los íconos de la app (normal y DEV) a partir de `brand/favicon.svg` |

## Enlaces
- **Estudio:** https://blubergames.com
- **Guía de marca:** [`../blubergames-site/BRAND.md`](../blubergames-site/BRAND.md)
