import { sitemapOrigin } from "../crawl-origin";

export function GET(request: Request) {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${sitemapOrigin(request)}/sitemap.xml\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
