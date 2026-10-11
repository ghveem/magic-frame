import { de, enUS, ptBR } from "date-fns/locale";

// Most widgets historically use German for nb/nn; notification age uses English.
// Keep both fallbacks intact while adding Brazilian Portuguese consistently.
export function dateFnsLocale(locale: string, fallback: "de" | "en" = "de") {
  if (locale === "pt-BR") return ptBR;
  if (locale === "en") return enUS;
  if (locale === "de") return de;
  return fallback === "en" ? enUS : de;
}
