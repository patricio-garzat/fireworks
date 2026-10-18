# Fireworks: publicarlo en la App Store

Casi todo se llena solo por la API de App Store Connect (con la clave Admin del estudio): el build, la ficha en inglés y español, las capturas, la categoría, la clasificación por edad y el precio. **Lo único que Apple no deja hacer por la API** está marcado con **(tú)**.

## Datos de la app

| Dato | Valor |
|---|---|
| Nombre en la App Store | **Fireworks: Calm Night Sky** (debajo del ícono en el iPhone dice "Fireworks"). En español: **Fireworks: Noche Tranquila** |
| Bundle ID | `com.blubergames.fireworks` (registrado por la API el 18 oct 2026) |
| SKU | `fireworks-ios-001` |
| Equipo | Patricio Garza T (Team ID `CGW77RJS5Q`) |
| Versión | 1.0.0 |
| Dispositivos | Solo iPhone, en vertical · iOS 15+ |
| Encriptación | No usa (`ITSAppUsesNonExemptEncryption = false` en el `Info.plist`) |
| Categoría | Games → Casual · Games → Simulation |
| Edad | 4+ (todo "None") |
| Precio | Gratis |

## Pasos

1. **(tú) Crear la app** en <https://appstoreconnect.apple.com> → Apps → **+** → **New App**: iOS · Name `Fireworks: Calm Night Sky` (si está ocupado: `Fireworks: Calm Sky Show`) · English (U.S.) · Bundle ID `com.blubergames.fireworks` · SKU `fireworks-ios-001` · Full Access.
2. **Subir el build:** `./release.sh` (sube el número de build, hace el archive y lo sube; espera a que Apple lo procese).
3. **Ficha, capturas, categoría, edad y precio:** por la API (los textos de abajo y las capturas de `store/`).
4. **(tú) App Privacy:** Get Started → **"No, we do not collect data from this app"** → Save → Publish. Es correcto: no hay cuentas, analítica ni anuncios; el avance y la foto de "Your Photo" se quedan en el iPhone (así lo dice <https://blubergames.com/privacy/>).
5. **(tú) App Review Information:** tu nombre, teléfono y correo (solo los ve Apple). Las notas ya van llenas.
6. **(tú) Add for Review → Submit to App Review.**

## Capturas (`store/`)

Hechas con el juego real (`node store/make-shots.mjs`): 6 por tamaño, en inglés y español.

- `appstore-6.9/{en,es}/` → 1290 × 2796 (iPhone 6.9")
- `appstore-6.3/{en,es}/` → 1206 × 2622 (iPhone 6.3")

1. Paint the night sky · 2. 27 kinds of fireworks · 3. Design your own (el Taller) · 4. Draw it. Launch it. · 5. Grand finales · 6. Calm, living scenes

## Textos de la ficha

### English (U.S.)

**Name:** Fireworks: Calm Night Sky
**Subtitle:** Paint the night with light
**Promotional Text:** Tap the night sky and watch it bloom. 27 kinds of fireworks, a Workshop to design your own, and a grand finale that is different every time.
**Keywords:** `fireworks,relaxing,calm,asmr,night sky,firework show,zen,satisfying,new year,celebration,sparkle`

**Description:**
```
Fireworks is a calm, beautiful toy for the night sky.

Tap anywhere and a firework rises, whistles and blooms right where you touched. Hold to charge a bigger shell. Swipe to light a chain across the sky. Every burst sounds warm and soft, with real crackles and a gentle echo over the water.

• 27 kinds of fireworks: golden willows, chrysanthemums, hearts, stars, jellyfish, fish, lanterns, fireflies, a silver curtain and more
• Firework Workshop: design your own with shape, colors, ending, tail and whistle
• Draw a shape with your finger and watch it written in light
• Grand finales that are different every time
• Calm, living scenes: a mountain lake, a city, desert dunes, a snowy village, a river bridge and more, with water that reflects every burst
• Your Photo: turn one of your own photos into the night sky for your show
• The real moon: the moon follows tonight's phase
• Special dates with a live countdown, like New Year, Lunar New Year, Diwali and Christmas
• Show Creator: record a show and play it back
• Zen mode: no score, no goals, just the sky
• Earn Sparks to unlock new fireworks, colors and scenes

No ads. No accounts. Everything stays on your iPhone.
Made with calm by BluBer Games.
```

### Spanish (Mexico)

**Name:** Fireworks: Noche Tranquila
**Subtitle:** Pinta la noche con luz
**Promotional Text:** Toca el cielo de noche y míralo florecer. 27 tipos de fuegos, un Taller para diseñar los tuyos y una gran final distinta cada vez.
**Keywords:** `fuegos artificiales,cohetes,relajante,asmr,cielo,noche,zen,año nuevo,pirotecnia,celebrar,luces`

**Description:**
```
Fireworks es un juguete tranquilo y hermoso para el cielo de noche.

Toca donde quieras y un fuego sube, silba y florece justo donde tocaste. Mantén presionado para cargar uno más grande. Desliza para encender una cadena en el cielo. Cada explosión suena cálida y suave, con crepitar de verdad y un eco tranquilo sobre el agua.

• 27 tipos de fuegos: sauces dorados, crisantemos, corazones, estrellas, medusas, peces, linternas, luciérnagas, una cortina de plata y más
• Taller de fuegos: diseña los tuyos con forma, colores, final, cola y silbido
• Dibuja una forma con el dedo y mírala escrita con luz
• Grandes finales, distintas cada vez
• Escenarios tranquilos y con vida: un lago entre montañas, una ciudad, dunas del desierto, un pueblo nevado, un puente sobre el río y más, con agua que refleja cada explosión
• Tu foto: convierte una foto tuya en el cielo de tu show
• La luna real: la luna sigue la fase de hoy
• Fechas especiales con cuenta regresiva en vivo, como Año Nuevo, Año Nuevo Lunar, Diwali y Navidad
• Crea tu show: graba un show y repítelo
• Modo Zen: sin puntos ni metas, solo el cielo
• Gana Sparks para desbloquear fuegos, colores y escenarios nuevos

Sin anuncios. Sin cuentas. Todo se queda en tu iPhone.
Hecho con calma por BluBer Games.
```

### Lo demás

- **Support URL:** `https://blubergames.com/support/` · **Marketing URL:** `https://blubergames.com` · **Privacy Policy URL:** `https://blubergames.com/privacy/`
- **Copyright:** `2026 BluBer Games`
- **Notas para App Review:** `No account or sign-in needed. The game works fully offline. Tap anywhere in the sky to launch fireworks; hold for a bigger one, swipe for a chain. "Your Photo" (Collection → Scenes) uses the system photo picker; the photo is processed and saved only on the device.`
- **Version Release:** manual (tú decides el día).
