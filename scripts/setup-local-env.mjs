#!/usr/bin/env node
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const example = resolve(root, ".env.example");
const local = resolve(root, ".env.local");

if (existsSync(local)) {
  console.log(".env.local already exists — edit it with your Supabase keys.");
  process.exit(0);
}

copyFileSync(example, local);
console.log("Created .env.local from .env.example");
console.log("Edit .env.local with your publishable key and BRAND_AUTH_EMAIL_MAP, then run npm run dev");
