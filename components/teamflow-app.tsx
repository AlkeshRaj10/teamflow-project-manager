"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Bell, CalendarDays, Check, ChevronDown, CircleHelp, Command,
  Filter, LayoutDashboard, ListTodo, LogOut, MoreHorizontal, Plus, Search, Settings2,
  SlidersHorizontal, Sparkles, Users, X, ArrowUpRight, Clock3, CircleDot,
} from "lucide-react";
import { columns, initialTasks, members } from "@/lib/seed";
import type { Priority, Task, TaskStatus } from "@/types/task";
import type { CurrentUser } from "@/lib/auth";
import WorkspaceControls from "@/components/workspace-controls";

const avatarColors: Record<string, string> = {
  AR: "bg-violet-100 text-violet-700",
  SK: "bg-rose-100 text-rose-700",
  JM: "bg-amber-100 text-amber-700",
};

const priorityStyle: Record<Priority, string> = {
  High: "bg-rose-50 text-rose-700 ring-rose-100",
  Medium: "bg-amber-50 text-amber-700 ring-amber-100",
  Low: "bg-slate-100 text-slate-600 ring-slate-200",
};

const labelStyle: Record<string, string> = {
  Design: "bg-fuchsia-50 text-fuchsia-700",
  Frontend: "bg-blue-50 text-blue-700",
  Backend: "bg-emerald-50 text-emerald-700",
  Auth: "bg-indigo-50 text-indigo-700",
  Feature: "bg-cyan-50 text-cyan-700",
  Setup: "bg-slate-100 text-slate-600",
  UX: "bg-pink-50 text-pink-700",
  Docs: "bg-orange-50 text-orange-700",
  QA: "bg-purple-50 text-purple-700",
};

export default function TeamflowApp({ currentUser }: { currentUser: CurrentUser }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [showModal, setShowModal] = useState(false);
  const [activeNav, setActiveNav] = useState("My projects");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("Medium");
  const [newAssignee, setNewAssignee] = useState("AR");
  const [newStatus, setNewStatus] = useState<TaskStatus>("todo");
  const [authError, setAuthError] = useState("");
  const [logoutLoading, setLogoutLoading] = useState(false);
  const userInitials = currentUser.name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join("") || "U";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (response.status === 401) router.replace("/login?expired=1");
        else if (!response.ok) throw new Error("Session check failed.");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          setAuthError("We couldn't verify your session. Please try refreshing the page.");
        }
      });
    return () => controller.abort();
  }, [router]);

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

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const matchesQuery = `${task.title} ${task.description} ${task.id} ${task.labels.join(" ")}`.toLowerCase().includes(query.toLowerCase());
    const matchesPriority = priorityFilter === "All priorities" || task.priority === priorityFilter;
    return matchesQuery && matchesPriority;
  }), [tasks, query, priorityFilter]);

  const doneCount = tasks.filter((task) => task.status === "done").length;
  const progress = Math.round((doneCount / Math.max(tasks.length, 1)) * 100);

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    const task: Task = {
      id: `TF-${Math.floor(109 + Math.random() * 890)}`,
      title: newTitle.trim(),
      description: "Add a description to give your team more context.",
      status: newStatus,
      priority: newPriority,
      assignee: newAssignee,
      dueDate: "Oct 24",
      labels: ["New"],
    };
    setTasks((current) => [task, ...current]);
    setNewTitle("");
    setShowModal(false);
  }

  function moveTask(taskId: string, status: TaskStatus) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status } : task));
    setDraggedId(null);
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-800">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-slate-200/80 bg-white px-4 py-5 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><Command size={21} /></div>
          <div><p className="text-[17px] font-bold tracking-tight text-slate-900">teamflow</p><p className="text-[11px] font-medium text-slate-400">WORKSPACE</p></div>
          <button aria-label="Switch workspace" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><ChevronDown size={16}/></button>
        </div>

        <WorkspaceControls />

        <p className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</p>
        <nav className="space-y-1">
          {[
            { label: "Overview", icon: LayoutDashboard },
            { label: "My projects", icon: ListTodo },
            { label: "Team", icon: Users },
            { label: "Activity", icon: Activity },
          ].map(({ label, icon: Icon }) => (
            <button key={label} onClick={() => setActiveNav(label)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${activeNav === label ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
              <Icon size={18} strokeWidth={1.8}/>{label}
              {label === "Activity" && <span className="ml-auto h-2 w-2 rounded-full bg-indigo-500"/>}
            </button>
          ))}
        </nav>

        <div className="mb-2 mt-8 flex items-center justify-between px-3"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Your projects</p><button aria-label="Add project" className="text-slate-400 hover:text-indigo-600"><Plus size={15}/></button></div>
        <div className="space-y-1">
          <button className="flex w-full items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800"><span className="h-2.5 w-2.5 rounded-[4px] bg-indigo-500"/>Website redesign<span className="ml-auto text-xs text-slate-400">8</span></button>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"><span className="h-2.5 w-2.5 rounded-[4px] bg-emerald-500"/>Mobile app<span className="ml-auto text-xs text-slate-400">12</span></button>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"><span className="h-2.5 w-2.5 rounded-[4px] bg-amber-500"/>Marketing site<span className="ml-auto text-xs text-slate-400">5</span></button>
        </div>

        <div className="mt-auto space-y-1 border-t border-slate-100 pt-4">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"><Settings2 size={18}/>Settings</button>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"><CircleHelp size={18}/>Help & support</button>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div title={currentUser.name} className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white">{userInitials}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{currentUser.name}</p><p className="truncate text-xs text-slate-400">{currentUser.email}</p></div>
            <button type="button" onClick={logout} disabled={logoutLoading} aria-label="Log out" title="Log out" className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50"><LogOut size={17}/></button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:ml-[248px]">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 text-sm text-slate-400"><span>Projects</span><span>/</span><span className="font-semibold text-slate-800">Website redesign</span></div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 sm:flex"><Search size={14}/><span>Search anything...</span><kbd className="ml-4 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]">⌘ K</kbd></div>
            <button aria-label="Notifications" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Bell size={19}/><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-rose-500"/></button>
            <div title={currentUser.name} className="grid h-9 w-9 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{userInitials}</div>
          </div>
        </header>

        <div className="border-b border-slate-200/80 bg-white px-5 py-3 lg:hidden md:px-8">
          <WorkspaceControls compact />
        </div>

        {authError && <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 md:mx-8">{authError}</p>}

        <div className="mx-auto max-w-[1600px] px-5 py-7 md:px-8 md:py-9">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
            <div>
              <div className="mb-3 flex items-center gap-2"><span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700">Product & design</span><span className="flex items-center gap-1 text-xs text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/> On track</span></div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-[34px]">Website redesign</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Plan, track, and ship the next version of your website with the whole team.</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex -space-x-2">{members.map((member) => <div key={member.initials} title={member.name} className={`grid h-8 w-8 place-items-center rounded-full border-2 border-[#f7f8fc] text-[10px] font-bold ${avatarColors[member.initials]}`}>{member.initials}</div>)}</div>
                <button className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600"><Plus size={15}/></button>
                <span className="text-xs text-slate-400">3 members</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"><CalendarDays size={16}/> Oct 14 – Oct 28 <ChevronDown size={14}/></button>
              <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700"><Plus size={17}/> Add task</button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total tasks" value={String(tasks.length).padStart(2, "0")} note="+2 this week" icon={<ListTodo size={18}/>} tone="indigo"/>
            <StatCard label="Completed" value={`${doneCount}`.padStart(2, "0")} note={`${progress}% of all tasks`} icon={<Check size={18}/>} tone="green"/>
            <StatCard label="In progress" value={String(tasks.filter(t => t.status === "in-progress").length).padStart(2, "0")} note="Across 2 members" icon={<Clock3 size={18}/>} tone="blue"/>
            <StatCard label="Needs review" value={String(tasks.filter(t => t.status === "review").length).padStart(2, "0")} note="Ready for feedback" icon={<CircleDot size={18}/>} tone="amber"/>
          </div>

          <section className="mt-8">
            <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div><h2 className="text-lg font-bold text-slate-900">Project board</h2><p className="mt-1 text-sm text-slate-400">Manage your team&apos;s work from start to finish.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-[190px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-400 shadow-sm"><Search size={16}/><input aria-label="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks..." className="w-full bg-transparent text-slate-700 outline-none placeholder:text-slate-400"/></label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500 shadow-sm"><Filter size={15}/><select aria-label="Filter by priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="bg-transparent outline-none"><option>All priorities</option><option>High</option><option>Medium</option><option>Low</option></select></label>
                <button className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm hover:bg-slate-50" aria-label="Board options"><SlidersHorizontal size={16}/></button>
              </div>
            </div>

            <div className="scrollbar-thin grid items-start gap-4 overflow-x-auto pb-5 md:grid-cols-2 2xl:grid-cols-4">
              {columns.map((column) => {
                const columnTasks = filteredTasks.filter((task) => task.status === column.id);
                return (
                  <div key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={() => draggedId && moveTask(draggedId, column.id)} className={`min-w-[255px] rounded-xl border p-3 transition ${draggedId ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200/80 bg-[#f0f2f8]/70"}`}>
                    <div className="mb-3 flex items-center justify-between px-1 py-1">
                      <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${column.color}`}/><h3 className="text-sm font-bold text-slate-700">{column.title}</h3><span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-400">{columnTasks.length}</span></div>
                      <button onClick={() => { setNewStatus(column.id); setShowModal(true); }} aria-label={`Add task to ${column.title}`} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-indigo-600"><Plus size={17}/></button>
                    </div>
                    <div className="space-y-3">
                      {columnTasks.map((task) => <TaskCard key={task.id} task={task} onDragStart={() => setDraggedId(task.id)} onDragEnd={() => setDraggedId(null)} />)}
                      {columnTasks.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-slate-400">Drop a task here</div>}
                    </div>
                    <button onClick={() => { setNewStatus(column.id); setShowModal(true); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-500 transition hover:border-indigo-300 hover:bg-white hover:text-indigo-600"><Plus size={15}/> Add a task</button>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="mt-2 flex flex-col justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Sparkles size={19}/></div><div><p className="text-sm font-semibold text-slate-800">A little progress adds up.</p><p className="mt-0.5 text-xs text-slate-400">Your team has completed {progress}% of the tasks in this project.</p></div></div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 sm:w-48"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }}/></div>
          </div>
          <footer className="flex flex-col gap-2 py-7 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 TeamFlow. Built to help teams do their best work.</span><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/> All systems operational <span className="mx-1">·</span> <button className="hover:text-slate-600">Changelog <ArrowUpRight size={12} className="inline"/></button></span></footer>
        </div>
      </main>

      {showModal && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowModal(false); }}>
        <form onSubmit={addTask} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold text-slate-900">Create a task</h2><p className="mt-1 text-sm text-slate-500">Add a task to your project board.</p></div><button type="button" onClick={() => setShowModal(false)} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
          <label className="mb-4 block text-sm font-semibold text-slate-700">Task title<input autoFocus required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Design the settings page" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"/></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">Priority<select value={newPriority} onChange={(e) => setNewPriority(e.target.value as Priority)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-400"><option>Low</option><option>Medium</option><option>High</option></select></label>
            <label className="block text-sm font-semibold text-slate-700">Assignee<select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-400">{members.map((member) => <option key={member.initials} value={member.initials}>{member.name}</option>)}</select></label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Status<select value={newStatus} onChange={(e) => setNewStatus(e.target.value as TaskStatus)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-400">{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label>
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Create task</button></div>
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

function TaskCard({ task, onDragStart, onDragEnd }: { task: Task; onDragStart: () => void; onDragEnd: () => void }) {
  return <article draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="group cursor-grab rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,.025)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:cursor-grabbing">
    <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold tracking-wide text-slate-400">{task.id}</span><button aria-label={`More options for ${task.title}`} className="rounded p-1 text-slate-300 opacity-0 transition hover:bg-slate-100 group-hover:opacity-100"><MoreHorizontal size={16}/></button></div>
    <h4 className="text-sm font-bold leading-5 text-slate-800">{task.title}</h4>
    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{task.description}</p>
    <div className="mt-3 flex flex-wrap gap-1.5">{task.labels.map((label) => <span key={label} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${labelStyle[label] ?? "bg-slate-100 text-slate-600"}`}>{label}</span>)}</div>
    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className={`rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${priorityStyle[task.priority]}`}>{task.priority} priority</span><div className="flex items-center gap-2"><span className="flex items-center gap-1 text-[10px] text-slate-400"><CalendarDays size={12}/>{task.dueDate}</span><span title={members.find(m => m.initials === task.assignee)?.name ?? "Team member"} className={`grid h-7 w-7 place-items-center rounded-full text-[9px] font-bold ${avatarColors[task.assignee] ?? "bg-slate-100 text-slate-600"}`}>{task.assignee}</span></div></div>
  </article>;
}
