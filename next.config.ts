import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  compress: false,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/login", headers: securityHeaders },
      { source: "/dashboard/:path*", headers: securityHeaders },
      { source: "/keys/:path*", headers: securityHeaders },
      { source: "/settings/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
