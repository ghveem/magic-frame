import "server-only";
import { writeFile, readFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { setCaddyState } from "./store";

// Im Container ist das Caddy-Config-Volume unter /caddy/config gemountet.
// Caddy mountet das gleiche Volume unter /etc/caddy — schreibt also App rein,
// liest Caddy raus.
const CADDY_CONFIG_DIR = process.env.CADDY_CONFIG_DIR || "/caddy/config";
const CADDY_FILE = join(CADDY_CONFIG_DIR, "Caddyfile");

const CADDY_ADMIN = process.env.CADDY_ADMIN_URL || "http://caddy:2019";

/**
 * Spricht die Admin-API mit node:http statt mit fetch() — und das ist der
 * ganze Fix fuer #95.
 *
 * Caddy 2.11 prueft bei Anfragen, die nach Browser aussehen, den Origin. Nodes
 * fetch() (undici) schickt von sich aus `Sec-Fetch-Mode: cors` mit — ohne
 * Origin, weil es keinen hat. Fuer Caddy ist das ein Browser mit leerem
 * Origin, und der bekommt 403: "client is not allowed to access from origin
 * ''". Der Kopf laesst sich in undici nicht abschalten. node:http schickt
 * schlicht keine Sec-Fetch-Kopfzeilen, also unterbleibt die Pruefung — ohne
 * dass am Caddyfile etwas geaendert werden muss. Das ist wichtig: bestehende
 * Installationen laden ihren alten Caddyfile, und der muss zum Reparieren
 * ueberhaupt erst einmal wieder durchgehen.
 */
async function adminRequest(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any> }> {
  const { request } = await import("node:http");
  const url = new URL(path, CADDY_ADMIN.endsWith("/") ? CADDY_ADMIN : CADDY_ADMIN + "/");
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: init.method || "GET",
        headers: {
          ...(init.headers || {}),
          ...(init.body != null ? { "Content-Length": String(Buffer.byteLength(init.body)) } : {}),
        },
        timeout: init.timeoutMs ?? 10000,
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (buf += d));
        res.on("end", () => {
          const status = res.statusCode || 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: async () => buf,
            json: async () => JSON.parse(buf),
          });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (init.body != null) req.write(init.body);
    req.end();
  });
}

/**
 * Schreibt das Caddyfile ins Shared-Volume und triggert via Admin-API einen
 * Reload. Caddy parsed dabei das neue File, validiert es und lädt es atomar —
 * wenn das fehlschlägt, läuft die alte Config weiter.
 */
export async function writeAndReload(caddyfile: string): Promise<{
  ok: boolean;
  reloaded: boolean;
  error?: string;
}> {
  try {
    await mkdir(CADDY_CONFIG_DIR, { recursive: true });
    await writeFile(CADDY_FILE, caddyfile, "utf-8");
  } catch (e: any) {
    const msg = `Caddyfile schreiben fehlgeschlagen: ${e?.message || e}`;
    await setCaddyState({ lastError: msg });
    return { ok: false, reloaded: false, error: msg };
  }

  // Reload via Admin-API. Caddy unterstützt `POST /load` mit JSON-Config —
  // wir nutzen den Endpoint `/load` mit Header `Content-Type: text/caddyfile`,
  // dann adaptiert Caddy selbst und reloaded. Das ist atomar.
  try {
    const res = await adminRequest("load", {
      method: "POST",
      headers: { "Content-Type": "text/caddyfile" },
      body: caddyfile,
      timeoutMs: 10000,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `Caddy-Reload fehlgeschlagen (HTTP ${res.status}): ${text.slice(0, 300)}`;
      await setCaddyState({ lastError: msg });
      return { ok: false, reloaded: false, error: msg };
    }
  } catch (e: any) {
    const msg = `Caddy-Admin nicht erreichbar: ${e?.message || e}`;
    await setCaddyState({ lastError: msg });
    return { ok: false, reloaded: false, error: msg };
  }

  await setCaddyState({
    lastReload: new Date().toISOString(),
    lastError: null,
  });
  return { ok: true, reloaded: true };
}

/** Liest den letzten gespeicherten Caddyfile-Inhalt — für UI-Preview. */
export async function readCurrentCaddyfile(): Promise<string | null> {
  try {
    return await readFile(CADDY_FILE, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Fragt die Caddy-Admin-API nach dem aktuellen Status — ob er antwortet und
 * welche Config geladen ist. Wir lesen `/config/` und schauen ob da TLS-Apps
 * konfiguriert sind.
 */
export async function fetchCaddyStatus(): Promise<{
  reachable: boolean;
  tlsMode: boolean;
  certSubject?: string | null;
  certNotAfter?: string | null;
}> {
  try {
    const res = await adminRequest("config/apps/tls/certificates/automate", { timeoutMs: 3000 });
    if (!res.ok) {
      // /load mit Caddyfile speichert die Config — der Pfad existiert vielleicht
      // nicht. Trotzdem reachable=true.
      return { reachable: true, tlsMode: false };
    }
    const data: any = await res.json().catch(() => null);
    const subjects: string[] = Array.isArray(data) ? data : [];
    if (subjects.length === 0) {
      return { reachable: true, tlsMode: false };
    }
    return {
      reachable: true,
      tlsMode: true,
      certSubject: subjects.join(", "),
      // notAfter könnten wir aus /pki/ca/local oder dem Cert-File lesen,
      // ist aber komplexer. Lassen wir vorerst leer und ergänzen wenn nötig.
      certNotAfter: null,
    };
  } catch {
    return { reachable: false, tlsMode: false };
  }
}

/** Maintenance: liefert mtime des Caddyfiles — nützlich um „letzte Änderung" zu zeigen. */
export async function caddyfileMtime(): Promise<string | null> {
  try {
    const st = await stat(CADDY_FILE);
    return st.mtime.toISOString();
  } catch {
    return null;
  }
}
