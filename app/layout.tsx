import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageSwitcher } from "@/app/language-switcher";
import { RuntimeErrorGuard } from "@/app/runtime-error-guard";
import { getCurrentLocale } from "@/lib/i18n-server";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans-app",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono-app",
});

export const metadata: Metadata = {
  title: "NovaPay Gateway",
  description: "Enterprise multi-merchant payment gateway platform.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getCurrentLocale();

  return (
    <html lang={locale === "en" ? "en" : "zh-CN"}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <RuntimeErrorGuard />
        <LanguageSwitcher locale={locale} />
        {children}
      </body>
    </html>
  );
}
