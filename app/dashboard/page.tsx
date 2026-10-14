import { redirect } from "next/navigation";
import TeamflowApp from "@/components/teamflow-app";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?expired=1");

  return <TeamflowApp currentUser={user} />;
}
