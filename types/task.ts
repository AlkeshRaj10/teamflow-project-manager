export type TaskStatus = "todo" | "in-progress" | "review" | "done";
export type Priority = "Low" | "Medium" | "High";

export type Task = {
  id: string;
  version: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  assigneeName: string | null;
  creatorId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
};

export type WorkspaceMember = {
  role: "OWNER" | "ADMIN" | "MEMBER";
  user: { id: string; name: string; email: string };
};

export type ProjectSummary = {
  projectId: string;
  total: number;
  byStatus: Record<"TODO" | "IN_PROGRESS" | "REVIEW" | "DONE", number>;
  byPriority: Record<"LOW" | "MEDIUM" | "HIGH", number>;
  overdue: number;
  completedPercent: number;
};

export type TaskPage = {
  items: Array<{
    id: string;
    version: number;
    title: string;
    description: string;
    status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
    priority: "LOW" | "MEDIUM" | "HIGH";
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
    assignee: { user: { id: string; name: string } } | null;
    creator: { user: { id: string; name: string } } | null;
  }>;
  statusCounts: Record<"TODO" | "IN_PROGRESS" | "REVIEW" | "DONE", number>;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

export type TaskComment = {
  id: string;
  content: string;
  createdAt: string;
  author: { user: { id: string; name: string } } | null;
};

export type TaskActivity = {
  id: string;
  type: "CREATED" | "ASSIGNED" | "STATUS_CHANGED" | "COMMENTED";
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
  actor: { user: { id: string; name: string } } | null;
};

export type TaskDetails = TaskPage["items"][number] & {
  project: { id: string; name: string; archivedAt: string | null };
  comments: TaskComment[];
  activities: TaskActivity[];
};
