// Zugangsdaten in den Daten einer Ansicht.
//
// Ein Display lädt seine Ansicht ohne Anmeldung (/api/layout/get) und legt die
// Antwort im localStorage ab. Alles, was darin steht, ist also für jeden lesbar,
// der den Server erreicht, und liegt auf jedem Wand-Tablet herum. Bis 1.5.7
// standen dort WebDAV-Passwörter und Immich-Schlüssel im Klartext — gebraucht
// hat sie dort niemand, denn die Bilder holt der Server selbst.
//
// Die Regel ist deshalb: nach außen fallen die Felder weg, beim Speichern
// werden sie aus der Datenbank übernommen, wenn sie fehlen. Aber nur, solange
// die Adresse dieselbe bleibt, für die sie eingegeben wurden. Sonst könnte wer
// eine Ansicht bearbeiten darf, die Adresse auf seinen eigenen Server biegen und
// sich das gespeicherte Passwort schicken lassen, ohne es je gesehen zu haben.

/** Zugangsdaten, jeweils an die Adresse gebunden, für die sie gelten. */
const BOUND_CREDENTIALS: Record<string, readonly string[]> = {
  webdavUrl: ["webdavUser", "webdavPass"],
  immichUrl: ["immichApiKey"],
};

const CREDENTIAL_FIELDS = Object.values(BOUND_CREDENTIALS).flat();

// Ein Rest aus dem alten mobilen Editor: dessen "Integrationen"-Dialog schrieb
// Home-Assistant-Adresse und -Token in die Einstellungen der jeweiligen Ansicht.
// Alle HA-Routen nehmen die globalen Einstellungen; nur bei Ansicht "1" galten
// sie als Rückfall, wenn global nichts stand (adoptLegacyHaSettings zieht sie
// vor dem Speichern dorthin um). Ausgeliefert wurden sie mit jeder Ansicht.
const DEAD_SETTINGS_KEYS = ["haUrl", "haToken"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Der Hintergrund ohne Zugangsdaten — so, wie ihn ein Display sehen darf. */
export function publicWallpaper<T>(wallpaper: T): T {
  if (!isObj(wallpaper)) return wallpaper;
  const out: Obj = { ...wallpaper };
  for (const f of CREDENTIAL_FIELDS) delete out[f];
  return out as T;
}

/** Welche Zugangsdaten gespeichert sind, ohne ihren Wert. */
export function storedCredentialFields(wallpaper: unknown): string[] {
  if (!isObj(wallpaper)) return [];
  return CREDENTIAL_FIELDS.filter((f) => typeof wallpaper[f] === "string" && wallpaper[f] !== "");
}

/** Die Ansichts-Einstellungen ohne die toten HA-Felder — nach außen und beim Speichern. */
export function stripDeadViewSettings<T>(settings: T): T {
  if (!isObj(settings)) return settings;
  const out: Obj = { ...settings };
  for (const k of DEAD_SETTINGS_KEYS) delete out[k];
  return out as T;
}

/**
 * Fehlt ein Zugangsdatum im neuen Hintergrund, kommt es aus dem gespeicherten —
 * solange die Adresse unverändert ist. Ein mitgeschicktes Feld gilt, auch ein
 * leeres: so lässt sich ein Passwort im Editor bewusst löschen.
 */
export function mergeStoredCredentials<T>(incoming: T, stored: unknown): T {
  if (!isObj(incoming) || !isObj(stored)) return incoming;
  const out: Obj = { ...incoming };
  for (const [urlKey, fields] of Object.entries(BOUND_CREDENTIALS)) {
    const sameAddress = String(incoming[urlKey] ?? "") === String(stored[urlKey] ?? "");
    if (!sameAddress) continue;
    for (const f of fields) {
      if (out[f] === undefined && stored[f] !== undefined) out[f] = stored[f];
    }
  }
  return out as T;
}
