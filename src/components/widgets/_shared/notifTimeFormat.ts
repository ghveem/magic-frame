import { formatDistanceToNow } from "date-fns";
import { dateFnsLocale } from "@/lib/i18n/date-locale";

export type NotifTimeFormat = "auto" | "minutes" | "hours" | "days" | "combined";

/**
 * Einheitliche Alters-Anzeige für Notifications/Messages-Widgets.
 *  - auto:     "vor 5 Minuten"  (date-fns, sprachlich)
 *  - minutes:  "vor 120 min"
 *  - hours:    "vor 5 h"
 *  - days:     "vor 3 Tagen"
 *  - combined: "vor 1d 2h 5m"
 */
export function formatNotifAge(
  date: Date,
  format: NotifTimeFormat,
  nowMs: number,
  // Eigene Texte: de, nb, nn, pt-BR. Jede andere Sprache faellt auf Englisch zurueck (#89).
  locale: string = "de",
): string {
  const nor = locale === "nb" || locale === "nn";
  const en = locale !== "de" && !nor;
  if (format === "auto") {
    return formatDistanceToNow(date, { addSuffix: true, locale: dateFnsLocale(locale, "en") });
  }
  const ms = Math.max(0, nowMs - date.getTime());
  const totalMinutes = Math.floor(ms / 60_000);
  const totalHours = Math.floor(ms / 3_600_000);
  const totalDays = Math.floor(ms / 86_400_000);

  if (locale === "pt-BR") {
    if (format === "minutes") return totalMinutes <= 0 ? "agora mesmo" : `há ${totalMinutes} min`;
    if (format === "hours") return totalHours <= 0 ? "há menos de 1 h" : `há ${totalHours} h`;
    if (format === "days") return totalDays <= 0 ? "hoje" : `há ${totalDays} ${totalDays === 1 ? "dia" : "dias"}`;
    if (format === "combined") {
      if (ms < 60_000) return "agora mesmo";
      const hours = Math.floor((ms % 86_400_000) / 3_600_000);
      const minutes = Math.floor((ms % 3_600_000) / 60_000);
      const parts: string[] = [];
      if (totalDays > 0) parts.push(`${totalDays}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (totalDays === 0 && minutes > 0) parts.push(`${minutes}m`);
      return `há ${parts.join(" ")}`;
    }
  }

  if (format === "minutes") {
    if (totalMinutes <= 0) return nor ? "akkurat nå" : en ? "just now" : "gerade eben";
    return nor ? `${totalMinutes} min siden` : en ? `${totalMinutes} min ago` : `vor ${totalMinutes} min`;
  }
  if (format === "hours") {
    if (totalHours <= 0) return nor ? "<1 t siden" : en ? "<1 h ago" : "vor <1 h";
    return nor ? `${totalHours} t siden` : en ? `${totalHours} h ago` : `vor ${totalHours} h`;
  }
  if (format === "days") {
    if (totalDays <= 0) return nor ? "i dag" : en ? "today" : "heute";
    if (nor) return `${totalDays} ${totalDays === 1 ? "dag" : locale === "nn" ? "dagar" : "dager"} siden`;
    if (en) return `${totalDays} ${totalDays === 1 ? "day" : "days"} ago`;
    return `vor ${totalDays} ${totalDays === 1 ? "Tag" : "Tagen"}`;
  }
  if (format === "combined") {
    if (ms < 60_000) return nor ? "akkurat nå" : en ? "just now" : "gerade eben";
    const days = totalDays;
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(nor ? `${hours}t` : `${hours}h`);
    if (days === 0 && minutes > 0) parts.push(`${minutes}m`);
    const body = parts.length ? parts.join(" ") : "<1m";
    return nor ? `${body} siden` : en ? `${body} ago` : "vor " + body;
  }
  return "";
}
