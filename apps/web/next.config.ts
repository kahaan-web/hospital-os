import type { NextConfig } from 'next';

// HOS_API_ORIGIN (web-polish) and API_ORIGIN (e2e) are both accepted; default is the standard API port 4400.
const apiOrigin = (process.env.HOS_API_ORIGIN ?? process.env.API_ORIGIN ?? 'http://127.0.0.1:4400').replace(/\/$/, '');

const nextConfig: NextConfig = {
  // Demo runs behind a Cloudflare quick tunnel / Tailscale; never show the Next dev badge.
  devIndicators: false,
  // Lets next dev serve HMR and client chunks to the tunnel host (otherwise the client never hydrates).
  allowedDevOrigins: ['*.trycloudflare.com', '*.ts.net', 'localhost', '127.0.0.1'],
  // Separate build output so a production build can be made while a dev server is running.
  distDir: process.env.HOS_NEXT_DIST_DIR || '.next',
  transpilePackages: ['@hos/ui', '@hos/shared'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
