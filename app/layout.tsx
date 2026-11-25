import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flatverse Observatory | DIGDUG.DO",
  description:
    "Explore the Flatverse Practice World, recent finds, and daily practice ranks.",

  openGraph: {
    title: "Flatverse Observatory | DIGDUG.DO",
    description:
      "Explore the Flatverse Practice World, recent finds, and daily practice ranks.",
    url: "https://usddd.digdug.do",
    siteName: "DIGDUG.DO",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Flatverse Observatory | DIGDUG.DO",
    description:
      "Explore the Flatverse Practice World, recent finds, and daily practice ranks.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
