const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return {
      afterFiles: [
        { source: "/api/:path*", destination: "https://scriptrush-api.vercel.app/api/:path*" }
      ]
    };
  }
};

export default nextConfig;
