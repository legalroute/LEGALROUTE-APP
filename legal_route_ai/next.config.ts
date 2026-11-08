import type { NextConfig } from "next";

// Public tunnel hostnames (ngrok) allowed to reach the dev server and submit Server Actions.
const tunnelHosts = ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev"];

const nextConfig: NextConfig = {
  transpilePackages: ["@legalroute/backend", "@legalroute/agents"],
  allowedDevOrigins: tunnelHosts,
  experimental: {
    serverActions: {
      allowedOrigins: tunnelHosts,
    },
  },
};

export default nextConfig;
