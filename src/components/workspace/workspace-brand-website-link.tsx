"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";

export function WorkspaceBrandWebsiteLink() {
  const ws = useWorkspace();
  const url = ws.settings.brand_website_url?.trim();
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--ob-text)] shadow-sm transition hover:border-[var(--ob-primary)] hover:text-[var(--ob-primary)] sm:px-3"
      title="Brand website"
    >
      <span className="hidden sm:inline">Brand website</span>
      <span className="sm:hidden">Site</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
    </a>
  );
}

export function WorkspaceSettingsFeaturesLink() {
  const ws = useWorkspace();
  const url = ws.settings.brand_website_url?.trim();
  if (url) return null;


  return (
    <Link
      href="/settings?tab=brand"
      className="inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-full border border-dashed border-[var(--ob-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--ob-text-muted)] hover:border-[var(--ob-primary)] hover:text-[var(--ob-primary)] sm:max-w-none sm:px-3"
    >
      <span className="truncate">Add website</span>
    </Link>
  );
}
