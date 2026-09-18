import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      name: "Magic Frame",
      short_name: "MagicFrame",
      description:
        "Magic Frame – smart-display dashboard for tablets and TVs with Home Assistant, weather and calendar widgets.",
      start_url: "/editor",
      scope: "/",
      display: "standalone",
      orientation: "any",
      background_color: "#0a0a0a",
      theme_color: "#0f172a",
      icons: [
        {
          src: "/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
        },
        {
          src: "/apple-icon",
          sizes: "180x180",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/apple-icon",
          sizes: "180x180",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: { "Content-Type": "application/manifest+json" },
    },
  );
}
