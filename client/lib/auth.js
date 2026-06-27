const API_KEY = process.env.API_KEY?.trim() || null;

export function requireApiKey(req) {
  if (!API_KEY) return null;
  const header = req.headers.get("x-api-key")?.trim();
  if (header !== API_KEY) {
    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
