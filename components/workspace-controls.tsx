"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Pencil, Plus, Users, X } from "lucide-react";
import { workspaceApi, WorkspaceApiError } from "@/lib/workspace-api";

type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
}

export default function WorkspaceControls({ compact = false }: { compact?: boolean }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selected = workspaces.find((workspace) => workspace.id === selectedId);

  const refresh = useCallback(async () => {
    const result = await workspaceApi<{ workspaces: Workspace[] }>("/api/workspaces");
    setWorkspaces(result.workspaces);
    setSelectedId((current) =>
      result.workspaces.some((workspace) => workspace.id === current)
        ? current
        : result.workspaces[0]?.id ?? "",
    );
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setError("We couldn't load your workspaces. Please try again."))
      .finally(() => setLoading(false));
  }, [refresh]);

  function openCreate() {
    setEditing(false);
    setName("");
    setError("");
    setShowEditor(true);
  }

  function openEdit() {
    if (!selected) return;
    setEditing(true);
    setName(selected.name);
    setError("");
    setShowEditor(true);
  }

  async function saveWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing && selected) {
        const result = await workspaceApi<{ workspace: Workspace }>(
          `/api/workspaces/${selected.id}`,
          { method: "PATCH", body: JSON.stringify({ name }) },
        );
        setWorkspaces((items) => items.map((item) =>
          item.id === selected.id ? { ...item, name: result.workspace.name } : item,
        ));
      } else {
        const result = await workspaceApi<{ workspace: Workspace }>("/api/workspaces", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
        setWorkspaces((items) => [...items, result.workspace]);
        setSelectedId(result.workspace.id);
      }
      setShowEditor(false);
    } catch (cause) {
      setError(cause instanceof WorkspaceApiError
        ? cause.message
        : "We couldn't save the workspace. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorkspace() {
    if (!selected || !window.confirm(`Delete "${selected.name}" and its membership data? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    try {
      await workspaceApi<void>(`/api/workspaces/${selected.id}`, { method: "DELETE" });
      const remaining = workspaces.filter((workspace) => workspace.id !== selected.id);
      setWorkspaces(remaining);
      setSelectedId(remaining[0]?.id ?? "");
      setShowEditor(false);
    } catch (cause) {
      setError(cause instanceof WorkspaceApiError
        ? cause.message
        : "We couldn't delete the workspace. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={compact ? "w-full" : ""}>
      <div className={`${compact ? "mt-0" : "mt-8"} flex items-center gap-2`}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Select workspace</span>
          <div className="relative">
            <select
              aria-label="Select workspace"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={loading || workspaces.length === 0}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-3 pr-9 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-50 focus:ring-2 focus:ring-indigo-200 disabled:text-slate-400"
            >
              {loading && <option value="">Loading workspaces...</option>}
              {!loading && workspaces.length === 0 && <option value="">No workspaces yet</option>}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </label>
        {selected && (selected.role === "OWNER" || selected.role === "ADMIN") && (
          <button
            type="button"
            onClick={openEdit}
            aria-label="Edit workspace"
            title="Edit workspace"
            className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50"
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
      {selected && (
        <div className="mt-2 flex items-center justify-between px-1">
          <span className="text-xs text-slate-400">{selected.role.toLowerCase()}</span>
          <Link
            href={`/dashboard/workspaces/${selected.id}/members`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            <Users size={13} /> Members
          </Link>
        </div>
      )}
      {!loading && workspaces.length === 0 && (
        <p className="mt-2 px-1 text-xs text-slate-400">Create a workspace to invite your team.</p>
      )}
      {error && !showEditor && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
      <button
        type="button"
        onClick={openCreate}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-600"
      >
        <Plus size={15} /> Create workspace
      </button>

      {showEditor && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowEditor(false);
          }}
        >
          <form onSubmit={saveWorkspace} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit workspace" : "Create workspace"}</h2>
                <p className="mt-1 text-sm text-slate-500">Give your team a shared place to organize work.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setShowEditor(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Workspace name
              <input
                autoFocus
                required
                minLength={1}
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
            <div className="mt-6 flex flex-wrap justify-between gap-2">
              {editing && selected?.role === "OWNER" && (
                <button type="button" disabled={saving} onClick={() => void deleteWorkspace()} className="rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">Delete workspace</button>
              )}
              <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setShowEditor(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "Saving..." : editing ? "Save changes" : "Create workspace"}
              </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
