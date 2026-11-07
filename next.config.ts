import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages with native binaries or dynamic requires: load them from node_modules, don't bundle.
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "@huggingface/transformers", "onnxruntime-node", "sharp", "playwright-core", "@elastic/elasticsearch", "@onkernel/sdk", "@renderinc/sdk"],
};

export default nextConfig;
