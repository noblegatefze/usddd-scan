const canonicalHosts: Record<string, string> = {
  "usddd.digdug.do": "https://usddd.digdug.do",
  "fund.digdug.do": "https://fund.digdug.do"
};

export function sitemapOrigin(request: Request) {
  const host = new URL(request.url).hostname;
  return Object.hasOwn(canonicalHosts, host) ? canonicalHosts[host] : "https://usddd.digdug.do";
}
