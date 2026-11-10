import type { NextConfig } from 'next';

// HOS_API_ORIGIN (web-polish) and API_ORIGIN (e2e) are both accepted; default is the standard API port 4400.
const apiOrigin = (process.env.HOS_API_ORIGIN ?? process.env.API_ORIGIN ?? 'http://127.0.0.1:4400').replace(/\/$/, '');

const nextConfig: NextConfig = {
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
