import { de, enUS, nb, nn, ptBR } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";

// Every interface language brings its own date formatting. The fallback only
// applies to a value that is not one of them, and keeps what each call site
// did before: German for most widgets, English for notification ages (#89).
export function dateFnsLocale(locale: string, fallback: "de" | "en" = "de"): DateFnsLocale {
  if (locale === "de") return de;
  if (locale === "en") return enUS;
  if (locale === "nb") return nb;
  if (locale === "nn") return nn;
  if (locale === "pt-BR") return ptBR;
  return fallback === "en" ? enUS : de;
}
