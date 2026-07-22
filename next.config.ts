import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin", "pdfkit"],
  outputFileTracingIncludes: {
    "app/api/store/[slug]/orders/[orderId]/invoice/route": ["./node_modules/pdfkit/js/data/**"],
  },
  /* config options here */
};

export default nextConfig;
