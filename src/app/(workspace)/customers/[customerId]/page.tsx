import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import { getDemoCustomer } from "@/lib/demo/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { Card } from "@/components/ui/card";
import { notFound, redirect } from "next/navigation";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    const customer = getDemoCustomer(customerId);
    if (!customer) notFound();
    return (
      <PageShell
        title={customer.name}
        headerActions={
          <Link href="/customers" className="text-sm text-[var(--ob-primary)]">
            Back
          </Link>
        }
      >
        <Card>
          <p className="text-sm text-[var(--ob-text-muted)]">Phone</p>
          <p>{customer.phone ?? "—"}</p>
          <p className="mt-4 text-sm text-[var(--ob-text-muted)]">Email</p>
          <p>{customer.email ?? "—"}</p>
        </Card>
      </PageShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("brand_id", ws.brand.id)
    .maybeSingle();

  if (!customer) notFound();

  return (
    <PageShell
      title={customer.name}
      headerActions={
        <Link href="/customers" className="text-sm text-[var(--ob-primary)]">
          Back
        </Link>
      }
    >
      <Card>
        <p>{customer.phone ?? "No phone"}</p>
        <p className="mt-2">{customer.email ?? "No email"}</p>
      </Card>
    </PageShell>
  );
}
