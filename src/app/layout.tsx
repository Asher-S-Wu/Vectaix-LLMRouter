import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vectaix · AI 中转站",
    template: "%s · Vectaix",
  },
  description: "Vectaix 是一个开箱即用的 OpenRouter 中转站：注册账户、创建密钥，换一个地址就能用上全部模型，对话内容不会被查看或保存。",
  icons: { icon: "/icon.svg" },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1513" },
  ],
};

const themeInitScript = `(function(){try{var c=localStorage.getItem("vectaix-theme");var d=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
