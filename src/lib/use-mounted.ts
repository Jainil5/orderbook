"use client";

import { useEffect, useState } from "react";

// false during SSR and the first client render, true after mount.
// Gate time-dependent output (locale strings, "now" grouping) on this so the
// server HTML never depends on the server clock/timezone.
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Intentional: the first client render must also report false to match the
    // server HTML, so we flip it in an effect rather than read it eagerly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  return mounted;
}
