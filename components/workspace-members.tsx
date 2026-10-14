"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Copy, MailPlus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { workspaceApi, WorkspaceApiError } from "@/lib/workspace-api";
import type { CurrentUser } from "@/lib/auth";

type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";
type InviteRole = Exclude<WorkspaceRole, "OWNER">;

interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
}

interface Member {
  role: WorkspaceRole;
  createdAt: string;
  user: CurrentUser;
}

interface Invitation {
  token: string;
  expiresAt: string;
  email: string;
}

const roleName: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export default function WorkspaceMembers({
  workspaceId,
  currentUser,
}: {
  workspaceId: string;
  currentUser: CurrentUser;
}) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("MEMBER");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState("");

  const loadWorkspace = useCallback(async () => {
    const [workspaceResult, memberResult] = await Promise.all([
      workspaceApi<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}`),
      workspaceApi<{ members: Member[] }>(`/api/workspaces/${workspaceId}/members`),
    ]);
    setWorkspace(workspaceResult.workspace);
    setMembers(memberResult.members);
  }, [workspaceId]);

  useEffect(() => {
    loadWorkspace()
      .catch((cause: unknown) => {
        if (cause instanceof WorkspaceApiError && cause.status === 401) {
          router.replace(`/login?expired=1&next=${encodeURIComponent(`/dashboard/workspaces/${workspaceId}/members`)}`);
          return;
        }
        setError(cause instanceof WorkspaceApiError && cause.status === 404
          ? "This workspace is unavailable to your account."
          : cause instanceof WorkspaceApiError
            ? cause.message
            : "We couldn't load this workspace. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [loadWorkspace, router, workspaceId]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setInviting(true);
    setError("");
    setInvitation(null);
    try {
      const result = await workspaceApi<{ invitation: Invitation }>(
        `/api/workspaces/${workspaceId}/invitations`,
        { method: "POST", body: JSON.stringify({ email: email.trim(), role: inviteRole }) },
      );
      setInvitation(result.invitation);
      setInviteUrl(`${window.location.origin}/invitations/accept/${result.invitation.token}`);
      setEmail("");
    } catch (cause) {
      setError(cause instanceof WorkspaceApiError
        ? cause.message
        : "We couldn't create the invitation. Please try again.");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(memberId: string, role: WorkspaceRole) {
    setBusyMemberId(memberId);
    setError("");
    try {
      await workspaceApi<void>(`/api/workspaces/${workspaceId}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await loadWorkspace();
    } catch (cause) {
      setError(cause instanceof WorkspaceApiError ? cause.message : "We couldn't update this role.");
    } finally {
      setBusyMemberId("");
    }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.user.name} from ${workspace?.name}?`)) return;
    setBusyMemberId(member.user.id);
    setError("");
    try {
      await workspaceApi<void>(`/api/workspaces/${workspaceId}/members/${member.user.id}`, {
        method: "DELETE",
      });
      setMembers((items) => items.filter((item) => item.user.id !== member.user.id));
    } catch (cause) {
      setError(cause instanceof WorkspaceApiError ? cause.message : "We couldn't remove this member.");
    } finally {
      setBusyMemberId("");
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      setError("Clipboard access is unavailable; copy the invitation link from the field below.");
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl px-5 py-10 text-sm text-slate-500">Loading workspace...</div>;
  }

  if (!workspace) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-10">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"><ArrowLeft size={16} /> Dashboard</Link>
        <p role="alert" className="mt-6 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{error || "This workspace could not be loaded."}</p>
      </main>
    );
  }

  const canManage = workspace.role === "OWNER" || workspace.role === "ADMIN";
  const canManageRoles = workspace.role === "OWNER";

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-10">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"><ArrowLeft size={16} /> Dashboard</Link>
      <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.15em] text-indigo-600">Workspace members</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{workspace.name}</h1>
          <p className="mt-2 text-sm text-slate-500">Manage people and permissions for this workspace.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
          <ShieldCheck size={14} /> Your role: {roleName[workspace.role]}
        </span>
      </div>

      {error && <p role="alert" className="mt-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {canManage && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><MailPlus size={19} /></span>
            <div><h2 className="font-bold text-slate-900">Invite a teammate</h2><p className="mt-1 text-sm text-slate-500">Create a private, one-time link that expires in seven days.</p></div>
          </div>
          <form onSubmit={invite} className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
            <label className="sr-only" htmlFor="invite-email">Email address</label>
            <input
              id="invite-email"
              required
              type="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@example.com"
              className="min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <label className="sr-only" htmlFor="invite-role">Invitation role</label>
            <select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as InviteRole)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
              <option value="MEMBER">Member</option>
              {workspace.role === "OWNER" && <option value="ADMIN">Admin</option>}
            </select>
            <button disabled={inviting} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{inviting ? "Creating..." : "Create invite"}</button>
          </form>
          {invitation && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Invitation link ready for {invitation.email}</p>
              <p className="mt-1 text-xs text-emerald-800">Share this link directly; no email has been sent. Expires {new Date(invitation.expiresAt).toLocaleString()}.</p>
              <div className="mt-3 flex gap-2">
                <input aria-label="Invitation link" readOnly value={inviteUrl} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700" />
                <button type="button" onClick={copyInvite} aria-label="Copy invitation link" className="rounded-lg border border-emerald-200 bg-white px-3 text-emerald-800 hover:bg-emerald-100"><Copy size={16} /></button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div><h2 className="font-bold text-slate-900">People</h2><p className="mt-1 text-sm text-slate-500">{members.length} {members.length === 1 ? "member" : "members"}</p></div>
          <Users size={19} className="text-slate-400" />
        </div>
        <ul className="divide-y divide-slate-100">
          {members.map((member) => {
            const isSelf = member.user.id === currentUser.id;
            const canRemove = workspace.role === "OWNER" ||
              (workspace.role === "ADMIN" && member.role === "MEMBER");
            return (
              <li key={member.user.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                  {member.user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{member.user.name}{isSelf ? " (you)" : ""}</p>
                  <p className="truncate text-sm text-slate-500">{member.user.email}</p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${member.role === "OWNER" ? "bg-violet-50 text-violet-700" : member.role === "ADMIN" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                  {roleName[member.role]}
                </span>
                {canManageRoles && (
                  <label className="sr-only" htmlFor={`role-${member.user.id}`}>Role for {member.user.name}</label>
                )}
                {canManageRoles && (
                  <select
                    id={`role-${member.user.id}`}
                    value={member.role}
                    disabled={busyMemberId === member.user.id}
                    onChange={(event) => void changeRole(member.user.id, event.target.value as WorkspaceRole)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50"
                  >
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                  </select>
                )}
                {canRemove && (
                  <button type="button" aria-label={`Remove ${member.user.name}`} disabled={busyMemberId === member.user.id} onClick={() => void removeMember(member)} className="w-fit rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {members.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No members found.</p>}
      </section>
    </main>
  );
}
