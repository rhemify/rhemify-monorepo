#!/usr/bin/env node
/**
 * Post-build script for Vercel deployment.
 *
 * Vite outputs to apps/web/dist/{client,server}.
 * Vercel's remote build server only runs the buildCommand — no post-processing.
 * This script replicates what `vercel build` does locally:
 *   1. Copy static assets  → .vercel/output/static/
 *   2. Bundle SSR server   → .vercel/output/functions/index.func/
 *   3. Write routing rules → .vercel/output/config.json
 */

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const serverDist = resolve(root, "apps/web/dist/server");
const clientDist = resolve(root, "apps/web/dist/client");
const outRoot = resolve(root, ".vercel/output");
const funcDir = resolve(outRoot, "functions/index.func");
const staticDir = resolve(outRoot, "static");

// Clean previous output
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(funcDir, { recursive: true });
mkdirSync(staticDir, { recursive: true });

// 1. Static files
console.log("Copying static assets…");
cpSync(clientDist, staticDir, { recursive: true });

// 2. Bundle the SSR server entry to a self-contained CJS file.
//    Vite resolves TanStack's virtual modules at build time, so we mark the
//    raw virtual module identifiers as external — they're never called at runtime.
console.log("Bundling SSR server…");
// Use the esbuild JS API so we don't rely on a specific binary path.
const req = createRequire(import.meta.url);
const esbuild = req("esbuild");

const virtualExternals = [
  "#tanstack-router-entry",
  "#tanstack-start-entry",
  "#tanstack-start-plugin-adapters",
  "tanstack-start-manifest:v",
  "tanstack-start-injected-head-scripts:v",
];

await esbuild.build({
  entryPoints: [resolve(serverDist, "server.js")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: virtualExternals,
  outfile: resolve(funcDir, "server.bundle.cjs"),
  logLevel: "error",
});

// 3. Handler adapter — wraps the H3 fetch interface for the Vercel Node runtime.
writeFileSync(
  resolve(funcDir, "handler.js"),
  `import { createRequire } from "module";
import { toNodeHandler } from "srvx/node";
const require = createRequire(import.meta.url);
const serverModule = require("./server.bundle.cjs");
const server = serverModule.default ?? serverModule;
export default toNodeHandler(server.fetch);
`
);

// 4. Bundle handler (ESM with srvx) to the final index.js
await esbuild.build({
  entryPoints: [resolve(funcDir, "handler.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: resolve(funcDir, "index.js"),
  logLevel: "error",
});

// 5. Vercel function config
writeFileSync(
  resolve(funcDir, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs20.x",
    handler: "index.js",
    launcherType: "Nodejs",
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
  })
);

// 6. Routing: static assets with long cache, then filesystem, then SSR catch-all
writeFileSync(
  resolve(outRoot, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [
      {
        src: "/assets/(.*)",
        headers: { "cache-control": "public, max-age=31536000, immutable" },
        continue: true,
      },
      { handle: "filesystem" },
      { src: "/(.*)", dest: "/index" },
    ],
  })
);

console.log("✓ .vercel/output ready");
