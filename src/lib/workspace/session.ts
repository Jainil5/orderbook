import { cookies } from "next/headers";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { demoWorkspaceMeta } from "@/lib/demo/data";
import { DEMO_WORKSPACE_COOKIE } from "@/lib/workspace/constants";
import type { Brand, BrandMember, BrandRole, BrandSettings } from "@/types/database";

export type WorkspaceSession =
  | {
      mode: "live";
      brand: Brand;
      settings: BrandSettings;
      userEmail: string | null | undefined;
      member: BrandMember;
      role: BrandRole;
    }
  | {
      mode: "demo";
      brand: Brand;
      settings: BrandSettings;
      userEmail: null;
      role: "owner";
    };

export async function isDemoWorkspaceCookieSet(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value === "1";
}

export async function loadWorkspaceSession(): Promise<WorkspaceSession | null> {
  const live = await loadLiveWorkspace();
  if (live) {
    return {
      mode: "live",
      brand: live.brand,
      settings: live.settings,
      userEmail: live.userEmail,
      member: live.member,
      role: live.member.role,
    };
  }

  if (await isDemoWorkspaceCookieSet()) {
    const meta = demoWorkspaceMeta();
    return {
      mode: "demo",
      brand: meta.brand,
      settings: meta.settings,
      userEmail: null,
      role: "owner",
    };
  }

  return null;
}
