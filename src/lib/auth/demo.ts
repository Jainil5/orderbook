"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DEMO_WORKSPACE_COOKIE,
  type DemoBrandCode,
  DEFAULT_DEMO_BRAND_CODE,
} from "@/lib/workspace/constants";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export async function enterDemoWorkspace(
  brandCode: DemoBrandCode = DEFAULT_DEMO_BRAND_CODE,
) {
  const cookieStore = await cookies();
  cookieStore.set(DEMO_WORKSPACE_COOKIE, brandCode, cookieOptions);
  redirect("/dashboard");
}

export async function clearDemoWorkspaceCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_WORKSPACE_COOKIE);
}

export async function logoutAction() {
  await clearDemoWorkspaceCookie();
  redirect("/login");
}
