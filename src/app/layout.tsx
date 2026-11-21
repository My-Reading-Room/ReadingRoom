import type { Metadata, Viewport } from "next";
import { DM_Sans, Newsreader } from "next/font/google";
import { connection } from "next/server";

import { ServiceWorker } from "@/components/ServiceWorker";

import "./design-tokens.css";
import "./globals.css";
import "./components.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "My Reading Room", template: "%s · My Reading Room" },
  description:
    "A private, shared reading room for books, reading sessions, and custom bookshelves.",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Reading Room", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#254c38",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request. A prerendered static page would carry no
  // CSP nonce and its scripts would be blocked (src/utils/security/csp.ts).
  await connection();
  return (
    <html lang="en" className={`${dmSans.variable} ${newsreader.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
