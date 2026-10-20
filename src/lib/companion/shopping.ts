import "server-only";
import { prisma } from "./prisma";

export type ShoppingRecord = {
  id: string;
  text: string;
  checked: boolean;
  createdAt: string;
  checkedAt: string | null;
};

function serialize(s: any): ShoppingRecord {
  return {
    id: s.id,
    text: s.text,
    checked: s.checked,
    createdAt: s.createdAt.toISOString(),
    checkedAt: s.checkedAt ? s.checkedAt.toISOString() : null,
  };
}

export async function addItems(params: {
  userId: string | null;
  texts: string[];
}): Promise<ShoppingRecord[]> {
  const created: any[] = [];
  for (const raw of params.texts) {
    const text = raw.trim();
    if (!text) continue;
    const row = await prisma.shoppingItem.create({
      data: { text: text.slice(0, 120), createdByUserId: params.userId },
    });
    created.push(row);
  }
  return created.map(serialize);
}

export async function listItems(): Promise<ShoppingRecord[]> {
  const rows = await prisma.shoppingItem.findMany({
    where: { OR: [{ checked: false }, { checkedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] },
    orderBy: [{ checked: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  return rows.map(serialize);
}

export async function toggleItem(id: string): Promise<ShoppingRecord | null> {
  const existing = await prisma.shoppingItem.findUnique({ where: { id } });
  if (!existing) return null;
  const nextChecked = !existing.checked;
  const row = await prisma.shoppingItem.update({
    where: { id },
    data: {
      checked: nextChecked,
      checkedAt: nextChecked ? new Date() : null,
    },
  });
  return serialize(row);
}

// Für Agenten: toggleItem zweimal gerufen nimmt den Haken wieder weg. Mit
// Zielzustand bleibt ein wiederholter Aufruf harmlos.
export async function setItemChecked(id: string, checked: boolean): Promise<ShoppingRecord | null> {
  const existing = await prisma.shoppingItem.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.checked === checked) return serialize(existing);
  const row = await prisma.shoppingItem.update({
    where: { id },
    data: { checked, checkedAt: checked ? new Date() : null },
  });
  return serialize(row);
}

export async function removeItem(id: string) {
  await prisma.shoppingItem.delete({ where: { id } });
}

export async function clearChecked() {
  await prisma.shoppingItem.deleteMany({ where: { checked: true } });
}
