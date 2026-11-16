import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { CrmSubnav } from "@/components/crm/crm-subnav";
import { ReviewsInbox } from "@/components/crm/reviews-inbox";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function CrmReviewsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const workspace = await loadCrmWorkspace(toDemoBrandCode(ws.brand.code));
  return (
    <PageShell title="Reviews & Complaints">
      <CrmSubnav activeHref="/customers/reviews" />
      <ReviewsInbox
        reviews={workspace.reviews}
        complaints={workspace.complaints}
        customers={workspace.customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={workspace.staff
          .filter((s) => s.status === "active")
          .map((s) => ({ id: s.id, name: s.name }))}
      />
    </PageShell>
  );
}
