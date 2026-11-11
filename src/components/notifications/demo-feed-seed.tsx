"use client";

import { useEffect, useRef } from "react";
import { buildDemoNotifications } from "@/lib/notifications/demo-feed-data";
import { useNotifications } from "./notifications-context";

// Seeds the bell with repo-only demo data. Mount only in demo
// workspaces; ids are stable so re-mounts and StrictMode double-runs collapse.
export function DemoFeedSeed() {
  const { seed } = useNotifications();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    seed(buildDemoNotifications(Date.now()));
  }, [seed]);

  return null;
}
