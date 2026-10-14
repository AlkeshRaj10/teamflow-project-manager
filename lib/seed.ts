import type { Task, TaskStatus } from "@/types/task";

export const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: "todo", title: "To do", color: "bg-slate-400" },
  { id: "in-progress", title: "In progress", color: "bg-blue-500" },
  { id: "review", title: "In review", color: "bg-amber-500" },
  { id: "done", title: "Done", color: "bg-emerald-500" },
];

export const initialTasks: Task[] = [
  { id: "TF-101", title: "Set up project workspace", description: "Create the project structure and configure the shared development environment.", status: "done", priority: "Medium", assignee: "AR", dueDate: "Oct 10", labels: ["Setup"] },
  { id: "TF-102", title: "Create onboarding flow", description: "Design a simple first-run experience for new team members.", status: "done", priority: "High", assignee: "SK", dueDate: "Oct 11", labels: ["Design", "UX"] },
  { id: "TF-103", title: "Build dashboard overview", description: "Add project metrics, activity summary, and quick links.", status: "review", priority: "High", assignee: "AR", dueDate: "Oct 16", labels: ["Frontend"] },
  { id: "TF-104", title: "Implement task filters", description: "Filter tasks by status, priority, and assigned team member.", status: "in-progress", priority: "Medium", assignee: "JM", dueDate: "Oct 17", labels: ["Feature"] },
  { id: "TF-105", title: "Add member invitations", description: "Allow project admins to invite teammates by email.", status: "in-progress", priority: "High", assignee: "SK", dueDate: "Oct 18", labels: ["Backend", "Auth"] },
  { id: "TF-106", title: "Document API conventions", description: "Write down response formats, errors, and endpoint naming rules.", status: "todo", priority: "Low", assignee: "JM", dueDate: "Oct 20", labels: ["Docs"] },
  { id: "TF-107", title: "Improve empty states", description: "Create helpful empty states for projects without tasks.", status: "todo", priority: "Low", assignee: "AR", dueDate: "Oct 21", labels: ["Design"] },
  { id: "TF-108", title: "Review mobile layout", description: "Check navigation, cards, and forms at smaller breakpoints.", status: "todo", priority: "Medium", assignee: "SK", dueDate: "Oct 22", labels: ["QA"] },
];

export const members = [
  { initials: "AR", name: "Alkesh Raj", color: "bg-violet-100 text-violet-700" },
  { initials: "SK", name: "Sara Khan", color: "bg-rose-100 text-rose-700" },
  { initials: "JM", name: "James Miller", color: "bg-amber-100 text-amber-700" },
];
