/**
 * Stufen für die Intervall-Regler (Wallpaper-Einstellungen, Bild-Widget).
 *
 * Ein <input type="range"> kennt nur EINE Schrittweite, gezählt ab `min`.
 * Eine Schrittweite, die je nach Wert wechselt (so kam #108 herein), erzeugt
 * darum krumme Werte — bei min 10 und Schritt 60 ist 610 s der nächste
 * gültige Wert, also „10m 10s" — und erreicht das Maximum nicht: mit
 * Schritt 300 ist 86 110 s der letzte gültige Wert, 23 h 55 m statt 24 h.
 * Außerdem springt der Wert beim Überqueren einer Schwelle.
 *
 * Stattdessen läuft der Regler über die POSITION in dieser Liste. Jede Stufe
 * ist ein runder Wert; fein, wo man fein einstellt (Sekunden), grob, wo es
 * nur um Stunden geht.
 */
const STOPS_SEC = [
  5, 10, 15, 20, 30, 45,
  60, 90, 120, 180, 300, 420, 600, 900, 1200, 1800, 2700,
  3600, 5400, 7200, 10800, 14400, 21600, 28800, 43200, 86400,
];

/** Alle Stufen ab `minSec` (das Bild-Widget erlaubt 5 s, der Hintergrund 10 s). */
export function intervalStops(minSec: number): number[] {
  return STOPS_SEC.filter((s) => s >= minSec);
}

/**
 * Position der Stufe, die `sec` am nächsten liegt. Ein gespeicherter Wert
 * zwischen zwei Stufen (aus der Zeit vor den Stufen) bleibt gespeichert,
 * bis jemand den Regler bewegt — die Beschriftung zeigt ihn weiter genau.
 */
export function nearestStopIndex(stops: number[], sec: number): number {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - sec) < Math.abs(stops[best] - sec)) best = i;
  }
  return best;
}

/** 45 → „45s", 90 → „1m 30s", 5400 → „1h 30m", 86400 → „24h". */
export function formatInterval(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}
