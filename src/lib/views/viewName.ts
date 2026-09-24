import "server-only";
import { prisma } from "@/lib/companion/prisma";

/**
 * Der Name einer Ansicht für Tab-Titel und Startbildschirm.
 *
 * Die Kennung in /view/<id> ist ein Adress-Kürzel (safeViewId: klein, nur
 * a–z, 0–9 und Bindestriche — „kinder-tablet", bei alten Installationen
 * auch „1"). Unter einem Symbol auf dem Tablet soll aber stehen, was man im
 * Editor sieht: „Kinder-Tablet", mit Umlauten und Leerzeichen. Ansichten
 * sind ohne Anmeldung erreichbar; ihr Name verrät nichts, was die Ansicht
 * selbst nicht zeigt.
 *
 * null, wenn es die Ansicht nicht gibt oder die Datenbank nicht antwortet —
 * ein Titel darf eine Anzeige nie am Laden hindern.
 */
export async function viewName(id: string): Promise<string | null> {
  try {
    const row = await prisma.dashboard.findUnique({
      where: { id },
      select: { name: true },
    });
    const name = row?.name?.trim();
    return name ? name : null;
  } catch {
    return null;
  }
}
