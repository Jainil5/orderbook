"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Brand, BrandMember, BrandSettings } from "@/types/database";

export type LoginState =
  | { ok: true }
  | { ok: false; error: string };

function resolveAuthEmailFromBrandCode(brandCode: string): string | null {
  const normalized = brandCode.trim().toUpperCase();
  const raw = process.env.BRAND_AUTH_EMAIL_MAP;
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[normalized] ?? map[brandCode.trim()] ?? null;
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

  const email = resolveAuthEmailFromBrandCode(brandCode);
  if (!email) {
    return {
      ok: false,
      error:
        "Sign-in mapping is not configured yet. Set BRAND_AUTH_EMAIL_MAP on the server or add the resolve_brand_auth_email RPC. See docs/DATABASE_CONTRACT.md.",
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

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
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
