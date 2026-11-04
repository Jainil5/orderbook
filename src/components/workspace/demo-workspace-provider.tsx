"use client";

import type { Brand, BrandSettings } from "@/types/database";
import { createContext, useContext } from "react";

const Ctx = createContext<{ brand: Brand; settings: BrandSettings } | null>(
  null,
);

export function DemoWorkspaceProvider({
  value,
  children,
}: {
  value: { brand: Brand; settings: BrandSettings };
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Demo workspace context missing");
  return ctx;
}
