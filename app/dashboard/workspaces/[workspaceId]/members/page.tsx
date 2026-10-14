import { redirect } from "next/navigation";
import WorkspaceMembers from "@/components/workspace-members";
import { getCurrentUser } from "@/lib/auth";

export default async function WorkspaceMembersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { workspaceId } = await params;
  if (!currentUser) {
    redirect(`/login?expired=1&next=${encodeURIComponent(`/dashboard/workspaces/${workspaceId}/members`)}`);
  }
  return <WorkspaceMembers workspaceId={workspaceId} currentUser={currentUser} />;
}
