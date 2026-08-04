import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vectaix · 私人 AI 中转站",
    template: "%s · Vectaix",
  },
  description: "Vectaix 是你的专属 OpenRouter 中转站：换一个地址就能用上全部模型，对话内容不会被查看或保存。",
  icons: { icon: "/icon.svg" },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
