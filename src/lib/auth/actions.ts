"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearDemoWorkspaceCookie } from "@/lib/auth/demo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  consumeRateLimit,
  rateLimitKeyFromHeaders,
} from "@/lib/security/rate-limit";
import { isValidBrandCode } from "@/lib/security/input";
import type { Brand, BrandMember, BrandSettings } from "@/types/database";

export type LoginState =
  | { ok: true }
  | { ok: false; error: string };

function resolveAuthEmailFromBrandCode(brandCode: string): string | null {
  if (!isValidBrandCode(brandCode)) return null;
  const normalized = brandCode.trim().toUpperCase();
  const raw = process.env.BRAND_AUTH_EMAIL_MAP;
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    const email = map[normalized];
    if (!email || typeof email !== "string") return null;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export async function loginWithBrandCode(
  _prev: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const brandCode = String(formData.get("brandCode") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!brandCode || !password) {
    return { ok: false, error: "Enter your business ID and password." };
  }

  if (password.length > 256) {
    return { ok: false, error: "Invalid business ID or password. Please try again." };
  }

  const headerList = await headers();
  const rateKey = `login:${rateLimitKeyFromHeaders(headerList)}`;
  const limited = consumeRateLimit(rateKey);
  if (!limited.allowed) {
    return {
      ok: false,
      error: `Too many sign-in attempts. Try again in ${limited.retryAfterSec} seconds.`,
    };
  }

  if (!isValidBrandCode(brandCode)) {
    return {
      ok: false,
      error: "Invalid business ID or password. Please try again.",
    };
  }

  const email = resolveAuthEmailFromBrandCode(brandCode);
  if (!email) {
    if (process.env.NODE_ENV === "development") {
      return {
        ok: false,
        error:
          "Sign-in mapping is not configured. Set BRAND_AUTH_EMAIL_MAP in .env.local. See docs/DATABASE_CONTRACT.md.",
      };
    }
    return {
      ok: false,
      error: "Invalid business ID or password. Please try again.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      ok: false,
      error: "Invalid business ID or password. Please try again.",
    };
  }

  const membership = await loadActiveMembership(supabase);
  if (!membership) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "Your account is not linked to an active business membership.",
    };
  }

  await clearDemoWorkspaceCookie();
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  await clearDemoWorkspaceCookie();
  redirect("/login");
}

export async function loadActiveMembership(supabase: Awaited<
  ReturnType<typeof createSupabaseServerClient>
>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: members, error } = await supabase
    .from("brand_members")
    .select("id, brand_id, user_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  if (error || !members?.length) return null;
  return members[0] as BrandMember;
}

export async function loadLiveWorkspace() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const member = await loadActiveMembership(supabase);
  if (!member) return null;

  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("id, code, name, created_at")
    .eq("id", member.brand_id)
    .single();

  if (brandError || !brand) return null;

  const { data: settings } = await supabase
    .from("brand_settings")
    .select(
      "brand_id, currency_code, tax_rate_percent, receipt_header, receipt_footer, contact_email, contact_phone",
    )
    .eq("brand_id", member.brand_id)
    .maybeSingle();

  return {
    userEmail: user.email,
    member,
    brand: brand as Brand,
    settings: (settings ?? {
      brand_id: member.brand_id,
      currency_code: "INR",
    }) as BrandSettings,
  };
}
