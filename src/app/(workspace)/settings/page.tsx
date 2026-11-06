"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import { QuotationBuilderSetting } from "@/components/settings/quotation-builder-setting";
import { BrandWebsiteSetting } from "@/components/settings/brand-website-setting";
import { ReceiptSettingsCard } from "@/components/settings/receipt-settings";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { canEditWorkspaceFeatures } from "@/lib/workspace/settings-access";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";

const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "receipt", label: "Receipt" },
  { id: "features", label: "Features" },
  { id: "catalog", label: "Catalog" },
  { id: "brand", label: "Brand website" },
  { id: "team", label: "Team" },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

function tabFromParam(value: string | null): SettingsTabId {
  if (
    value === "features" ||
    value === "catalog" ||
    value === "brand" ||
    value === "profile" ||
    value === "receipt" ||
    value === "team"
  ) {
    return value;
  }
  return "profile";
}

export default function SettingsPage() {
  const ws = useWorkspace();
  const searchParams = useSearchParams();
  const initialTab = useMemo(
    () => tabFromParam(searchParams.get("tab")),
    [searchParams],
  );
  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
  if (prevInitialTab !== initialTab) {
    setPrevInitialTab(initialTab);
    setTab(initialTab);
  }
  const canEdit = canEditWorkspaceFeatures(ws);

  return (
    <PageShell title="Settings">
      <Tabs
        label="Settings sections"
        value={tab}
        onChange={setTab}
        options={[...SETTINGS_TABS]}
      />

      <div className="mt-4">
        {tab === "profile" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Business profile</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-[var(--ob-text-muted)]">Name</dt>
                  <dd>{ws.brand.name}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ob-text-muted)]">Brand ID</dt>
                  <dd>{ws.brand.code}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ob-text-muted)]">Currency</dt>
                  <dd>{ws.settings.currency_code}</dd>
                </div>
                {ws.settings.tax_rate_percent != null ? (
                  <div>
                    <dt className="text-[var(--ob-text-muted)]">Tax rate</dt>
                    <dd>{ws.settings.tax_rate_percent}%</dd>
                  </div>
                ) : null}
                {ws.settings.brand_website_url ? (
                  <div>
                    <dt className="text-[var(--ob-text-muted)]">Brand website</dt>
                    <dd>
                      <a
                        href={ws.settings.brand_website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-[var(--ob-primary)]"
                      >
                        {ws.settings.brand_website_url}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Card>
            <Card>
              <h2 className="font-semibold">Your account</h2>
              {ws.mode === "live" && ws.userEmail ? (
                <p className="mt-2 text-sm">{ws.userEmail}</p>
              ) : (
                <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
                  Guest workspace — sign in to manage your account.
                </p>
              )}
              {ws.mode === "live" ? (
                <Badge className="mt-3" tone="neutral">
                  Role: {ws.member.role}
                </Badge>
              ) : null}
            </Card>
          </div>
        ) : null}

        {tab === "receipt" ? (
          <Card className="max-w-2xl">
            <h2 className="font-semibold">Receipt & contact</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Shown on PDFs, printouts, and WhatsApp bills.
            </p>
            <div className="mt-4">
              <ReceiptSettingsCard />
            </div>
          </Card>
        ) : null}

        {tab === "features" ? (
          <Card className="max-w-2xl">
            <h2 className="font-semibold">Workspace features</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Turn optional tools on or off for everyone in this business.
            </p>
            <QuotationBuilderSetting
              initialEnabled={Boolean(ws.settings.quotation_builder_enabled)}
              canEdit={canEdit}
            />
          </Card>
        ) : null}

        {tab === "catalog" ? (
          <Card className="max-w-2xl">
            <h2 className="font-semibold">Catalog &amp; offers</h2>
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              Products, prices, photos, and promo codes live in one place. They
              feed Quotation, Bill, and Billing checkout.
            </p>
            <Link href="/products" className="mt-4 inline-block">
              <Button type="button">Open products</Button>
            </Link>
          </Card>
        ) : null}

        {tab === "brand" ? (
          <Card className="max-w-2xl">
            <BrandWebsiteSetting
              initialUrl={ws.settings.brand_website_url}
              canEdit={canEdit}
            />
          </Card>
        ) : null}

        {tab === "team" ? (
          <Card className="max-w-2xl">
            <h2 className="font-semibold">Team</h2>
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              Invite owners, managers, and staff via Supabase{" "}
              <code className="text-xs">brand_members</code>. Role-based
              discount limits apply in Billing (staff 10%, manager 30%).
            </p>
            {ws.mode === "live" ? (
              <p className="mt-3 text-sm">
                Signed in as {ws.userEmail} · role{" "}
                <Badge tone="neutral">{ws.member.role}</Badge>
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
                Demo workspace runs as owner.
              </p>
            )}
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}
