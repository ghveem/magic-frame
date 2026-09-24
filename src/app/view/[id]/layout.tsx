import type { Metadata } from "next";
import { viewName } from "@/lib/views/viewName";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const name = await viewName(id);
  return {
    // Die Vorlage im Root-Layout hängt „ · Magic Frame" selbst an — ohne
    // Namen darum absolut, sonst stünde „Magic Frame · Magic Frame" da.
    title: name ?? { absolute: "Magic Frame" },
    manifest: `/api/view-manifest/${encodeURIComponent(id)}`,
    appleWebApp: {
      capable: true,
      // Beschriftung unter dem Symbol auf iOS: kurz halten, nur der Name.
      title: name ?? "Magic Frame",
      statusBarStyle: "black-translucent",
    },
  };
}

export default function ViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
