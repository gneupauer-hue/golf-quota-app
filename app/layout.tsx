import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://golf-quota-app.vercel.app"),
  title: {
    default: "Irem Quota",
    template: "%s | Irem Quota"
  },
  description: "Irem Quota keeps live golf scoring, teams, quotas, skins, and results fast on the course.",
  applicationName: "Irem Quota",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Irem Quota"
  },
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#10281f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.className} bg-hero text-white`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
