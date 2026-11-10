"use client";

import { useActionState } from "react";
import { loginWithBrandCode, type LoginState } from "@/lib/auth/actions";
import { enterDemoWorkspace } from "@/lib/auth/demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { LogoMark } from "@/components/brand/logo-mark";
import { Meteors } from "@/components/effects/meteors";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState<LoginState | null, FormData>(
    loginWithBrandCode,
    null,
  );
  const [demoPending, setDemoPending] = useState<DemoBrandCode | null>(null);

  async function onExploreDemo(brandCode: DemoBrandCode) {
    setDemoPending(brandCode);
    await enterDemoWorkspace(brandCode);
  }

  return (
    <div className="ob-workspace relative min-h-[100dvh] overflow-hidden">
      <Meteors count={10} seed={11} />
      <div className="relative z-[1] mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8 ob-safe-top ob-safe-bottom sm:py-12">
      <div className="ob-card p-6 sm:p-8">
        <LogoMark size={52} spin />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ob-text-muted)]">
          WebsiteIn
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">OrderBook</h1>
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
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          loading={demoPending === "BR-1"}
          onClick={() => onExploreDemo("BR-1")}
        >
          Brewery Cafe (BR-1)
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="mt-2 w-full"
          loading={demoPending === "BR-2"}
          onClick={() => onExploreDemo("BR-2")}
        >
          Cubig Furniture (BR-2)
        </Button>
        <p className="mt-2 text-center text-xs text-[var(--ob-text-muted)]">
          Full workspace with sample products, quotes, bills, and analytics.
        </p>
      </div>
      <p className="mt-6 text-center text-xs text-[var(--ob-text-muted)]">
        OrderBook by WebsiteIn — multi-business order management
      </p>
      </div>
    </div>
  );
}
