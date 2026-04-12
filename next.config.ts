import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow cross-origin dev requests from LAN/Tailscale devices (phones, other Macs).
  // Next 16 blocks _next/* dev resources by default if the request origin doesn't
  // match the server's bound hostname. In dev we bind to 0.0.0.0 and want to
  // reach the server from phones/iPads on the same network, so explicitly
  // allowlist common private ranges and Tailscale.
  //
  // Patterns are hostname-glob style (see node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/allowedDevOrigins.md).
  // If your phone's LAN IP isn't covered below, add it here and restart dev.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    // Private LAN ranges (common home/office subnets)
    "10.0.7.115",
    "10.0.*.*",
    "10.*.*.*",
    "192.168.*.*",
    "172.16.*.*",
    // Tailscale MagicDNS
    "*.ts.net",
  ],
};

export default nextConfig;
