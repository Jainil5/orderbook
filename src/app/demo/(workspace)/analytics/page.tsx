"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { getDemoAnalytics } from "@/lib/demo/data";
import { formatMoney } from "@/lib/format";
import { useDemoWorkspace } from "@/components/workspace/demo-workspace-provider";
import { Card } from "@/components/ui/card";

export default function DemoAnalyticsPage() {
  const { settings } = useDemoWorkspace();
  const a = getDemoAnalytics();

  return (
    <DemoPageShell title="Analytics">
      <p className="mb-4 text-sm text-[var(--ob-text-muted)]">
        Sample range · gross {formatMoney(a.grossSales, settings.currency_code)} ·
        net {formatMoney(a.netSales, settings.currency_code)}
      </p>
      <Card>
        <h2 className="mb-4 text-sm font-semibold">Sales over time (sample)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={a.salesOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ec" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) =>
                  formatMoney(Number(value ?? 0), settings.currency_code)
                }
              />
              <Bar dataKey="total" fill="#1f3a5f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </DemoPageShell>
  );
}
