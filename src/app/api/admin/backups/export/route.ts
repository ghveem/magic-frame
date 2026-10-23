import { NextResponse } from "next/server";
import {
  verifyAdmin,
  ForbiddenError,
  forbiddenResponse,
  UnauthorizedError,
  unauthorizedResponse,
} from "@/lib/auth/dal";
import { prisma } from "@/lib/companion/prisma";
import { publicWallpaper, stripDeadViewSettings } from "@/lib/views/credentials";

export const dynamic = "force-dynamic";

// GET /api/admin/backups/export — JSON-Download aller Views
// (Layouts, Wallpapers, View-Settings). Keine Zugangsdaten: die Datei soll man
// weitergeben oder in ein Issue kleben können (so steht es im Wiki). Bis 1.5.7
// standen die WebDAV-Passwörter und Immich-Schlüssel der Hintergründe trotzdem
// drin. Nur für Admins, wie alles unter /api/admin/backups.
export async function GET() {
  try {
    await verifyAdmin();

    const dashboards = await prisma.dashboard.findMany({
      include: { widgets: true },
      orderBy: { id: "asc" },
    });

    const backup = {
      magicFrameBackup: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      dashboardCount: dashboards.length,
      dashboards: dashboards.map((d) => ({
        id: d.id,
        name: d.name,
        wallpaper: publicWallpaper(d.wallpaper) ?? null,
        settings: stripDeadViewSettings(d.settings) ?? null,
        widgets: d.widgets.map((w) => ({
          id: w.id,
          type: w.type,
          label: w.label,
          config: w.config ?? {},
          bgOpacity: w.bgOpacity,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
        })),
      })),
    };

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="magicframe-backup-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    if (err instanceof ForbiddenError) return forbiddenResponse();
    console.error("backup export error", err);
    return NextResponse.json({ error: "Export fehlgeschlagen." }, { status: 500 });
  }
}
