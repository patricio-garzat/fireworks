"use strict";
/* haptics.js: capa de vibración.
   - En la app de iOS (Capacitor) usa el plugin Haptics, que llama a UIFeedbackGenerator / Core Haptics.
   - En Android (Chrome) usa navigator.vibrate, que sí funciona de verdad.
   - En Safari de iPhone no hay vibración disponible para páginas web: aquí no se finge nada,
     y Ajustes lo dice ("Solo en la app de iPhone"). */

const Haptics = (() => {
  const plugin = () => (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Haptics) || null;
  const webVibrate = () => typeof navigator.vibrate === "function" && !/iPhone|iPad|iPod/.test(navigator.userAgent);
  let last = 0;

  const available = () => !!plugin() || webVibrate();
  const on = () => Settings.haptics && available();

  // style: "LIGHT" | "MEDIUM" | "HEAVY"
  function impact(style = "LIGHT", minGap = 40) {
    if (!on()) return;
    const now = performance.now();
    if (now - last < minGap) return; // varias explosiones juntas no se vuelven un zumbido continuo
    last = now;
    const p = plugin();
    if (p) { try { p.impact({ style }); } catch (e) {} return; }
    navigator.vibrate(style === "HEAVY" ? 28 : style === "MEDIUM" ? 16 : 8);
  }

  return {
    available,
    tap: () => impact("LIGHT", 30),
    burst: (power) => impact(power > 1.5 ? "HEAVY" : power > 0.9 ? "MEDIUM" : "LIGHT", 70),
    tick: () => {
      if (!on()) return;
      const p = plugin();
      if (p && p.selectionChanged) { try { p.selectionStart && p.selectionStart(); p.selectionChanged(); p.selectionEnd && p.selectionEnd(); } catch (e) {} }
      else impact("LIGHT", 20);
    },
    success: () => {
      if (!on()) return;
      const p = plugin();
      if (p && p.notification) { try { p.notification({ type: "SUCCESS" }); } catch (e) {} }
      else navigator.vibrate && navigator.vibrate([12, 60, 18]);
    },
  };
})();
