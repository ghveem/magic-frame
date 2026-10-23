import "server-only";
import crypto from "node:crypto";

export function baseUrl(hostHeader: string | null, protoHeader: string | null): string {
  const env = process.env.APP_BASE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  if (hostHeader) {
    const proto = protoHeader || (hostHeader.startsWith("localhost") ? "http" : "http");
    return `${proto}://${hostHeader}`.replace(/\/$/, "");
  }
  return "";
}

// Der state reist über Google oder Microsoft zurück und sagt der Rückkehr-Route,
// welchem Konto das neue Kalender-Konto gehört — und die Route prüft keine
// Sitzung. Bis 1.5.7 war er bloßes Base64-JSON: wer eine fremde userId kannte,
// konnte einen state dazu bauen und sein eigenes Google-Konto bei jemand anderem
// einhängen. Jetzt trägt er eine HMAC-Signatur mit dem Sitzungsschlüssel und
// gilt nur 15 Minuten.
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

export type OauthState = { userId: string; nonce: string; iat?: number };

function signState(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET fehlt");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeState(state: OauthState): string {
  const payload = Buffer.from(JSON.stringify({ ...state, iat: Date.now() }), "utf8").toString("base64url");
  return `${payload}.${signState(payload)}`;
}

export function decodeState(raw: string | null): OauthState | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  try {
    const expected = Buffer.from(signState(payload));
    const given = Buffer.from(raw.slice(dot + 1));
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed?.userId !== "string" || typeof parsed?.nonce !== "string") return null;
    if (typeof parsed.iat !== "number" || Date.now() - parsed.iat > STATE_MAX_AGE_MS) return null;
    return parsed as OauthState;
  } catch {
    return null;
  }
}

export function makeNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Calendars.Read",
  "User.Read",
].join(" ");
