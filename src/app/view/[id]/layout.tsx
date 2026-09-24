import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${id} · Magic Frame`,
    manifest: `/api/view-manifest/${id}`,
    appleWebApp: {
      capable: true,
      title: `Magic Frame – ${id}`,
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
