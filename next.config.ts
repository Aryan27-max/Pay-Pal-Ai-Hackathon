import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg + Prisma adapter run on the server only
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
