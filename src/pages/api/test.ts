export const GET = () => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
