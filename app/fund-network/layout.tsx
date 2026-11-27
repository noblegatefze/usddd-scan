import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  "title": "Fund Network | DIGDUG.DO",
  "description": "View Fund positions linked to your Flatverse Passport and find withdrawal and deposit support.",
  "alternates": {
    "canonical": "https://fund.digdug.do/"
  },
  "openGraph": {
    "title": "Fund Network | DIGDUG.DO",
    "description": "View Fund positions linked to your Flatverse Passport and find withdrawal and deposit support.",
    "url": "https://fund.digdug.do/",
    "siteName": "DIGDUG.DO",
    "type": "website",
    "images": [
      {
        "url": "https://www.digdug.do/flatverse-ice-wall.jpg",
        "alt": "The Ice Wall in Flatverse"
      }
    ]
  },
  "twitter": {
    "card": "summary_large_image",
    "title": "Fund Network | DIGDUG.DO",
    "description": "View Fund positions linked to your Flatverse Passport and find withdrawal and deposit support.",
    "images": [
      {
        "url": "https://www.digdug.do/flatverse-ice-wall.jpg",
        "alt": "The Ice Wall in Flatverse"
      }
    ]
  }
};

export default function FundNetworkLayout({ children }: { children: ReactNode }) {
  return children;
}
