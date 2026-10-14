import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { expired } = await searchParams;
  return <AuthForm mode="login" sessionExpired={expired === "1"} />;
}
