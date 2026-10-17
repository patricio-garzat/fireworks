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
| `brand/` | Ícono |
| `VERSION` | La versión que se ve en Ajustes |

### `src/js/`

| Archivo | Qué hace |
|---|---|
| `fx.js` | Motor de partículas (pool fijo con arreglos tipados), humo, luces y temporizadores |
| `renderer.js` | WebGL sin librerías: capa HDR con persistencia (estelas), bloom, cielo procedural, humo y reflejo del lago |
| `fireworks.js` | Paletas y las recetas de los 8 fuegos (más el gran cierre de la Gran Final) |
| `game.js` | Cohetes, Sparks, combos, Gran Final, retos y Show Creator |
| `scenes.js` | Escenarios: Noche alpina, Lago en calma y Luces de la ciudad |
| `audio.js` | Sonido procedural (Web Audio): ignición, silbido, explosiones con eco, crackles, chispas y música ambiental |
| `haptics.js` | Vibración: Capacitor Haptics en la app; en Safari web no existe y no se finge |
| `input.js` | Gestos: tocar, mantener (carga), deslizar (cadena) y multitouch |
| `ui.js`, `i18n.js`, `store.js`, `main.js` | Interfaz, textos EN/ES, guardado y arranque |

## Enlaces
- **Estudio:** https://blubergames.com
- **Guía de marca:** [`../blubergames-site/BRAND.md`](../blubergames-site/BRAND.md)
