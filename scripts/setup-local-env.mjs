#!/usr/bin/env node
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const example = resolve(root, ".env.example");
const local = resolve(root, ".env.local");

if (existsSync(local)) {
  console.log(".env.local already exists — leave it empty to keep running on data/*.csv.");
  process.exit(0);
}

copyFileSync(example, local);
console.log("Created .env.local from .env.example");
console.log(
  [
    "Nothing else is needed for the demo: the app reads and writes data/*.csv.",
    "Add Supabase keys and set OB_USE_SUPABASE=true only when you want live data.",
  ].join("\n"),
);
