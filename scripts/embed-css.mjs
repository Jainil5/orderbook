/*
 * Ports OrderBook's design system into one stylesheet that a Tailwind v3 host
 * can load untouched.
 *
 * The host cannot run Tailwind v4, so the v4-only parts of globals.css have to
 * be translated rather than copied:
 *   - every selector is scoped under `.obd`, so nothing reaches the host page
 *     and the token set does not have to share `:root` with it;
 *   - `@theme`, `@custom-variant` and `@import` are v4 at-rules the host's
 *     PostCSS cannot parse, so they become plain declarations or disappear;
 *   - the utilities those at-rules used to generate (`rounded-md`,
 *     `font-display`) do not exist in v3, so they are re-declared by hand in
 *     the shim below — edit SHIMS if the source @theme blocks ever grow.
 *
 * Usage: node scripts/embed-css.mjs [outputFile]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const SCOPE = ".obd";
const SOURCE = "src/app/globals.css";
const OUTPUT =
  process.argv[2] ?? "D:/development/ecosites/app/(sites)/orderbook-demo/demo.css";

const lines = readFileSync(resolve(SOURCE), "utf8").replace(/\r\n/g, "\n").split("\n");

const opens = (line) => (line.match(/{/g) ?? []).length;
const closes = (line) => (line.match(/}/g) ?? []).length;

/* Split on commas that sit outside (), [] and comments. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      current += text.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/* `:root`, `html` and `body` all describe "the page", which inside the host is
   the wrapper: the demo cannot restyle the host's own root. */
function mapSelector(selector) {
  const s = selector.trim();
  if (s === ":root" || s === "html" || s === "body") return SCOPE;
  if (s.startsWith("[data-theme=")) return SCOPE + s;
  return `${SCOPE} ${s}`;
}

function prefixSelectorLine(line) {
  const open = line.lastIndexOf("{");
  const hasBlock = open !== -1;
  const head = hasBlock ? line.slice(0, open) : line;
  const tail = hasBlock ? line.slice(open + 1) : "";
  if (!head.trim()) return line;
  const indent = head.slice(0, head.search(/\S/));
  const mapped = splitTopLevel(head.slice(indent.length))
    .map((part) => (part.trim() ? mapSelector(part) : part))
    .join(",");
  return `${indent}${mapped}${hasBlock ? " {" : ""}${tail}`;
}

const isSelectorLine = (trimmed) =>
  trimmed !== "" &&
  !trimmed.startsWith("/*") &&
  !trimmed.startsWith("@") &&
  !trimmed.startsWith("}") &&
  (trimmed.endsWith(",") || trimmed.endsWith("{")) &&
  !trimmed.endsWith("*/") &&
  !trimmed.endsWith(";") &&
  !trimmed.endsWith(":");

const out = [];
const kinds = []; // kind of every block that is currently open
let dropAbove = Infinity; // depth from which lines are discarded
let inComment = false;

for (const line of lines) {
  const trimmed = line.trim();
  const depth = kinds.length;
  const commentOpens = (line.match(/\/\*/g) ?? []).length;
  const commentCloses = (line.match(/\*\//g) ?? []).length;

  /* Comments pass through untouched — they carry the design rationale, and a
     line inside one is neither a selector nor a brace. */
  if (depth >= dropAbove) {
    if (trimmed === "}" && depth === dropAbove) {
      dropAbove = Infinity;
      kinds.pop();
    } else {
      for (let i = 0; i < opens(line) - closes(line); i += 1) {
        kinds.push("dropped");
      }
    }
    continue;
  }

  if (inComment) {
    out.push(line);
    if (commentCloses > 0) inComment = commentOpens > commentCloses;
    continue;
  }
  if (commentOpens > commentCloses) {
    out.push(line);
    inComment = true;
    continue;
  }

  /* Statements the host's PostCSS cannot parse. */
  if (/^@(import|custom-variant|config|plugin|source)\b/.test(trimmed)) continue;

  if (opens(line) === 0 && closes(line) > 0) {
    for (let i = 0; i < closes(line); i += 1) {
      const kind = kinds.pop();
      if (kind === "layer" || kind === "dropped") continue;
      out.push(i === closes(line) - 1 ? line : "}");
    }
    continue;
  }

  if (/^@layer\b/.test(trimmed)) {
    kinds.push("layer");
    out.push("/* ── component roles (unwrapped from @layer components) ── */");
    continue;
  }

  if (/^@theme\b/.test(trimmed)) {
    if (/inline/.test(trimmed)) {
      kinds.push("dropped");
      dropAbove = kinds.length;
      continue;
    }
    kinds.push("theme");
    out.push(`${SCOPE} {`);
    continue;
  }

  if (/^@keyframes\b/.test(trimmed)) {
    kinds.push("keyframes");
    out.push(line.replace(/@keyframes\s+ob-/, "@keyframes obd-"));
    continue;
  }

  if (/^@(media|supports)\b/.test(trimmed)) {
    kinds.push("media");
    out.push(line);
    continue;
  }

  /* Only @media / @layer / the top level can hold a rule; anywhere else a
     line ending in a comma is a wrapped declaration value — `background:`
     gradient lists look exactly like selector lists. */
  const canHoldRules =
    depth === 0 || kinds[depth - 1] === "media" || kinds[depth - 1] === "layer";
  if (canHoldRules && isSelectorLine(trimmed)) {
    out.push(prefixSelectorLine(line));
  } else {
    const as = trimmed.match(/^animation(-name)?\s*:/);
    out.push(as ? line.replace(/\bob-([a-z0-9-]+)/g, "obd-$1") : line);
  }

  for (let i = 0; i < opens(line) - closes(line); i += 1) kinds.push("rule");
}

const SHIMS = `
/* ── Host compatibility ───────────────────────────────────────────────────
   Everything below is a v4 → v3 gap, not a design decision.

   v4 generates \`rounded-*\` from the \`--radius-*\` scale, so v3's
   \`rounded-md\` = 6px would silently replace OrderBook's 16px. These win on
   specificity over the host's own \`.rounded-md\`. \`font-*\` exist here
   because \`@theme inline\` used to mint them; they are written per-class
   rather than as a \`--font-display\` override so the host keeps its own
   display face everywhere else. */

${SCOPE} .rounded-sm { border-radius: var(--radius-sm); }
${SCOPE} .rounded-md { border-radius: var(--radius-md); }
${SCOPE} .rounded-lg { border-radius: var(--radius-lg); }
${SCOPE} .rounded-xl { border-radius: var(--radius-xl); }
${SCOPE} .rounded-2xl { border-radius: var(--radius-2xl); }
${SCOPE} .rounded-3xl { border-radius: var(--radius-3xl); }

${SCOPE} .font-display {
  font-family: var(--font-poster), var(--font-instrument), ui-sans-serif,
    sans-serif;
}
${SCOPE} .font-sans {
  font-family: var(--font-instrument), ui-sans-serif, system-ui, sans-serif;
}
${SCOPE} .font-mono {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

/* OrderBook names its display face \`--font-bricolage\` and the host ships the
   same woff2 under \`--font-poster\`. Instrument Sans is already shared. */
${SCOPE} {
  --font-bricolage: var(--font-poster);
}

/* \`body{overflow-x:hidden}\` now lands on the wrapper, and \`hidden\` makes it
   a scroll container — which is what would kill the sticky header and the
   drawer. \`clip\` stops sideways overflow without creating a scroll port. */
${SCOPE} {
  overflow-x: clip;
}
`;

const banner = `/*
 * Generated by scripts/embed-css.mjs from
 * ${relative(dirname(resolve(OUTPUT)), resolve(SOURCE)).replace(/\\/g, "/")}
 * Do not edit here — change that stylesheet or the generator, then run:
 *   node scripts/embed-css.mjs "${OUTPUT}"
 */
`;

const css = `${banner}${out.join("\n").replace(/\n{3,}/g, "\n\n")}\n${SHIMS}`;

mkdirSync(dirname(resolve(OUTPUT)), { recursive: true });
writeFileSync(resolve(OUTPUT), css, "utf8");
console.log(`${OUTPUT}: ${lines.length} lines in -> ${css.split("\n").length} out`);
