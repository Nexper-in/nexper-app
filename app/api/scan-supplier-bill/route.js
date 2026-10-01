import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { guardImageRequest, readImageAsJson } from "@/lib/aiGuard";

const PROMPT = `This is a supplier invoice or delivery challan from an Indian retail shop.
Extract every line item that was purchased.

Return ONLY a raw JSON object — no markdown fences, no explanation:
{
  "supplier": "supplier / vendor name, or null",
  "invoice_date": "YYYY-MM-DD, or null",
  "invoice_no": "invoice number string, or null",
  "items": [
    {
      "name": "item name as printed on the bill",
      "qty": numeric quantity (number, not string),
      "unit": "unit abbreviation — kg, g, L, ml, pcs, box, doz, bag, etc.",
      "price_per_unit": numeric price in rupees, or null,
      "total": numeric line total in rupees, or null
    }
  ]
}

Rules:
- qty and prices must be numbers, not strings.
- If the bill is in Hindi or mixed Hindi/English, still extract the items.
- If a field is truly unreadable, use null.
- Do not include taxes, freight, or discount rows as items — only actual goods.`;

export async function POST(request) {

  // Signed in, rate limited, sensible image: see lib/aiGuard.js
  const guard = await guardImageRequest(request);
  if (guard.error) return guard.error;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Scanning isn't set up yet." }, { status: 500 });
  }

  let result;
  try {
    result = await readImageAsJson(Anthropic, { image: guard.image, mediaType: guard.mediaType, prompt: PROMPT });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Could not read the bill — try a clearer, better-lit photo." }, { status: 422 });
    }
    return NextResponse.json({ error: "The scan service is busy. Try again in a moment." }, { status: 502 });
  }

  const parsed = result.parsed;
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    return NextResponse.json(
      { error: "No items found in the bill — try a closer or clearer photo." },
      { status: 422 }
    );
  }

  return NextResponse.json(parsed);
}
