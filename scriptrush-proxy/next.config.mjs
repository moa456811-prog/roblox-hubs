const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/_next/:path*', destination: 'https://scriptrush-api.vercel.app/_next/:path*' },
        { source: '/api/:path*', destination: 'https://scriptrush-api.vercel.app/api/:path*' },
        { source: '/favicon.ico', destination: 'https://scriptrush-api.vercel.app/favicon.ico' }
      ]
    };
  }
};

export default nextConfig;
