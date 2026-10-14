import type { TaskStatus } from "@/types/task";

export const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: "todo", title: "To do", color: "bg-slate-400" },
  { id: "in-progress", title: "In progress", color: "bg-blue-500" },
  { id: "review", title: "In review", color: "bg-amber-500" },
  { id: "done", title: "Done", color: "bg-emerald-500" },
];
