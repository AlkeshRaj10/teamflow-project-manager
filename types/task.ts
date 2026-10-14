export type TaskStatus = "todo" | "in-progress" | "review" | "done";
export type Priority = "Low" | "Medium" | "High";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  dueDate: string;
  labels: string[];
};
