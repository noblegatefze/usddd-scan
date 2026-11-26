export function POST() {
  return Response.json({ ok: false, error: "Legacy Fund linking is closed. Contact usddd@digdug.do for manual review." }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
