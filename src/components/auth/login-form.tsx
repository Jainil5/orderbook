"use client";

import { useEffect, useState, useActionState } from "react";
import { loginWithBrandCode, type LoginState } from "@/lib/auth/actions";
import { enterDemoWorkspace } from "@/lib/auth/demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DemoBrandCode } from "@/lib/workspace/constants";

export function LoginForm({
  demoBrand,
  next,
}: {
  /** Set when the URL came from a demo link, e.g. `/demo/orders?brand=BR-2`. */
  demoBrand?: DemoBrandCode | null;
  /** Where that link wanted to go, already validated on the server. */
  next?: string | null;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState<LoginState | null, FormData>(
    loginWithBrandCode,
    null,
  );

  /* A demo link used to open the workspace on the first request. Keeping that
     means signing in here on arrival, so the only difference a visitor sees is
     one extra redirect through `/login`. Both props are plain strings, so this
     runs once per link rather than on every render, and there is no loading
     state to show: the action navigates away. */
  useEffect(() => {
    if (demoBrand) void enterDemoWorkspace(demoBrand, next);
  }, [demoBrand, next]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8 ob-safe-top ob-safe-bottom sm:py-12">
      <div className="ob-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ob-text-muted)]">
          WebsiteIn
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">OrderBook</h1>
        <p className="mt-2 text-sm text-[var(--ob-text-secondary)]">
          Sign in with your business ID and password.
        </p>

        <form action={action} className="mt-8 space-y-4">
          <div>
            <label htmlFor="brandCode" className="text-sm font-medium">
              Business ID
            </label>
            <Input
              id="brandCode"
              name="brandCode"
              placeholder="e.g. BR-1 or BR-2"
              autoComplete="organization"
              className="mt-1"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative mt-1">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ob-text-muted)]"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {state && !state.ok ? (
            <p className="text-sm text-[var(--ob-danger)]" role="alert">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" loading={pending}>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
          Explore without signing in
        </p>
        {/* Real forms, not onClick handlers: the demo entry has to work the
            moment this HTML is on screen, before the page's JS has arrived.
            A tap on a button that only React can wire up does nothing at all,
            and over a slow connection that looks like a broken page. The bound
            arguments travel inside the action reference, so this is still the
            same `enterDemoWorkspace` server action, and `next` was validated on
            the server before it got here. */}
        <form action={enterDemoWorkspace.bind(null, "BR-1", next)} className="mt-3">
          <Button type="submit" variant="secondary" className="w-full">
            Brewery Cafe (BR-1)
          </Button>
        </form>
        <form action={enterDemoWorkspace.bind(null, "BR-2", next)} className="mt-2">
          <Button type="submit" variant="secondary" className="w-full">
            Cubig Furniture (BR-2)
          </Button>
        </form>
        <p className="mt-2 text-center text-xs text-[var(--ob-text-muted)]">
          Full workspace with sample products, quotes, bills, and analytics.
        </p>
      </div>
      <p className="mt-6 text-center text-xs text-[var(--ob-text-muted)]">
        OrderBook by WebsiteIn — multi-business order management
      </p>
    </div>
  );
}
