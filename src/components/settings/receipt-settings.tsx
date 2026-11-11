"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setReceiptSettings } from "@/lib/auth/settings-actions";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { canEditWorkspaceFeatures } from "@/lib/workspace/settings-access";

export function ReceiptSettings({
  initialHeader,
  initialFooter,
  initialContactEmail,
  initialContactPhone,
  canEdit,
}: {
  initialHeader: string;
  initialFooter: string;
  initialContactEmail: string;
  initialContactPhone: string;
  canEdit: boolean;
}) {
  const [header, setHeader] = useState(initialHeader);
  const [footer, setFooter] = useState(initialFooter);
  const [email, setEmail] = useState(initialContactEmail);
  const [phone, setPhone] = useState(initialContactPhone);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setMessage(null);
    const result = await setReceiptSettings({
      receiptHeader: header,
      receiptFooter: footer,
      contactEmail: email,
      contactPhone: phone,
    });
    setBusy(false);
    if (result.ok) {
      setMessage("Saved.");
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      <Input
        value={header}
        onChange={(e) => setHeader(e.target.value)}
        placeholder="Receipt header"
        disabled={!canEdit}
      />
      <Input
        value={footer}
        onChange={(e) => setFooter(e.target.value)}
        placeholder="Receipt footer"
        disabled={!canEdit}
      />
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Contact email"
        disabled={!canEdit}
      />
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Contact phone"
        disabled={!canEdit}
      />
      {canEdit ? (
        <Button type="submit" loading={busy}>
          Save receipt settings
        </Button>
      ) : null}
      {message ? <p className="text-sm text-[var(--ob-text-muted)]">{message}</p> : null}
    </form>
  );
}

export function ReceiptSettingsCard() {
  const ws = useWorkspace();
  const canEdit = ws.mode === "demo" || canEditWorkspaceFeatures(ws);
  return (
    <ReceiptSettings
      initialHeader={ws.settings.receipt_header ?? ws.brand.name}
      initialFooter={ws.settings.receipt_footer ?? ""}
      initialContactEmail={ws.settings.contact_email ?? ""}
      initialContactPhone={ws.settings.contact_phone ?? ""}
      canEdit={canEdit}
    />
  );
}
