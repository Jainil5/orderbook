#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const local = resolve(root, ".env.local");

if (!existsSync(local)) {
  console.error(
    "Missing .env.local — run: npm run setup:env\nThen add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and optional BRAND_AUTH_EMAIL_MAP.",
  );
  process.exit(1);
}

const text = readFileSync(local, "utf8");
const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const missing = required.filter(
  (key) => !new RegExp(`^${key}=.+`, "m").test(text),
);

if (missing.length) {
  console.error(`.env.local is missing values for: ${missing.join(", ")}`);
  process.exit(1);
}

if (/your_supabase_publishable_key/i.test(text)) {
  console.warn(
    "Warning: .env.local still uses the placeholder publishable key — Supabase calls will fail until you replace it.",
  );
}
