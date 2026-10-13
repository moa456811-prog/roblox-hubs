const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return {
      // Resolve the local V2 catch-all before forwarding legacy API paths.
      fallback: [
        { source: "/api/:path*", destination: "https://scriptrush-api.vercel.app/api/:path*" }
      ]
    };
  }
};

export default nextConfig;
