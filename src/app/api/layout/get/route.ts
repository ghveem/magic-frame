import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { migrateLayoutConfigs } from "@/lib/widgets/ha-migration";
import { getSession } from "@/lib/auth/session";
import { publicWallpaper, stripDeadViewSettings } from "@/lib/views/credentials";

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const dashboardId = req.nextUrl.searchParams.get('dashboardId') || "1";
    
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
      include: { widgets: true }
    });

    if (!dashboard) {
       // layout: null signalisiert "Dashboard existiert nicht" — abgegrenzt vom
       // gültigen leeren Layout ([]), das ein bewusst geleerter View liefert (#27).
       return NextResponse.json({ layout: null, wallpaper: null, settings: null }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
    }

    // Map to react-grid-layout format. Return the label verbatim (empty stays
    // empty) — the editor derives the display title from the widget type via
    // widgetTitle() and localises it. Injecting a German default here used to
    // be a second source of untranslated widget titles (issue #7).
    const rawLayout = dashboard.widgets.map(w => ({
      i: w.id,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      type: w.type,
      bgOpacity: w.bgOpacity,
      config: w.config,
      label: typeof w.label === "string" ? w.label : "",
    }));

    const layout = migrateLayoutConfigs(rawLayout);

    // Displays rufen das ohne Anmeldung ab. Die Zugangsdaten des Hintergrunds
    // bekommt nur ein Admin im Editor, der sie dort bearbeitet; die Bilder holt
    // der Server ohnehin selbst. Beim Speichern geht trotzdem nichts verloren,
    // siehe mergeStoredCredentials.
    let isAdmin = false;
    try {
      const session = await getSession();
      isAdmin = !!session.userId && session.role === "admin";
    } catch {}

    return NextResponse.json({
      layout,
      wallpaper: isAdmin ? dashboard.wallpaper : publicWallpaper(dashboard.wallpaper),
      settings: stripDeadViewSettings(dashboard.settings)
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ layout: null, wallpaper: null, settings: null });
  }
}
