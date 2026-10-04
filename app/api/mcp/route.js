import { NextResponse } from "next/server";
import { authenticateKey } from "@/lib/shopApi";
import { handleMcpMessage, rpcError } from "@/lib/mcpServer";

// MCP (Model Context Protocol) server over plain HTTP. The tools and protocol
// handling live in lib/mcpServer.js; this file only does sign-in and transport.
// Point an assistant at  https://app.nexper.in/api/mcp  with the header
// Authorization: Bearer nxp_...  (keys are made in the admin console).
export async function POST(request) {
  const auth = await authenticateKey(request, { feature: "mcp" });
  if (auth.error) return NextResponse.json(rpcError(null, -32001, auth.error), { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  const batch = Array.isArray(body);
  const messages = batch ? body.slice(0, 20) : [body];
  const replies = (await Promise.all(messages.map((m) => handleMcpMessage(m, auth.ctx)))).filter(Boolean);
  if (replies.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(batch ? replies : replies[0], { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return new NextResponse("Use POST with JSON-RPC.", { status: 405, headers: { Allow: "POST" } });
}
