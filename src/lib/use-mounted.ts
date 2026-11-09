"use client";

import { useEffect, useState } from "react";

// false during SSR and the first client render, true after mount.
// Gate time-dependent output (locale strings, "now" grouping) on this so the
// server HTML never depends on the server clock/timezone.
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
