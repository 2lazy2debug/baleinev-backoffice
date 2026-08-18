import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

// The version shown in the sidebar. Releases are cut from annotated git tags and
// the box deploys by checking one out detached (see docs/production.md), so the
// closest tag *is* what is running. package.json is the fallback for a build
// with no git available.
function resolveVersion() {
  try {
    return execSync("git describe --tags --abbrev=0", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .replace(/^v/, "");
  } catch {
    try {
      return JSON.parse(readFileSync("./package.json", "utf8")).version;
    } catch {
      return "0.0.0";
    }
  }
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: resolveVersion() },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
