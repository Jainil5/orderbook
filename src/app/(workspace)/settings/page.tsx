"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { QuotationBuilderSetting } from "@/components/settings/quotation-builder-setting";
import { ManagerModulesSetting } from "@/components/settings/manager-modules-setting";
import { BrandWebsiteSetting } from "@/components/settings/brand-website-setting";
import { ReceiptSettingsCard } from "@/components/settings/receipt-settings";
import { WorkingHoursSetting } from "@/components/settings/working-hours-setting";
import { StockGuardSetting } from "@/components/settings/stock-guard-setting";
import { ExportDataSetting } from "@/components/settings/export-data-setting";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { canEditWorkspaceFeatures } from "@/lib/workspace/settings-access";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";

const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "receipt", label: "Receipt" },
  { id: "hours", label: "Working hours" },
  { id: "features", label: "Features" },
  { id: "brand", label: "Brand website" },
  { id: "export", label: "Export data" },
  { id: "team", label: "Team" },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

function tabFromParam(value: string | null): SettingsTabId {
  if (
    value === "features" ||
    value === "brand" ||
    value === "export" ||
    value === "profile" ||
    value === "receipt" ||
    value === "hours" ||
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
              <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
                Demo workspace — your edits stay on this device.
              </p>
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

        {tab === "hours" ? (
          <Card className="max-w-2xl">
            <h2 className="font-semibold">Working hours</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              When the doors are open, and whether you are taking orders right
              now. Your brand website header and every &ldquo;are you open?&rdquo;
              screen read this.
            </p>
            <WorkingHoursSetting
              initialHours={ws.settings.working_hours}
              initialPaused={Boolean(ws.settings.orders_paused)}
              canEdit={canEdit}
              websiteUrl={ws.settings.brand_website_url ?? null}
            />
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
            <StockGuardSetting
              initialEnabled={Boolean(ws.settings.block_oversell)}
              canEdit={canEdit}
            />
            <ManagerModulesSetting hidden={ws.hiddenManagerModules} canEdit={canEdit} />
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

        {tab === "export" ? (
          <Card className="max-w-3xl">
            <h2 className="font-semibold">Export data</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Pick the months you want and download them as CSV — for an
              accountant, a spreadsheet, or a backup of the demo so far.
            </p>
            <ExportDataSetting />
          </Card>
        ) : null}

        {tab === "team" ? (
          <Card className="max-w-2xl">
            <h2 className="font-semibold">Team</h2>
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              Role-based discount limits apply in Billing (staff 10%, manager
              30%).
            </p>
            <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
              Demo workspace runs as owner.
            </p>
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}
