import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Newsreader } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/shell/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { ViewAsMode } from "@/components/view-as-mode";
import { Toaster } from "@/components/ui/sonner";
import { NotificationProvider } from "@/components/notifications/notification-provider";
import { PushNotificationPrompt } from "@/components/notifications/push-prompt";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NavigationTransition } from "@/components/navigation-transition";

// Display face for page titles only; Geist does the rest of the work.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "St. Mark Ministry Portal",
  description: "Shared portal for St. Mark Servants Prep and Sunday School ministries",
  manifest: "/manifest.json",
  icons: {
    icon: [
      {
        url: '/sunday-school-favicon-32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/sunday-school-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/sunday-school-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    shortcut: '/sunday-school-favicon-32.png',
    apple: {
      url: '/sunday-school-apple-touch-icon-v2.png',
      sizes: '180x180',
      type: 'image/png',
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "St. Mark Portal",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F3F0" },
    { media: "(prefers-color-scheme: dark)", color: "#131211" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${newsreader.variable} flex min-h-dvh flex-col bg-canvas antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          <NavigationTransition />
          {/* App chrome; `contents` preserves the flex layout while print:hidden keeps it off printouts. */}
          <div className="contents print:hidden">
            <NotificationProvider />
            <ViewAsMode />
            <CommandPalette />
          </div>
          <div id="app-content" className="w-full min-w-0 flex-1 bg-canvas">
            <AppShell>{children}</AppShell>
          </div>
          <div className="contents print:hidden">
            <PushNotificationPrompt />
            <Toaster />
          </div>
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}
