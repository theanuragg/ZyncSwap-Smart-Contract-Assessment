import { NextResponse } from "next/server";
import { getMatchingEngine } from "../../../../../lib/engines.js";
import { MatchError } from "../../../../../lib/matchingEngine.js";
import { requireApiKey } from "../../../../../lib/auth.js";

export const dynamic = "force-dynamic";

function jsonError(message, status) {
  return NextResponse.json({ error: { message } }, { status });
}

export async function DELETE(req, { params }) {
  const authErr = requireApiKey(req);
  if (authErr) return authErr;
  let id = params.id?.trim();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return jsonError("invalid order id", 400);
  }
  id = id.toLowerCase();
  try {
    await getMatchingEngine().cancel(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof MatchError) {
      return jsonError(e.message, e.code === "NOT_FOUND" ? 404 : 400);
    }
    throw e;
  }
}
