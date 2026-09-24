import { type NextRequest, NextResponse } from "next/server";
import { viewName } from "@/lib/views/viewName";

// Der Name kann sich jederzeit ändern — nie zwischenspeichern.
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Beschriftung unter dem Symbol: der Name der Ansicht, nicht ihr
  // Adress-Kürzel. Siehe viewName.ts.
  const name = await viewName(id);

  return NextResponse.json(
    {
      name: name ? `${name} · Magic Frame` : "Magic Frame",
      short_name: name ?? "Magic Frame",
      description: "Magic Frame – smart-display dashboard",
      start_url: `/view/${encodeURIComponent(id)}`,
      scope: "/",
      display: "standalone",
      orientation: "any",
      background_color: "#0a0a0a",
      theme_color: "#0f172a",
      icons: [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
        { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "maskable" },
      ],
    },
    {
      headers: { "Content-Type": "application/manifest+json" },
    },
  );
}
