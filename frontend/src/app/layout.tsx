import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter 폰트 로드
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "AI 동화 이야기",
  description: "AI로 만드는 인터랙티브 동화 이야기",
  keywords: "AI, 동화, 이야기, 인터랙티브, 스토리텔링",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={inter.variable}>
      <body className="bg-gradient-to-b from-blue-50 via-blue-50 to-white min-h-screen font-sans">
        <div className="noise-bg">{children}</div>
      </body>
    </html>
  );
}
