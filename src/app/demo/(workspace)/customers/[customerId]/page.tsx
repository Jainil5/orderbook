"use client";

import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { getDemoCustomer } from "@/lib/demo/data";
import { useParams, notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import Link from "next/link";

export default function DemoCustomerDetailPage() {
  const params = useParams<{ customerId: string }>();
  const customer = getDemoCustomer(params.customerId);
  if (!customer) notFound();

  return (
    <DemoPageShell
      title={customer.name}
      headerActions={
        <Link href="/demo/customers" className="text-sm text-[var(--ob-primary)]">
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
    </DemoPageShell>
  );
}
