import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // npm run tunnel serves the dev app through a random https://*.trycloudflare.com host (PayPal webhooks + button).
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Next 16's dev MCP server (not used here) appends every request to .next/dev/logs/next-development.log;
  // turned off to cut constant file writes in dev (they were the only file changes seen during page loads).
  experimental: { mcpServer: false },
  // Render's free build ran out of memory in next build's type check (2026-11-11). The hosted build sets
  // SKIP_BUILD_TYPECHECK=1; type safety is enforced by `npm run typecheck` before every push instead.
  typescript: { ignoreBuildErrors: process.env.SKIP_BUILD_TYPECHECK === "1" },
  // Server-only packages with native binaries or dynamic requires: load them from node_modules, don't bundle.
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "@huggingface/transformers", "onnxruntime-node", "sharp", "playwright-core", "@elastic/elasticsearch", "@onkernel/sdk", "@renderinc/sdk"],
};

export default nextConfig;
