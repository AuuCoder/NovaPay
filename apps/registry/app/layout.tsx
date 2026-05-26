import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { getCurrentLocale } from "@/lib/i18n-server";
import { LanguageSwitcherPresence } from "./language-switcher-presence";
import { FeedbackCenter } from "./feedback-center";

export const metadata: Metadata = {
  title: "NovaPay Plugin",
  description:
    "Independently deployed plugin control plane for NovaPay.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getCurrentLocale();

  return (
    <html lang={locale === "en" ? "en" : "zh-CN"} suppressHydrationWarning>
      <body>
        {children}
        <FeedbackCenter locale={locale === "en" ? "en" : "zh"} />
        <LanguageSwitcherPresence locale={locale} />
      </body>
    </html>
  );
}
