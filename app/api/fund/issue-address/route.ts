export function POST() {
  return Response.json({ ok: false, error: "New Fund positions are closed." }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
