import "server-only";
import { prisma } from "./prisma";

export type Priority = "low" | "normal" | "high";
export type TodoRecord = {
  id: string;
  title: string;
  assignee: string | null;
  dueDate: string | null;
  priority: Priority;
  createdAt: string;
  completedAt: string | null;
};

function serialize(t: any): TodoRecord {
  const p = (t.priority as Priority) ?? "normal";
  return {
    id: t.id,
    title: t.title,
    assignee: t.assignee,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    priority: p === "low" || p === "high" ? p : "normal",
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  };
}

export async function createTodo(params: {
  userId: string | null;
  title: string;
  assignee?: string | null;
  dueDate?: Date | null;
  priority?: Priority;
}): Promise<TodoRecord> {
  const row = await prisma.todo.create({
    data: {
      title: params.title.slice(0, 200),
      assignee: params.assignee ?? null,
      dueDate: params.dueDate ?? null,
      priority: params.priority ?? "normal",
      createdByUserId: params.userId,
    },
  });
  return serialize(row);
}

export async function listTodos(params: {
  assignee?: string;
  includeDoneHours?: number; // zeige erledigte der letzten N Stunden mit an
}): Promise<TodoRecord[]> {
  const doneSince = params.includeDoneHours
    ? new Date(Date.now() - params.includeDoneHours * 60 * 60 * 1000)
    : null;
  const rows = await prisma.todo.findMany({
    where: {
      AND: [
        params.assignee ? { assignee: params.assignee } : {},
        doneSince
          ? { OR: [{ completedAt: null }, { completedAt: { gte: doneSince } }] }
          : { completedAt: null },
      ],
    },
    orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  return rows.map(serialize);
}

export async function toggleTodo(id: string): Promise<TodoRecord | null> {
  const existing = await prisma.todo.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.todo.update({
    where: { id },
    data: { completedAt: existing.completedAt ? null : new Date() },
  });
  return serialize(row);
}

// Wie setItemChecked: Zielzustand statt Umschalten, damit ein Agent, der
// zweimal "erledigt" sagt, die Aufgabe nicht wieder öffnet.
export async function setTodoDone(id: string, done: boolean): Promise<TodoRecord | null> {
  const existing = await prisma.todo.findUnique({ where: { id } });
  if (!existing) return null;
  if (!!existing.completedAt === done) return serialize(existing);
  const row = await prisma.todo.update({
    where: { id },
    data: { completedAt: done ? new Date() : null },
  });
  return serialize(row);
}

export async function updateTodo(id: string, patch: {
  title?: string;
  assignee?: string | null;
  dueDate?: Date | null;
  priority?: Priority;
}): Promise<TodoRecord | null> {
  const row = await prisma.todo.update({
    where: { id },
    data: {
      title: patch.title !== undefined ? patch.title.slice(0, 200) : undefined,
      assignee: patch.assignee,
      dueDate: patch.dueDate,
      priority: patch.priority,
    },
  });
  return serialize(row);
}

export async function removeTodo(id: string) {
  await prisma.todo.delete({ where: { id } });
}
