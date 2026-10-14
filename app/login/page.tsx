import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; next?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { expired, next } = await searchParams;
  const redirectTo = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return <AuthForm mode="login" sessionExpired={expired === "1"} redirectTo={redirectTo} />;
}
