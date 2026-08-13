import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vectaix · AI 中转站",
    template: "%s · Vectaix",
  },
  description: "通过 Vectaix 中转地址和设备密钥使用 OpenRouter 模型。",
  icons: { icon: "/icon.svg" },
  robots: {
    index: false,
    follow: false,
  },
  other: {
    google: "notranslate",
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
    <html lang="zh-CN" suppressHydrationWarning translate="no">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
