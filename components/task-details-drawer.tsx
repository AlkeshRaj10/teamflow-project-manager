"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock3, MessageCircle, Send, X } from "lucide-react";
import { workspaceApi, WorkspaceApiError } from "@/lib/workspace-api";
import type { TaskActivity, TaskComment, TaskDetails } from "@/types/task";

const statusLabels: Record<TaskDetails["status"], string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  REVIEW: "In review",
  DONE: "Done",
};

const priorityLabels: Record<TaskDetails["priority"], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

function describeActivity(activity: TaskActivity): string {
  const actor = activity.actor?.user.name ?? "A former member";
  switch (activity.type) {
    case "CREATED":
      return `${actor} created this task`;
    case "ASSIGNED":
      return `${actor} changed the assignee`;
    case "STATUS_CHANGED":
      return `${actor} moved the task from ${activity.fromValue ?? "unknown"} to ${activity.toValue ?? "unknown"}`;
    case "COMMENTED":
      return `${actor} added a comment`;
  }
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function TaskDetailsDrawer({
  taskId,
  canComment,
  onClose,
}: {
  taskId: string;
  canComment: boolean;
  onClose: () => void;
}) {
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadDetails = useCallback(async (signal?: AbortSignal) => {
    const [taskResult, commentResult, activityResult] = await Promise.all([
      workspaceApi<{ task: TaskDetails }>(`/api/tasks/${taskId}`, { signal }),
      workspaceApi<{ comments: TaskComment[] }>(`/api/tasks/${taskId}/comments`, { signal }),
      workspaceApi<{ activities: TaskActivity[] }>(`/api/tasks/${taskId}/activity`, { signal }),
    ]);
    setTask(taskResult.task);
    setComments(commentResult.comments);
    setActivities(activityResult.activities);
  }, [taskId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadDetails(controller.signal)
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof WorkspaceApiError
          ? cause.message
          : "We couldn't load this task. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadDetails]);

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await workspaceApi<{ comment: TaskComment }>(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: comment.trim() }),
      });
      setComments((items) => [...items, result.comment]);
      setComment("");
      await loadDetails();
    } catch (cause) {
      setError(cause instanceof WorkspaceApiError
        ? cause.message
        : "We couldn't post your comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-[2px]" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-details-title"
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-5 sm:px-7">
          <div className="min-w-0 pr-4">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-indigo-600">{task?.project.name ?? "Task details"}</p>
            <h2 id="task-details-title" className="mt-2 truncate text-xl font-bold text-slate-900">{task?.title ?? "Task details"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close task details" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button>
        </header>

        {loading ? (
          <p className="p-7 text-sm text-slate-500">Loading task details...</p>
        ) : error && !task ? (
          <p role="alert" className="m-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : task && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
              {error && <p role="alert" className="mb-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
              <dl className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
                <Detail label="Status" value={statusLabels[task.status]} />
                <Detail label="Priority" value={priorityLabels[task.priority]} />
                <Detail label="Assignee" value={task.assignee?.user.name ?? "Unassigned"} />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Due date</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-700"><CalendarDays size={14} />{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "Not set"}</dd>
                </div>
                <Detail label="Created" value={formatTimestamp(task.createdAt)} />
                <Detail label="Last updated" value={formatTimestamp(task.updatedAt)} />
              </dl>

              <section className="mt-7">
                <h3 className="text-sm font-bold text-slate-900">Description</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{task.description || "No description has been added."}</p>
              </section>

              <section className="mt-8">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><MessageCircle size={16} /> Comments <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{comments.length}</span></h3>
                {comments.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-400">No comments yet. Start the conversation.</p>
                ) : (
                  <ol className="mt-4 space-y-4">
                    {comments.map((item) => (
                      <li key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-800">{item.author?.user.name ?? "Former member"}</span>
                          <time dateTime={item.createdAt} className="text-xs text-slate-400">{formatTimestamp(item.createdAt)}</time>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.content}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {canComment && !task.project.archivedAt && (
                  <form onSubmit={submitComment} className="mt-4">
                    <label htmlFor="task-comment" className="sr-only">Write a comment</label>
                    <textarea
                      id="task-comment"
                      required
                      maxLength={5000}
                      rows={3}
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Write a comment..."
                      className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                    <div className="mt-2 flex justify-end">
                      <button type="submit" disabled={submitting || !comment.trim()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                        <Send size={14} />{submitting ? "Posting..." : "Post comment"}
                      </button>
                    </div>
                  </form>
                )}
              </section>

              <section className="mt-8">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Clock3 size={16} /> Activity</h3>
                {activities.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-400">No activity yet.</p>
                ) : (
                  <ol className="mt-4 space-y-4 border-l border-slate-200 pl-4">
                    {activities.map((activity) => (
                      <li key={activity.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-400 ring-1 ring-slate-200" />
                        <p className="text-sm text-slate-700">{describeActivity(activity)}</p>
                        <time dateTime={activity.createdAt} className="mt-1 block text-xs text-slate-400">{formatTimestamp(activity.createdAt)}</time>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-700">{value}</dd></div>;
}
