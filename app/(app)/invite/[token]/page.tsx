import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authorization/policies";
import { acceptInvitationAction } from "@/app/(app)/workspaces-actions";

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireUser();
  const result = await acceptInvitationAction(token);

  if (!result.ok) {
    return (
      <div>
        <span className="eyebrow">Invitation</span>
        <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>Couldn&apos;t join</h2>
        <p className="field-error">{result.error}</p>
      </div>
    );
  }

  redirect("/dashboard");
}
