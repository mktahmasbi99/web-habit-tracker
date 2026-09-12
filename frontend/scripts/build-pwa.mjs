/* global console */
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateSW } from "workbox-build";

const outputDirectory = resolve("dist");
const requiredFiles = [
  "index.html",
  "manifest.webmanifest",
  "apple-touch-icon.png",
  "pwa-192x192.png",
  "pwa-512x512.png",
  "pwa-maskable-512x512.png",
];

await Promise.all(requiredFiles.map(file => access(resolve(outputDirectory, file))));
const manifest = JSON.parse(await readFile(resolve(outputDirectory, "manifest.webmanifest"), "utf8"));
if (manifest.id !== "/" || manifest.start_url !== "/" || manifest.scope !== "/" || manifest.display !== "standalone") {
  throw new Error("PWA manifest must retain the root identity, scope, start URL, and standalone display mode.");
}

const { count, size, warnings } = await generateSW({
  globDirectory: outputDirectory,
  globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
  swDest: resolve(outputDirectory, "sw.js"),
  cleanupOutdatedCaches: true,
  clientsClaim: false,
  skipWaiting: false,
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [],
  sourcemap: false,
});
if (warnings.length) throw new Error(warnings.join("\n"));
console.log(`PWA service worker precaches ${count} static files (${size} bytes); API responses remain network-only.`);
