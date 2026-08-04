import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vectaix · OpenRouter 私有代理",
    template: "%s · Vectaix",
  },
  description: "Vectaix 新加坡 OpenRouter 私有代理控制台",
  icons: { icon: "/icon.svg" },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#06110f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
