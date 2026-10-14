"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Command, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";

interface AuthFormProps {
  mode: "login" | "register";
  sessionExpired?: boolean;
  redirectTo?: string;
}

interface ApiError {
  message?: string | string[];
}

export default function AuthForm({ mode, sessionExpired = false, redirectTo }: AuthFormProps) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(isRegister ? { name: name.trim() } : {}),
          email: email.trim(),
          password,
        }),
      });
      if (!response.ok) {
        const body = await response.json() as ApiError;
        const message = Array.isArray(body.message) ? body.message[0] : body.message;
        setError(message ?? "We couldn't complete your request. Please try again.");
        return;
      }

      setSuccess(true);
      router.replace(redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f8fc] px-5 py-12 text-slate-800">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 h-[440px] w-[440px] rounded-full bg-indigo-200/35 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-36 h-[480px] w-[480px] rounded-full bg-violet-200/30 blur-3xl" />

      <section className="relative w-full max-w-[440px] rounded-2xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-10">
        <Link href="/" className="mb-9 inline-flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><Command size={21} /></span>
          <span className="text-[19px] font-bold tracking-tight text-slate-900">teamflow</span>
        </Link>

        <p className="mb-2 text-xs font-bold uppercase tracking-[.15em] text-indigo-600">
          {isRegister ? "Start for free" : "Welcome back"}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {isRegister ? "Create your account" : "Sign in to TeamFlow"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isRegister
            ? "Bring your projects and your team together."
            : "Pick up where you left off and keep your projects moving."}
        </p>

        {sessionExpired && (
          <p role="status" className="mt-5 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
            Your session expired. Sign in again to continue.
          </p>
        )}
        {error && <p role="alert" className="mt-5 rounded-lg bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
        {success && (
          <p role="status" className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700">
            <CheckCircle2 size={17} /> Success. Taking you to your dashboard…
          </p>
        )}

        <form className="mt-7 space-y-4" onSubmit={submit}>
          {isRegister && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Full name</span>
              <span className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3 transition focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50">
                <UserRound size={17} className="shrink-0 text-slate-400" />
                <input autoComplete="name" required minLength={1} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              </span>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Email address</span>
            <span className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3 transition focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50">
              <Mail size={17} className="shrink-0 text-slate-400" />
              <input autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
            <span className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3 transition focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50">
              <LockKeyhole size={17} className="shrink-0 text-slate-400" />
              <input autoComplete={isRegister ? "new-password" : "current-password"} type="password" required minLength={isRegister ? 12 : 1} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? "At least 12 characters" : "Your password"} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </span>
          </label>
          {isRegister && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Confirm password</span>
              <span className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3 transition focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50">
                <LockKeyhole size={17} className="shrink-0 text-slate-400" />
                <input autoComplete="new-password" type="password" required minLength={12} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Type your password again" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              </span>
            </label>
          )}

          <button type="submit" disabled={loading || success} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70">
            {loading ? <><LoaderCircle size={17} className="animate-spin" /> {isRegister ? "Creating account…" : "Signing in…"}</> : <>{isRegister ? "Create account" : "Sign in"} <ArrowRight size={17} /></>}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-500">
          {isRegister ? "Already have an account?" : "New to TeamFlow?"}{" "}
          <Link href={isRegister ? "/login" : "/register"} className="font-semibold text-indigo-600 hover:text-indigo-700">
            {isRegister ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
