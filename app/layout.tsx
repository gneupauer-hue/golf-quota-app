import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://custom-golf-league-demo.vercel.app"),
  title: {
    default: "Custom Golf League Demo",
    template: "%s | Custom Golf League Demo"
  },
  description: "Custom Golf League Demo keeps live golf scoring, teams, quotas, skins, and results fast on the course.",
  applicationName: "Custom Golf League Demo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Custom Golf League Demo"
  },
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#4A0F1A",
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
