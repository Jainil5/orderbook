"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBrandWebsiteUrl } from "@/lib/auth/settings-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BrandWebsiteSetting({
  initialUrl,
  canEdit,
}: {
  initialUrl: string | null | undefined;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialUrl ?? "");
  const [saved, setSaved] = useState(initialUrl ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value.trim() !== (saved ?? "").trim();

  async function onSave() {
    if (!canEdit) return;
    setPending(true);
    setError(null);
    const result = await setBrandWebsiteUrl(value);
    setPending(false);
    if (result.ok) {
      const next = result.url ?? "";
      setSaved(next);
      setValue(next);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">Brand website</p>
        <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
          Link to your public site or product catalog. When saved, a{" "}
          <span className="font-medium text-[var(--ob-text-secondary)]">
            Brand website
          </span>{" "}
          button appears in the header on every workspace page.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-[var(--ob-text-muted)]" htmlFor="brand-website">
          Website URL
        </label>
        <Input
          id="brand-website"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://yourbrand.com/products"
          value={value}
          disabled={!canEdit || pending}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          loading={pending}
          disabled={!canEdit || !dirty}
          onClick={onSave}
        >
          Save link
        </Button>
        {saved ? (
          <a
            href={saved}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--ob-primary)]"
          >
            Preview in new tab
          </a>
        ) : null}
      </div>
      {!canEdit ? (
        <p className="text-xs text-[var(--ob-text-muted)]">
          Only owners and managers can change this in live workspaces.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-xs text-[var(--ob-danger)]">{error}</p> : null}
    </div>
  );
}
