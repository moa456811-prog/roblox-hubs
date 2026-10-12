const nextConfig = {
  async rewrites() {
    return {
      afterFiles: [
        { source: "/api/guest-chat", destination: "https://scriptrush-api.vercel.app/api/guest-chat" },
        { source: "/api/research-game", destination: "https://scriptrush-api.vercel.app/api/research-game" },
        { source: "/api/memory", destination: "https://scriptrush-api.vercel.app/api/memory" },
        { source: "/api/diagnostic", destination: "https://scriptrush-api.vercel.app/api/diagnostic" },
        { source: "/api/health", destination: "https://scriptrush-api.vercel.app/api/health" }
      ]
    };
  }
};

export default nextConfig;
