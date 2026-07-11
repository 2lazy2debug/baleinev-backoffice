#!/usr/bin/env node
/**
 * Design-token guard (see CLAUDE.md → "Design system rules").
 *
 * Fails the build if a component reintroduces the drift that issue U8 fixed:
 *   - hardcoded hex colors (colors must come from the --page/--panel/... tokens)
 *   - arbitrary radii like `rounded-[28px]` (radius must come from the rounded-* scale)
 *   - raw `var(--space-…)` / `var(--radius-…)` in markup (spacing = Tailwind utilities,
 *     radius = the rounded-* utilities; neither is referenced as a bare CSS var here)
 *
 * Scope is the app UI: markup under app/ and components/, plus the shared button
 * styles. globals.css is the single source of truth and is exempt; the print/QR
 * generators in lib/ (document-templates, swiss-qr-image) legitimately use literal
 * hex for PDF and bitmap output and are out of scope.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_TARGETS = ["app", "components", "lib/button-classes.ts"];
const EXT = /\.(tsx?|jsx?)$/;
const EXEMPT = /globals\.css$/;

const RULES = [
  {
    id: "hardcoded-hex",
    re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
    msg: "hardcoded hex color — use a color token, e.g. text-[var(--ink)]",
  },
  {
    id: "arbitrary-radius",
    re: /rounded-\[[^\]]+\]/g,
    msg: "arbitrary radius — use the rounded-* scale (rounded-md / rounded-2xl / …)",
  },
  {
    id: "raw-space-var",
    re: /var\(--space-[^)]*\)/g,
    msg: "raw var(--space-…) — spacing comes from Tailwind utilities (p-*, gap-*)",
  },
  {
    id: "raw-radius-var",
    re: /var\(--radius-[^)]*\)/g,
    msg: "raw var(--radius-…) — radius comes from the rounded-* utilities",
  },
];

/** @returns {string[]} absolute file paths to scan under a directory */
function collect(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      out = out.concat(collect(full));
    } else if (EXT.test(entry) && !EXEMPT.test(full)) {
      out.push(full);
    }
  }
  return out;
}

/** @returns {string[]} absolute file paths for a target that is a dir or a file */
function resolveTarget(target) {
  const full = join(appRoot, target);
  let stats;
  try {
    stats = statSync(full);
  } catch {
    return [];
  }
  return stats.isDirectory() ? collect(full) : [full];
}

const files = SCAN_TARGETS.flatMap(resolveTarget);
const violations = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      const match = rule.re.exec(line);
      if (match) {
        violations.push({
          file: relative(appRoot, file),
          line: i + 1,
          token: match[0],
          msg: rule.msg,
        });
      }
    }
  });
}

if (violations.length === 0) {
  console.log(`✓ design tokens clean (${files.length} files scanned)`);
  process.exit(0);
}

console.error(`✗ ${violations.length} design-token violation(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.token}\n     ${v.msg}`);
}
console.error("\nSee CLAUDE.md → Design system rules.");
process.exit(1);
