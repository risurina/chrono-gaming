import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Single source of truth for the app version is package.json (tauri.conf.json
// points its `version` here too). Injected as VITE_APP_VERSION so the UI
// (CLIENT_CONFIG.VERSION → FooterStatusBar) always shows the shipped version.
const appVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
  .version as string;

// Prod builds need sourcemaps for Sentry to symbolicate webview stack traces,
// but must NOT ship them to disk (they'd expose original source). Emit them
// only when a Sentry auth token is present (an ops-provided CI secret, like
// SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT below), upload+delete via the
// Sentry Vite plugin, and otherwise build with no sourcemaps at all — the
// previous behavior (`sourcemap: !!TAURI_ENV_DEBUG`) already didn't ship maps
// in prod, it just meant prod crashes were never symbolicated anywhere.
const sentryUploadEnabled =
  !!process.env.SENTRY_AUTH_TOKEN && !!process.env.SENTRY_ORG && !!process.env.SENTRY_PROJECT;

// Tauri-recommended Vite settings: fixed port, keep Rust compiler output visible,
// expose TAURI_ env vars to the frontend build.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(sentryUploadEnabled
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: {
              filesToDeleteAfterUpload: ["dist/**/*.map"],
            },
          }),
        ]
      : []),
  ],
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  // `@risurina/oikos/ui` is a Next.js library and pulls in `next/link`, whose
  // client code references `process.env`. The webview has no Node `process`, so
  // without this shim the bundle throws `process is not defined` → blank screen.
  define: {
    "process.env": {},
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    target: "chrome110",
    // Hidden sourcemaps: generated for the upload step above, but not
    // referenced by a `//# sourceMappingURL=` comment in the shipped JS, so
    // they're never fetchable from the running app even if upload+delete
    // somehow left one behind.
    sourcemap: process.env.TAURI_ENV_DEBUG ? true : sentryUploadEnabled ? "hidden" : false,
  },
});
