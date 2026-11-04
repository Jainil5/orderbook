"use client";

import type { WorkspaceSession } from "@/lib/workspace/session";
import { createContext, useContext } from "react";

const Ctx = createContext<WorkspaceSession | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceSession;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Workspace context missing");
  return ctx;
}
