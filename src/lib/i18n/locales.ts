// Shared by the browser and server; keep this module free of server-only imports.
export const LOCALES = ["de", "en", "nb", "nn", "pt-BR"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function supportsIntlLocale(tag: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0;
  } catch {
    return false;
  }
}

// Regional format per interface language. A missing or unknown value keeps
// the historical German default — the server routes read it from ?lang=.
// Chromium (and with it most wall tablets) ships no nn-NO data and would
// silently fall back to the device language — often English with AM/PM.
// Bokmål's format is nearly identical, so nn falls back to that instead.
export function intlDateLocale(locale: string | null): string {
  if (locale === "pt-BR") return "pt-BR";
  if (locale === "nb") return "nb-NO";
  if (locale === "nn") return supportsIntlLocale("nn-NO") ? "nn-NO" : "nb-NO";
  return locale === "en" ? "en-US" : "de-DE";
}

export function clockDateLocale(locale: string, override?: string): string {
  return ["en-US", "en-GB", "de-DE", "pt-BR"].includes(override ?? "")
    ? override!
    : intlDateLocale(locale);
}

export function uses12HourClock(locale: string, override?: string): boolean {
  if (override === "12h") return true;
  if (override === "24h") return false;
  return locale === "en";
}

export function calendarWeekStartsOn(locale: string): 0 | 1 {
  return locale === "en" || locale === "pt-BR" ? 0 : 1;
}

export function shortDatePattern(locale: string): string {
  return locale === "en" || locale === "pt-BR" ? "dd MMM" : "dd. MMM";
}

// Forecast dates are calendar days, not instants. Do not shift Monday to Sunday
// when a YYYY-MM-DD value is displayed in a timezone west of UTC.
export function forecastWeekday(date: string, locale: string): string {
  return new Intl.DateTimeFormat(intlDateLocale(locale), {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(date));
}
