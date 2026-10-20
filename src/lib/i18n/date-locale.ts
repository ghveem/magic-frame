import { de, enUS, nb, nn } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";

// Locales with their own date formatting. Anything else is English, matching
// the text fallback rule (nn/nb -> en -> de).
export function dateFnsLocale(locale: string): DateFnsLocale {
  if (locale === "de") return de;
  if (locale === "nb") return nb;
  if (locale === "nn") return nn;
  return enUS;
}

export function intlLocale(locale: string): string {
  if (locale === "de") return "de-DE";
  if (locale === "nb") return "nb-NO";
  if (locale === "nn") return "nn-NO";
  return "en-US";
}
