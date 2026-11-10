import type { NextConfig } from 'next';

const apiOrigin = process.env.HOS_API_ORIGIN ?? 'http://127.0.0.1:4400';

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
