"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Command, LoaderCircle } from "lucide-react";
import { workspaceApi, WorkspaceApiError } from "@/lib/workspace-api";

export default function InvitationAccept({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function accept() {
    setError("");
    setLoading(true);
    try {
      await workspaceApi("/api/workspaces/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setAccepted(true);
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      if (cause instanceof WorkspaceApiError && cause.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/invitations/accept/${token}`)}`);
        return;
      }
      setError(cause instanceof WorkspaceApiError
        ? cause.message
        : "We couldn't accept this invitation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f8fc] px-5 py-12 text-slate-800">
      <section className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-10">
        <Link href="/dashboard" className="mb-9 inline-flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><Command size={21} /></span>
          <span className="text-[19px] font-bold tracking-tight text-slate-900">teamflow</span>
        </Link>
        <p className="text-xs font-bold uppercase tracking-[.15em] text-indigo-600">Workspace invitation</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">You&apos;re invited</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">Accept this private invitation to join the workspace. The invitation can only be used once and expires after seven days.</p>
        {error && <p role="alert" className="mt-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        {accepted ? (
          <p className="mt-6 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCircle2 size={17} /> Invitation accepted. Opening your dashboard...</p>
        ) : (
          <button type="button" onClick={() => void accept()} disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-60">
            {loading && <LoaderCircle size={16} className="animate-spin" />}
            {loading ? "Accepting..." : "Accept invitation"}
          </button>
        )}
        <Link href="/dashboard" className="mt-5 block text-center text-sm font-medium text-slate-500 hover:text-indigo-600">Return to dashboard</Link>
      </section>
    </main>
  );
}
