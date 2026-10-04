import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { guardImageRequest, readImageAsJson } from "@/lib/aiGuard";

const PROMPT = `This is a photo of a handwritten or printed shopping list that a customer
gave to a shop in India. Read every line and list what they want.

Return ONLY a raw JSON object, no markdown fences, no explanation:
{
  "items": [
    { "name": "item name as written, in English letters if you can", "qty": numeric quantity (number), "unit": "kg, g, L, ml, pcs, packet, dozen... or null" }
  ]
}

Rules:
- The list may be in Hindi, Telugu, Kannada, Tamil, Malayalam or English, or a mix. Translate item names into the common English or brand name used in an Indian shop (for example "आटा" becomes "Atta").
- qty must be a number. If no quantity is written, use 1.
- Ignore prices, totals, dates, names and anything that is not an item.
- If a line is unreadable, skip it.`;

export async function POST(request) {
  const guard = await guardImageRequest(request, { feature: "handwritten_scan" });
  if (guard.error) return guard.error;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Scanning isn't set up yet." }, { status: 500 });
  }

  let result;
  try {
    result = await readImageAsJson(Anthropic, { image: guard.image, mediaType: guard.mediaType, prompt: PROMPT, maxTokens: 1200 });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Could not read the list. Try a clearer, better-lit photo." }, { status: 422 });
    }
    return NextResponse.json({ error: "The scan service is busy. Try again in a moment." }, { status: 502 });
  }
  const items = (result.parsed.items || [])
    .filter((i) => i && typeof i.name === "string" && i.name.trim())
    .map((i) => ({ name: i.name.trim(), qty: Number(i.qty) > 0 ? Number(i.qty) : 1, unit: i.unit || null }))
    .slice(0, 60);
  if (items.length === 0) {
    return NextResponse.json({ error: "No items found. Try a closer, clearer photo." }, { status: 422 });
  }
  return NextResponse.json({ items });
}
