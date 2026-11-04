import Link from "next/link";
import { LivePageShell } from "@/components/workspace/live-page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const ws = await loadLiveWorkspace();
  if (!ws) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("brand_id", ws.brand.id)
    .maybeSingle();

  if (!customer) notFound();

  return (
    <LivePageShell
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
    </LivePageShell>
  );
}
