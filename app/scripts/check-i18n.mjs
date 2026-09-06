#!/usr/bin/env node
/**
 * i18n dictionary guard (companion to check-design.mjs).
 *
 * `lib/i18n-dictionaries.ts` carries a `const` with one subtree per locale
 * (`en`, `fr`). Every key must exist, with the same shape, in every locale —
 * and nothing else enforces that: a missing key reads as `undefined` and
 * renders blank, no error. The cash-manager plan chain leans on a manual
 * "compare the `pos` block of `en` with `fr`" step for exactly this.
 *
 * Fails the build when:
 *   - a key path is present in one locale and absent from another
 *   - a key path is an object in one locale and a string in another
 *
 * With `--dead` it also lists (without failing) leaf keys whose name appears
 * *nowhere* in app/ · components/ · lib/ — the usual sign of a key left behind
 * when a screen moved or was deleted. It is a heuristic, off by default because
 * the repo already carries some: run it before and after a change that moves
 * keys between blocks and compare. It matches the bare identifier, so
 * destructuring (`const { foo } = copy.bar`) still counts as a use.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const { dictionaries } = await import(join(appRoot, "lib", "i18n-dictionaries.ts"));

const locales = Object.keys(dictionaries);

/** Every path in a tree as "a.b.c" → "object" | "string" | … */
function paths(node, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.set(path, "object");
      paths(value, path, out);
    } else {
      out.set(path, typeof value);
    }
  }
  return out;
}

const trees = Object.fromEntries(locales.map((locale) => [locale, paths(dictionaries[locale])]));

// --- structural parity, every locale against the first --------------------

const [base, ...rest] = locales;
const errors = [];

for (const other of rest) {
  for (const [path, type] of trees[base]) {
    if (!trees[other].has(path)) {
      errors.push(`${path} — in ${base}, missing from ${other}`);
    } else if (trees[other].get(path) !== type) {
      errors.push(`${path} — ${type} in ${base}, ${trees[other].get(path)} in ${other}`);
    }
  }
  for (const path of trees[other].keys()) {
    if (!trees[base].has(path)) {
      errors.push(`${path} — in ${other}, missing from ${base}`);
    }
  }
}

// --- dead-key heuristic (opt-in: --dead) ---------------------------------

if (process.argv.includes("--dead")) {
  const SCAN = ["app", "components", "lib"];
  const CODE = /\.(tsx?|mjs)$/;
  let blob = "";

  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (CODE.test(name) && !full.endsWith(join("lib", "i18n-dictionaries.ts"))) {
        blob += readFileSync(full, "utf8") + "\n";
      }
    }
  };
  for (const target of SCAN) walk(join(appRoot, target));

  const referenced = new Set(blob.match(/[A-Za-z_$][\w$]*/g) ?? []);
  const dead = [];
  for (const [path, type] of trees[base]) {
    if (type === "object") continue;
    if (!referenced.has(path.split(".").pop())) dead.push(path);
  }

  if (dead.length > 0) {
    console.warn(`i18n: ${dead.length} leaf key(s) whose name appears nowhere in code (possibly dead):`);
    for (const path of dead.sort()) console.warn(`  - ${path}`);
    console.warn("");
  }
}

if (errors.length > 0) {
  console.error(`i18n: ${errors.length} parity problem(s) between ${locales.join(" / ")}:`);
  for (const line of errors.sort()) console.error(`  ✗ ${line}`);
  process.exit(1);
}

const keyCount = [...trees[base].values()].filter((type) => type !== "object").length;
console.log(`✓ i18n dictionaries in step (${locales.join(" / ")}, ${keyCount} keys each)`);
