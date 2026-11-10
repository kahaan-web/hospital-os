import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@hos/ui', '@hos/shared'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://127.0.0.1:4400/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
