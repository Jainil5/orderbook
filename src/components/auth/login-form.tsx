"use client";

import { useActionState } from "react";
import { loginWithBrandCode, type LoginState } from "@/lib/auth/actions";
import { enterDemoWorkspace } from "@/lib/auth/demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState<LoginState | null, FormData>(
    loginWithBrandCode,
    null,
  );
  const [demoPending, setDemoPending] = useState(false);

  async function onExploreDemo() {
    setDemoPending(true);
    await enterDemoWorkspace();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="ob-card p-8">
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
              placeholder="e.g. BR-1"
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

        <Button
          type="button"
          variant="secondary"
          className="mt-4 w-full"
          loading={demoPending}
          onClick={onExploreDemo}
        >
          Explore Demo Brand
        </Button>
        <p className="mt-2 text-center text-xs text-[var(--ob-text-muted)]">
          Opens Brewery Cafe (BR-1) in the full workspace — same app as sign-in.
        </p>
      </div>
      <p className="mt-6 text-center text-xs text-[var(--ob-text-muted)]">
        OrderBook by WebsiteIn — multi-business order management
      </p>
    </div>
  );
}
