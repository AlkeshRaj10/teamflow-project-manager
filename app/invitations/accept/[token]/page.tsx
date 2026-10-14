import { redirect } from "next/navigation";
import InvitationAccept from "@/components/invitation-accept";
import { getCurrentUser } from "@/lib/auth";

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!await getCurrentUser()) {
    redirect(`/login?next=${encodeURIComponent(`/invitations/accept/${token}`)}`);
  }
  return <InvitationAccept token={token} />;
}
