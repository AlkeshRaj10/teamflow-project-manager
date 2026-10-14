"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, CalendarDays, Check, CircleHelp, Command,
  Filter, ListTodo, LogOut, Plus, Search, Settings2,
  Sparkles, Users, X, ArrowUpRight, Clock3, CircleDot, Pencil, Archive, Trash2,
} from "lucide-react";
import { columns } from "@/lib/seed";
import type { Priority, Project, ProjectSummary, Task, TaskPage, TaskStatus, WorkspaceMember } from "@/types/task";
import type { CurrentUser } from "@/lib/auth";
import WorkspaceControls from "@/components/workspace-controls";
import { workspaceApi, WorkspaceApiError } from "@/lib/workspace-api";

type Workspace = { id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER" };

const priorityStyle: Record<Priority, string> = {
  High: "bg-rose-50 text-rose-700 ring-rose-100",
  Medium: "bg-amber-50 text-amber-700 ring-amber-100",
  Low: "bg-slate-100 text-slate-600 ring-slate-200",
};

const statusToApi: Record<TaskStatus, TaskPage["items"][number]["status"]> = {
  todo: "TODO",
  "in-progress": "IN_PROGRESS",
  review: "REVIEW",
  done: "DONE",
};
const statusFromApi = Object.fromEntries(
  Object.entries(statusToApi).map(([ui, api]) => [api, ui]),
) as Record<TaskPage["items"][number]["status"], TaskStatus>;
const priorityToApi: Record<Priority, TaskPage["items"][number]["priority"]> = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
};
const priorityFromApi = Object.fromEntries(
  Object.entries(priorityToApi).map(([ui, api]) => [api, ui]),
) as Record<TaskPage["items"][number]["priority"], Priority>;
const allowedUiTransitions: Record<TaskStatus, TaskStatus[]> = {
  todo: ["todo", "in-progress"],
  "in-progress": ["todo", "in-progress", "review"],
  review: ["in-progress", "review", "done"],
  done: ["review", "done"],
};

function mapTask(task: TaskPage["items"][number]): Task {
  return {
    id: task.id,
    version: task.version,
    title: task.title,
    description: task.description,
    status: statusFromApi[task.status],
    priority: priorityFromApi[task.priority],
    assigneeId: task.assignee?.user.id ?? null,
    assigneeName: task.assignee?.user.name ?? null,
    creatorId: task.creator?.user.id ?? null,
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export default function TeamflowApp({ currentUser }: { currentUser: CurrentUser }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageCount: 0, total: 0 });
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [showModal, setShowModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("Medium");
  const [newAssignee, setNewAssignee] = useState("");
  const [newStatus, setNewStatus] = useState<TaskStatus>("todo");
  const [newDueDate, setNewDueDate] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [authError, setAuthError] = useState("");
  const [boardError, setBoardError] = useState("");
  const [boardLoading, setBoardLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const userInitials = currentUser.name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join("") || "U";

  useEffect(() => {
    const controller = new AbortController();
    workspaceApi<{ workspaces: Workspace[] }>("/api/workspaces", { signal: controller.signal })
      .then(({ workspaces: result }) => {
        setWorkspaces(result);
        const savedWorkspace = window.localStorage.getItem("teamflow.workspaceId");
        const selected = result.find((workspace) => workspace.id === savedWorkspace) ?? result[0];
        if (selected) setWorkspaceId(selected.id);
      })
      .catch((error: unknown) => {
        if (error instanceof WorkspaceApiError && error.status === 401) router.replace("/login?expired=1");
        else if (!(error instanceof Error && error.name === "AbortError")) {
          setBoardError("We couldn't load your workspaces. Please refresh and try again.");
        }
      })
      .finally(() => setBoardLoading(false));
    return () => controller.abort();
  }, [router]);

  const refreshWorkspaces = useCallback(async () => {
    const result = await workspaceApi<{ workspaces: Workspace[] }>("/api/workspaces");
    setWorkspaces(result.workspaces);
    if (!result.workspaces.some((workspace) => workspace.id === workspaceId)) {
      const fallback = result.workspaces[0]?.id ?? "";
      setWorkspaceId(fallback);
      window.localStorage.setItem("teamflow.workspaceId", fallback);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      setProjects([]);
      setProjectId("");
      setBoardLoading(false);
      return;
    }
    const controller = new AbortController();
    setBoardLoading(true);
    setBoardError("");
    workspaceApi<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`, {
      signal: controller.signal,
    })
      .then(({ projects: result }) => {
        setProjects(result);
        setProjectId((current) =>
          result.some((project) => project.id === current)
            ? current
            : result[0]?.id ?? "",
        );
      })
      .catch((error: unknown) => {
        if (error instanceof WorkspaceApiError && error.status === 401) router.replace("/login?expired=1");
        else if (!(error instanceof Error && error.name === "AbortError")) {
          setBoardError(error instanceof WorkspaceApiError
            ? error.message
            : "We couldn't load this workspace's projects.");
        }
      })
      .finally(() => setBoardLoading(false));
    return () => controller.abort();
  }, [workspaceId, router, refreshKey]);

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      setMembers([]);
      setSummary(null);
      setBoardLoading(false);
      return;
    }
    const controller = new AbortController();
    setBoardLoading(true);
    setBoardError("");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: "20",
      });
      const status = statusFilter === "All statuses"
        ? undefined
        : statusToApi[statusFilter as TaskStatus];
      if (query.trim()) params.set("q", query.trim());
      if (priorityFilter !== "All priorities") {
        params.set("priority", priorityToApi[priorityFilter as Priority]);
      }
      if (status) params.set("status", status);

      Promise.all([
        workspaceApi<TaskPage>(`/api/projects/${projectId}/tasks?${params}`, {
          signal: controller.signal,
        }),
        workspaceApi<{ summary: ProjectSummary }>(`/api/projects/${projectId}/summary`, {
          signal: controller.signal,
        }),
        workspaceApi<{ members: WorkspaceMember[] }>(`/api/workspaces/${workspaceId}/members`, {
          signal: controller.signal,
        }),
      ])
        .then(([taskResult, summaryResult, memberResult]) => {
          setTasks(taskResult.items.map(mapTask));
          setPagination((current) => ({
            ...current,
            pageCount: taskResult.pagination.pageCount,
            total: taskResult.pagination.total,
          }));
          setSummary(summaryResult.summary);
          setMembers(memberResult.members);
        })
        .catch((error: unknown) => {
          if (error instanceof WorkspaceApiError && error.status === 401) router.replace("/login?expired=1");
          else if (!(error instanceof Error && error.name === "AbortError")) {
            setBoardError(error instanceof WorkspaceApiError
              ? error.message
              : "We couldn't load project tasks. Please try again.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setBoardLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, workspaceId, query, priorityFilter, statusFilter, pagination.page, refreshKey, router]);

  function changeWorkspace(id: string) {
    setWorkspaceId(id);
    setProjectId("");
    setPagination((current) => ({ ...current, page: 1 }));
    window.localStorage.setItem("teamflow.workspaceId", id);
  }

  function changeProject(id: string) {
    setProjectId(id);
    setPagination((current) => ({ ...current, page: 1 }));
  }

  async function logout() {
    setLogoutLoading(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout request failed.");
      router.replace("/login");
      router.refresh();
    } catch {
      setAuthError("We couldn't log you out. Please try again.");
      setLogoutLoading(false);
    }
  }

  function openCreateTask(status: TaskStatus = "todo") {
    setEditingTask(null);
    setNewTitle("");
    setNewDescription("");
    setNewPriority("Medium");
    setNewAssignee("");
    setNewStatus(status);
    setNewDueDate("");
    setBoardError("");
    setShowModal(true);
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setNewTitle(task.title);
    setNewDescription(task.description);
    setNewPriority(task.priority);
    setNewAssignee(task.assigneeId ?? "");
    setNewStatus(task.status);
    setNewDueDate(task.dueDate ? task.dueDate.slice(0, 10) : "");
    setBoardError("");
    setShowModal(true);
  }

  async function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setBoardError("");
    try {
      const payload = {
        title: newTitle.trim(),
        description: newDescription.trim(),
        status: statusToApi[newStatus],
        priority: priorityToApi[newPriority],
        assigneeId: newAssignee || null,
        dueDate: newDueDate || null,
      };
      if (editingTask) {
        await workspaceApi(`/api/tasks/${editingTask.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, version: editingTask.version }),
        });
      } else {
        await workspaceApi(`/api/projects/${projectId}/tasks`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      setSuccessMessage(editingTask ? "Task updated." : "Task created.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setBoardError(error instanceof WorkspaceApiError
        ? error.message
        : "We couldn't save this task. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function moveTask(task: Task, status: TaskStatus) {
    setDraggedId(null);
    if (task.status === status) return;
    setBoardError("");
    try {
      await workspaceApi(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusToApi[status], version: task.version }),
      });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setBoardError(error instanceof WorkspaceApiError
        ? error.message
        : "We couldn't move this task. Please try again.");
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    setBoardError("");
    try {
      await workspaceApi(`/api/tasks/${task.id}`, { method: "DELETE" });
      setSuccessMessage("Task deleted.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setBoardError(error instanceof WorkspaceApiError
        ? error.message
        : "We couldn't delete this task. Please try again.");
    }
  }

  function openProjectEditor(project: Project | null) {
    setEditingProject(project);
    setProjectName(project?.name ?? "");
    setProjectDescription(project?.description ?? "");
    setShowProjectModal(true);
  }

  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return;
    setSaving(true);
    setBoardError("");
    try {
      if (editingProject) {
        await workspaceApi(`/api/projects/${editingProject.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: projectName.trim(), description: projectDescription.trim() }),
        });
        setSuccessMessage("Project updated.");
      } else {
        const result = await workspaceApi<{ project: Project }>(
          `/api/workspaces/${workspaceId}/projects`,
          { method: "POST", body: JSON.stringify({ name: projectName.trim(), description: projectDescription.trim() }) },
        );
        setProjectId(result.project.id);
        setSuccessMessage("Project created.");
      }
      setShowProjectModal(false);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setBoardError(error instanceof WorkspaceApiError
        ? error.message
        : "We couldn't save this project. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveProject() {
    if (!selectedProject || !window.confirm(`Archive "${selectedProject.name}"? Tasks will remain stored but become read-only.`)) return;
    setBoardError("");
    try {
      await workspaceApi(`/api/projects/${selectedProject.id}/archive`, { method: "POST" });
      setProjectId("");
      setSuccessMessage("Project archived.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setBoardError(error instanceof WorkspaceApiError
        ? error.message
        : "We couldn't archive this project. Please try again.");
    }
  }

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const doneCount = summary?.byStatus.DONE ?? 0;
  const progress = summary?.completedPercent ?? 0;
  const canManageProjects = selectedWorkspace?.role === "OWNER" || selectedWorkspace?.role === "ADMIN";
  const filteredTasks = useMemo(
    () => statusFilter === "All statuses"
      ? tasks
      : tasks.filter((task) => task.status === statusFilter),
    [tasks, statusFilter],
  );

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-800">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-slate-200/80 bg-white px-4 py-5 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><Command size={21} /></div>
          <div><p className="text-[17px] font-bold tracking-tight text-slate-900">teamflow</p><p className="text-[11px] font-medium text-slate-400">WORKSPACE</p></div>
        </div>

        <WorkspaceControls
          workspaces={workspaces}
          selectedId={workspaceId}
          onSelectedChange={changeWorkspace}
          onRefresh={refreshWorkspaces}
        />

        <div className="mb-2 mt-8 flex items-center justify-between px-3">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Your projects</p>
          {canManageProjects && <button type="button" aria-label="Create project" onClick={() => openProjectEditor(null)} className="text-slate-400 hover:text-indigo-600"><Plus size={15}/></button>}
        </div>
        <nav className="space-y-1">
          {projects.map((project) => (
            <button
              type="button"
              key={project.id}
              onClick={() => changeProject(project.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${projectId === project.id ? "bg-slate-50 font-medium text-slate-800" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-[4px] ${projectId === project.id ? "bg-indigo-500" : "bg-slate-300"}`}/>
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span className="text-xs text-slate-400">{project._count?.tasks ?? 0}</span>
            </button>
          ))}
          {!projects.length && <p className="px-3 py-2 text-xs leading-5 text-slate-400">Create a project to start organizing tasks.</p>}
        </nav>

        <div className="mt-auto space-y-1 border-t border-slate-100 pt-4">
          <Link href={workspaceId ? `/dashboard/workspaces/${workspaceId}/members` : "/dashboard"} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"><Users size={18}/>Team</Link>
          <button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"><Settings2 size={18}/>Settings</button>
          <button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"><CircleHelp size={18}/>Help & support</button>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div title={currentUser.name} className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white">{userInitials}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{currentUser.name}</p><p className="truncate text-xs text-slate-400">{currentUser.email}</p></div>
            <button type="button" onClick={logout} disabled={logoutLoading} aria-label="Log out" title="Log out" className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50"><LogOut size={17}/></button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:ml-[248px]">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-400"><span>Projects</span><span>/</span><span className="truncate font-semibold text-slate-800">{selectedProject?.name ?? "No project selected"}</span></div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 sm:flex"><Search size={14}/><span>Search anything...</span><kbd className="ml-4 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]">⌘ K</kbd></div>
            <button aria-label="Notifications" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Bell size={19}/><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-rose-500"/></button>
            <div title={currentUser.name} className="grid h-9 w-9 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{userInitials}</div>
          </div>
        </header>

        <div className="border-b border-slate-200/80 bg-white px-5 py-3 lg:hidden md:px-8">
          <WorkspaceControls
            compact
            workspaces={workspaces}
            selectedId={workspaceId}
            onSelectedChange={changeWorkspace}
            onRefresh={refreshWorkspaces}
          />
        </div>

        {authError && <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 md:mx-8">{authError}</p>}
        {boardError && <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 md:mx-8">{boardError}</p>}
        {successMessage && <p role="status" className="mx-5 mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 md:mx-8">{successMessage}</p>}

        <div className="mx-auto max-w-[1600px] px-5 py-7 md:px-8 md:py-9">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
            <div>
              <div className="mb-3 flex items-center gap-2"><span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700">{selectedWorkspace?.name ?? "Workspace"}</span><span className="flex items-center gap-1 text-xs text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${selectedProject?.archivedAt ? "bg-slate-400" : "bg-emerald-500"}`}/>{selectedProject?.archivedAt ? "Archived" : "Active project"}</span></div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-[34px]">{selectedProject?.name ?? "Your projects"}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{selectedProject?.description || "Plan, track, and ship your team's work from one place."}</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex -space-x-2">{members.slice(0, 5).map(({ user }) => <div key={user.id} title={user.name} className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#f7f8fc] bg-violet-100 text-[10px] font-bold text-violet-700">{initials(user.name)}</div>)}</div>
                <Link href={workspaceId ? `/dashboard/workspaces/${workspaceId}/members` : "/dashboard"} className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600"><Plus size={15}/></Link>
                <span className="text-xs text-slate-400">{members.length} members</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedProject && canManageProjects && <>
                <button type="button" onClick={() => openProjectEditor(selectedProject)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"><Pencil size={15}/> Edit project</button>
                <button type="button" onClick={() => void archiveProject()} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"><Archive size={15}/> Archive</button>
              </>}
              {canManageProjects && <button type="button" onClick={() => openProjectEditor(null)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"><Plus size={15}/> New project</button>}
              <button type="button" disabled={!selectedProject || Boolean(selectedProject.archivedAt)} onClick={() => openCreateTask()} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={17}/> Add task</button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total tasks" value={String(summary?.total ?? 0).padStart(2, "0")} note={`${summary?.overdue ?? 0} overdue`} icon={<ListTodo size={18}/>} tone="indigo"/>
            <StatCard label="Completed" value={`${doneCount}`.padStart(2, "0")} note={`${progress}% of all tasks`} icon={<Check size={18}/>} tone="green"/>
            <StatCard label="In progress" value={String(summary?.byStatus.IN_PROGRESS ?? 0).padStart(2, "0")} note="Active tasks" icon={<Clock3 size={18}/>} tone="blue"/>
            <StatCard label="Needs review" value={String(summary?.byStatus.REVIEW ?? 0).padStart(2, "0")} note="Ready for feedback" icon={<CircleDot size={18}/>} tone="amber"/>
          </div>

          <section className="mt-8">
            <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div><h2 className="text-lg font-bold text-slate-900">Project board</h2><p className="mt-1 text-sm text-slate-400">Manage your team&apos;s work from start to finish.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-[190px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-400 shadow-sm"><Search size={16}/><input aria-label="Search tasks" value={query} onChange={(e) => { setQuery(e.target.value); setPagination((current) => ({ ...current, page: 1 })); }} placeholder="Search tasks..." className="w-full bg-transparent text-slate-700 outline-none placeholder:text-slate-400"/></label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500 shadow-sm"><Filter size={15}/><select aria-label="Filter by priority" value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPagination((current) => ({ ...current, page: 1 })); }} className="bg-transparent outline-none"><option>All priorities</option><option>High</option><option>Medium</option><option>Low</option></select></label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500 shadow-sm"><select aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPagination((current) => ({ ...current, page: 1 })); }} className="bg-transparent outline-none"><option>All statuses</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label>
              </div>
            </div>

            {!workspaceId && !boardLoading && (
              <EmptyState title="Create your first workspace" description="A workspace gives your projects and teammates a shared home." />
            )}
            {workspaceId && !projects.length && !boardLoading && (
              <EmptyState title="No projects yet" description="Create a project to start adding and organizing tasks." action={canManageProjects ? "Create project" : undefined} onAction={() => openProjectEditor(null)} />
            )}
          </section>
            {selectedProject && <>
            <section className="mt-8">
            {boardLoading && <p className="mb-4 text-sm text-slate-400">Loading project board...</p>}
            <div className="scrollbar-thin grid items-start gap-4 overflow-x-auto pb-5 md:grid-cols-2 2xl:grid-cols-4">
              {columns.map((column) => {
                const columnTasks = filteredTasks.filter((task) => task.status === column.id);
                return (
                  <div key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { const task = tasks.find((item) => item.id === draggedId); if (task) void moveTask(task, column.id); }} className={`min-w-[255px] rounded-xl border p-3 transition ${draggedId ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200/80 bg-[#f0f2f8]/70"}`}>
                    <div className="mb-3 flex items-center justify-between px-1 py-1">
                      <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${column.color}`}/><h3 className="text-sm font-bold text-slate-700">{column.title}</h3><span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-400">{columnTasks.length}</span></div>
                      <button type="button" disabled={Boolean(selectedProject.archivedAt)} onClick={() => openCreateTask(column.id)} aria-label={`Add task to ${column.title}`} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-indigo-600 disabled:opacity-50"><Plus size={17}/></button>
                    </div>
                    <div className="space-y-3">
                      {columnTasks.map((task) => <TaskCard key={task.id} task={task} canDelete={selectedWorkspace?.role !== "MEMBER" || task.creatorId === currentUser.id} onEdit={() => openEditTask(task)} onDelete={() => void deleteTask(task)} onDragStart={() => setDraggedId(task.id)} onDragEnd={() => setDraggedId(null)} />)}
                      {columnTasks.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-slate-400">{boardLoading ? "Loading tasks..." : "No tasks in this status"}</div>}
                    </div>
                    <button type="button" disabled={Boolean(selectedProject.archivedAt)} onClick={() => openCreateTask(column.id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-500 transition hover:border-indigo-300 hover:bg-white hover:text-indigo-600 disabled:opacity-50"><Plus size={15}/> Add a task</button>
                  </div>
                );
              })}
            </div>
            {pagination.pageCount > 1 && (
              <div className="mb-5 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
                <span className="text-slate-500">Showing page {pagination.page} of {pagination.pageCount} · {pagination.total} tasks</span>
                <div className="flex gap-2">
                  <button type="button" disabled={pagination.page <= 1} onClick={() => setPagination((value) => ({ ...value, page: value.page - 1 }))} className="rounded-md border border-slate-200 px-3 py-1.5 font-medium text-slate-600 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={pagination.page >= pagination.pageCount} onClick={() => setPagination((value) => ({ ...value, page: value.page + 1 }))} className="rounded-md border border-slate-200 px-3 py-1.5 font-medium text-slate-600 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}

          </section>

          <div className="mt-2 flex flex-col justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Sparkles size={19}/></div><div><p className="text-sm font-semibold text-slate-800">A little progress adds up.</p><p className="mt-0.5 text-xs text-slate-400">Your team has completed {progress}% of the tasks in this project.</p></div></div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 sm:w-48"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }}/></div>
          </div>
            </>}
          <footer className="flex flex-col gap-2 py-7 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 TeamFlow. Built to help teams do their best work.</span><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/> All systems operational <span className="mx-1">·</span> <button className="hover:text-slate-600">Changelog <ArrowUpRight size={12} className="inline"/></button></span></footer>
        </div>
      </main>

      {showModal && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowModal(false); }}>
        <form onSubmit={saveTask} className="my-6 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold text-slate-900">{editingTask ? "Edit task" : "Create a task"}</h2><p className="mt-1 text-sm text-slate-500">{selectedProject?.name}</p></div><button type="button" onClick={() => setShowModal(false)} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
          <label className="mb-4 block text-sm font-semibold text-slate-700">Task title<input autoFocus required maxLength={200} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Design the settings page" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"/></label>
          <label className="mb-4 block text-sm font-semibold text-slate-700">Description<textarea maxLength={5000} rows={3} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Add context for your teammates..." className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"/></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">Priority<select value={newPriority} onChange={(e) => setNewPriority(e.target.value as Priority)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-400"><option>Low</option><option>Medium</option><option>High</option></select></label>
            <label className="block text-sm font-semibold text-slate-700">Assignee<select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-400"><option value="">Unassigned</option>{members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name}</option>)}</select></label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">Status<select value={newStatus} onChange={(e) => setNewStatus(e.target.value as TaskStatus)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-400">{(editingTask ? allowedUiTransitions[editingTask.status] : columns.map((column) => column.id)).map((status) => <option key={status} value={status}>{columns.find((column) => column.id === status)?.title}</option>)}</select></label>
            <label className="block text-sm font-semibold text-slate-700">Due date<input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-400"/></label>
          </div>
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "Saving..." : editingTask ? "Save changes" : "Create task"}</button></div>
        </form>
      </div>}

      {showProjectModal && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProjectModal(false); }}>
        <form onSubmit={saveProject} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold text-slate-900">{editingProject ? "Edit project" : "Create a project"}</h2><p className="mt-1 text-sm text-slate-500">Projects are visible to members of this workspace.</p></div><button type="button" onClick={() => setShowProjectModal(false)} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
          <label className="mb-4 block text-sm font-semibold text-slate-700">Project name<input autoFocus required minLength={1} maxLength={120} value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Website redesign" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"/></label>
          <label className="block text-sm font-semibold text-slate-700">Description<textarea maxLength={2000} rows={3} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="What is this project about?" className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"/></label>
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowProjectModal(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "Saving..." : editingProject ? "Save changes" : "Create project"}</button></div>
        </form>
      </div>}
    </div>
  );
}

function StatCard({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: React.ReactNode; tone: "indigo" | "green" | "blue" | "amber" }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600",
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-soft"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><span className={`grid h-9 w-9 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span></div><div className="mt-4 flex items-end justify-between"><p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p><span className="pb-1 text-[11px] font-medium text-slate-400">{note}</span></div></div>;
}

function TaskCard({
  task,
  canDelete,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const assigneeInitials = task.assigneeName ? initials(task.assigneeName) : "?";
  return <article draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="group cursor-grab rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,.025)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:cursor-grabbing">
    <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold tracking-wide text-slate-400">TASK-{task.id.slice(-6).toUpperCase()}</span><div className="flex gap-1 opacity-0 transition group-hover:opacity-100"><button type="button" onClick={onEdit} aria-label={`Edit ${task.title}`} className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Pencil size={14}/></button>{canDelete && <button type="button" onClick={onDelete} aria-label={`Delete ${task.title}`} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14}/></button>}</div></div>
    <h4 className="text-sm font-bold leading-5 text-slate-800">{task.title}</h4>
    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{task.description}</p>
    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className={`rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${priorityStyle[task.priority]}`}>{task.priority} priority</span><div className="flex items-center gap-2"><span className="flex items-center gap-1 text-[10px] text-slate-400"><CalendarDays size={12}/>{task.dueDate ? new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No due date"}</span><span title={task.assigneeName ?? "Unassigned"} className="grid h-7 w-7 place-items-center rounded-full bg-violet-100 text-[9px] font-bold text-violet-700">{task.assigneeName ? assigneeInitials : "—"}</span></div></div>
  </article>;
}

function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><ListTodo size={22}/></div>
      <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action && onAction && <button type="button" onClick={onAction} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">{action}</button>}
    </div>
  );
}
