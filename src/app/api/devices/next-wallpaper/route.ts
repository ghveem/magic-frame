import { NextRequest } from "next/server";
import { emitToDisplays, readDashboardId } from "@/lib/devices/control";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const dashboardId = await readDashboardId(req);
  return emitToDisplays(req, "NEXT_WALLPAPER", dashboardId);
}
