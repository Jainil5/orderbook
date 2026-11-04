"use client";

import Link from "next/link";
import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { listDemoCustomers } from "@/lib/demo/data";

export default function DemoCustomersPage() {
  const customers = listDemoCustomers();

  return (
    <DemoPageShell title="Customers">
      <div className="overflow-x-auto ob-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-[var(--ob-border)]">
                <td className="px-4 py-3">
                  <Link
                    href={`/demo/customers/${c.id}`}
                    className="font-medium text-[var(--ob-primary)]"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{c.phone ?? "—"}</td>
                <td className="px-4 py-3">{c.email ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoPageShell>
  );
}
