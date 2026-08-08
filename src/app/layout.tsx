import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_LONG_NAME, APP_NAME } from "@/lib/settings";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: `${APP_LONG_NAME} — a private family record.`,
  // Belt and braces alongside the X-Robots-Tag header in next.config.ts.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  applicationName: APP_NAME,
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never lock zoom. Some of our readers will pinch every page.
  maximumScale: 5,
  themeColor: "#2a3556",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:shadow-lg"
        >
          Skip to the main content
        </a>
        {children}
      </body>
    </html>
  );
}
