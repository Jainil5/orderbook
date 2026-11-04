"use client";

import type { Brand, BrandMember, BrandSettings } from "@/types/database";
import { createContext, useContext } from "react";

export type LiveWorkspace = {
  userEmail: string | null | undefined;
  member: BrandMember;
  brand: Brand;
  settings: BrandSettings;
};

const Ctx = createContext<LiveWorkspace | null>(null);

export function LiveWorkspaceProvider({
  value,
  children,
}: {
  value: LiveWorkspace;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Live workspace context missing");
  return ctx;
}
