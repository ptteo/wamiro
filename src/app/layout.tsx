import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { themeInitScript } from "@/components/theme-toggle";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Wamiro", template: "%s · Wamiro" },
  description: "Wamiro — the operating system for modern organizations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
