import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, updateAppSettings, type AppSettingsShape } from "@/lib/settings/store";
import { supervisorHaCredentials } from "@/lib/runtime/addon";
import {
  verifyAdmin,
  ForbiddenError,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

// Home-Assistant-Token und Immich-Schlüssel verlassen den Server nicht mehr.
// Bis 1.5.7 bekam sie jede angemeldete Sitzung im Klartext, auch ein Viewer —
// und ein Home-Assistant-Token öffnet das ganze Haus. Das Formular erfährt nur
// noch, OB einer gespeichert ist.
export async function GET() {
  try {
    await verifyAdmin();
  } catch (err) {
    return err instanceof ForbiddenError ? forbiddenResponse() : unauthorizedResponse();
  }
  try {
    const s = await getAppSettings();
    const shown = {
      haUrl: s.haUrl,
      haToken: "",
      haTokenSet: !!s.haToken,
      immichUrl: s.immichUrl,
      immichApiKey: "",
      immichApiKeySet: !!s.immichApiKey,
    };
    // Im Add-on kommt Home Assistant über den Supervisor-Proxy, ohne Token.
    // Ohne dieses Signal sieht die Oberfläche leere Felder und der Nutzer
    // schliesst daraus "nicht verbunden" — genau der Eindruck, der beim ersten
    // echten Add-on-Test entstanden ist.
    if (supervisorHaCredentials()) return NextResponse.json({ ...shown, haManagedBy: "supervisor" });
    return NextResponse.json(shown);
  } catch (err) {
    console.error("[settings] GET error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * Ein leeres Token-Feld behält den gespeicherten Token — das Formular kennt ihn
 * ja nicht mehr. Eine leere Adresse trennt die Verbindung. Und eine NEUE Adresse
 * braucht den Token noch einmal: sonst schickte der Server den gespeicherten an
 * einen Rechner, für den ihn niemand eingegeben hat.
 */
function nextCredentials(
  urlIn: unknown,
  secretIn: unknown,
  currentUrl: string,
  currentSecret: string,
): { url?: string; secret?: string; error?: string } {
  const url = typeof urlIn === "string" ? urlIn.trim() : undefined;
  const secret = typeof secretIn === "string" ? secretIn.trim() : "";
  if (url === undefined && !secret) return {};
  if (url === "") return { url: "", secret: "" };
  if (secret) return { url, secret };
  if (url !== undefined && url !== currentUrl && currentSecret) {
    return { error: "Neue Adresse — bitte den Token oder Schlüssel noch einmal eintragen." };
  }
  return { url, secret: currentSecret };
}

export async function POST(req: NextRequest) {
  try {
    await verifyAdmin();
  } catch (err) {
    return err instanceof ForbiddenError ? forbiddenResponse() : unauthorizedResponse();
  }
  try {
    const body = await req.json();
    const current = await getAppSettings();
    const patch: Partial<AppSettingsShape> = {};

    // Im Add-on wird Home Assistant nicht aus diesen Feldern gelesen.
    if (!supervisorHaCredentials()) {
      const ha = nextCredentials(body.haUrl, body.haToken, current.haUrl, current.haToken);
      if (ha.error) return NextResponse.json({ error: ha.error }, { status: 400 });
      if (ha.url !== undefined) patch.haUrl = ha.url;
      if (ha.secret !== undefined) patch.haToken = ha.secret;
    }

    const im = nextCredentials(body.immichUrl, body.immichApiKey, current.immichUrl, current.immichApiKey);
    if (im.error) return NextResponse.json({ error: im.error }, { status: 400 });
    if (im.url !== undefined) patch.immichUrl = im.url;
    if (im.secret !== undefined) patch.immichApiKey = im.secret;

    await updateAppSettings(patch);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[settings] POST error:", err);
    return NextResponse.json({ error: "Failed", details: err?.message }, { status: 500 });
  }
}
