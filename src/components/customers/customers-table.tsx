import Link from "next/link";
import type { Customer } from "@/types/database";

export function CustomersTable({ customers }: { customers: Customer[] }) {
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {customers.map((c) => (
          <li key={c.id} className="ob-card p-4">
            <Link
              href={`/customers/${c.id}`}
              className="text-base font-semibold text-[var(--ob-primary)]"
            >
              {c.name}
            </Link>
            <dl className="mt-2 grid gap-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ob-text-muted)]">Phone</dt>
                <dd className="truncate text-right">{c.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ob-text-muted)]">Email</dt>
                <dd className="truncate text-right">{c.email ?? "—"}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="ob-scroll-x ob-card hidden md:block">
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
                    href={`/customers/${c.id}`}
                    className="font-medium text-[var(--ob-primary)] hover:underline"
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
    </>
  );
}
