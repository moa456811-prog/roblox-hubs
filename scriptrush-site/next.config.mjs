const nextConfig = {
  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/api/:path*",
          destination: "https://scriptrush-api.vercel.app/api/:path*"
        }
      ],
      fallback: []
    };
  }
};

export default nextConfig;
