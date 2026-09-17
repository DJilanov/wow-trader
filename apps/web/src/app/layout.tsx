import type { Metadata } from "next";
import Link from "next/link";
import { Cinzel, Inter, JetBrains_Mono } from "next/font/google";

import { SiteHeader } from "../components/site-header";
import { JsonLd } from "../components/json-ld";
import { HELPER_SHARE_IMAGE, HELPER_SITE_URL } from "../lib/seo";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(HELPER_SITE_URL),
  applicationName: "KFC Helper",
  title: {
    default: "KFC Helper | WoW Forever & TBC Database Tools",
    template: "%s · KFC Helper",
  },
  description:
    "Build-aware WoW Forever and TBC item databases, profession recipes, crafting calculators, Auction House intelligence, and explainable gold-making tools.",
  keywords: [
    "WoW Forever database",
    "WoW Forever professions",
    "WoW Forever Auction House",
    "TBC item database",
    "TBC profession recipes",
    "WoW crafting calculator",
    "WoW gold making tools",
    "KFC Helper",
  ],
  authors: [{ name: "KFC Guild", url: "https://kfcguild.online" }],
  creator: "KFC Guild",
  publisher: "KFC Guild",
  category: "Gaming",
  classification: "World of Warcraft game database and Auction House tools",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  icons: {
    icon: { url: "/kfc-icon.svg", type: "image/svg+xml" },
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: { canonical: `${HELPER_SITE_URL}/` },
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: `${HELPER_SITE_URL}/`,
    siteName: "KFC Helper",
    title: "KFC Helper — WoW Forever & TBC Trader and Encyclopedia",
    description:
      "Search audited game data and compare crafting, Auction House, disenchant, and vendor routes with explainable calculations.",
    images: [
      {
        url: HELPER_SHARE_IMAGE,
        width: 1200,
        height: 630,
        alt: "KFC Helper — WoW Forever and TBC Trader and Encyclopedia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "KFC Helper — WoW Forever & TBC Tools",
    description:
      "Build-aware items, recipes, professions, crafting routes, and Auction House intelligence.",
    images: [HELPER_SHARE_IMAGE],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${HELPER_SITE_URL}/#website`,
      url: `${HELPER_SITE_URL}/`,
      name: "KFC Helper",
      alternateName: "KFC Guild Helper",
      description:
        "Build-aware World of Warcraft databases, profession archives, crafting calculations, and Auction House intelligence.",
      publisher: { "@id": "https://kfcguild.online/#organization" },
    },
    {
      "@type": "WebApplication",
      "@id": `${HELPER_SITE_URL}/#application`,
      name: "KFC Helper",
      url: `${HELPER_SITE_URL}/`,
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      isAccessibleForFree: true,
      description:
        "A World of Warcraft Trader and Encyclopedia for WoW Forever and The Burning Crusade.",
      about: [
        { "@type": "VideoGame", name: "World of Warcraft: Forever" },
        { "@type": "VideoGame", name: "World of Warcraft: The Burning Crusade Classic" },
      ],
      provider: { "@id": "https://kfcguild.online/#organization" },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html
      className={`${cinzel.variable} ${inter.variable} ${jetBrainsMono.variable}`}
      data-scroll-behavior="smooth"
      lang="en"
    >
      <body>
        <JsonLd data={structuredData} />
        <SiteHeader />
        <div className="page-frame">
          <main>{children}</main>
        </div>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <span>© 2026 KFC Guild · Helper</span>
            <span>Build-aware Azeroth data · Spineshatter EU</span>
            <Link href="https://kfcguild.online">Return to KFC Guild</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
