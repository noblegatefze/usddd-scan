export function POST() {
  return Response.json({ ok: false, error: "Online deposit confirmation is closed. If you already sent USDT, contact usddd@digdug.do for manual review." }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
