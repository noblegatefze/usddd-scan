import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "USDDD Scan — Protocol Transparency",
  description:
    "USDDD Scan provides live, protocol-defined transparency into network activity, value flow, and efficiency for DIGDUG.DO.",

  openGraph: {
    title: "USDDD Scan — Protocol Transparency",
    description:
      "Live, protocol-defined transparency into network activity, value flow, and efficiency.",
    url: "https://usddd.digdug.do",
    siteName: "USDDD Scan",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "USDDD Scan — Protocol Transparency",
    description:
      "Live, protocol-defined transparency into the DIGDUG.DO network.",
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
      </body>
    </html>
  );
}
