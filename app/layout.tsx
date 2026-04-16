import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope"
});

export const metadata: Metadata = {
  title: "Golf Quota Tracker",
  description: "Mobile-first golf quota scoring web app"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={manrope.className}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
