import { hasScope, getShop, listItems, lowStock, listBills, todaySummary, outstandingUdhaar, expiringItems } from "@/lib/shopApi";

// MCP (Model Context Protocol) server over plain HTTP, so AI assistants such as
// Claude can read a shop's numbers. Point the assistant's MCP settings at
//   https://app.nexper.in/api/mcp      with header   Authorization: Bearer nxp_...
// Read-only. Customer phone numbers are masked. One JSON-RPC message (or a
// batch) per POST; no streaming and no sessions are needed for these tools.
const PROTOCOL = "2025-03-26";
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const TOOLS = [
  { name: "get_shop", scope: "read:shop", description: "Name, type and GSTIN of the shop.", schema: {}, run: (c) => getShop(c) },
  {
    name: "search_items",
    scope: "read:stock",
    description: "Find items in stock by name, code or barcode. Returns price and quantity.",
    schema: { query: { type: "string", description: "Part of the item name, or its code/barcode" }, limit: { type: "integer", description: "Max results (default 20, up to 200)" } },
    run: (c, a) => listItems(c, { q: a.query, limit: a.limit ?? 20 }),
  },
  { name: "low_stock", scope: "read:stock", description: "Items at or below their low-stock level, lowest first.", schema: { limit: { type: "integer" } }, run: (c, a) => lowStock(c, { limit: a.limit ?? 20 }) },
  { name: "expiring_items", scope: "read:stock", description: "Stock batches expiring soon.", schema: { days: { type: "integer", description: "Look ahead this many days (default 14)" } }, run: (c, a) => expiringItems(c, { days: a.days }) },
  { name: "today_summary", scope: "read:bills", description: "Today's number of bills and sales, split by cash, UPI and udhaar.", schema: {}, run: (c) => todaySummary(c) },
  {
    name: "recent_bills",
    scope: "read:bills",
    description: "Recent bills with their items. Optional date range as ISO dates.",
    schema: { from: { type: "string" }, to: { type: "string" }, limit: { type: "integer" } },
    run: (c, a) => listBills(c, { from: a.from, to: a.to, limit: a.limit ?? 20, maskPhones: true }),
  },
  { name: "outstanding_udhaar", scope: "read:udhaar", description: "Total udhaar owed to the shop and the biggest balances.", schema: { limit: { type: "integer" } }, run: (c, a) => outstandingUdhaar(c, { limit: a.limit ?? 10, maskPhones: true }) },
];

export const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handleMcpMessage(msg, ctx) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid request");
  const { id, method, params = {} } = msg;
  const isNotification = id === undefined;
  if (method.startsWith("notifications/")) return null;
  switch (method) {
    case "initialize":
      return { jsonrpc: "2.0", id, result: { protocolVersion: SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "nexper", version: "1.0.0" }, instructions: "Read-only access to one shop's stock, bills and udhaar." } };
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS.filter((t) => hasScope(ctx, t.scope)).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: { type: "object", properties: t.schema, additionalProperties: false },
            annotations: { readOnlyHint: true, openWorldHint: false },
          })),
        },
      };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, "Unknown tool");
      if (!hasScope(ctx, tool.scope)) return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `This key needs the ${tool.scope} scope.` }] } };
      try {
        const out = await tool.run(ctx, params.arguments && typeof params.arguments === "object" ? params.arguments : {});
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out) }], isError: false } };
      } catch (err) {
        console.error("[mcp]", err?.message || err);
        return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: "That request failed. Try again." }] } };
      }
    }
    default:
      return isNotification ? null : rpcError(id, -32601, "Method not found");
  }
}

