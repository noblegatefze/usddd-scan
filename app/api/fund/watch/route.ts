export function GET() {
  return Response.json({ ok: false, error: "Legacy deposit monitoring is closed. If you already sent USDT, contact usddd@digdug.do for manual review." }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
