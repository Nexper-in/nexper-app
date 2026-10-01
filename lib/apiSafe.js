import { NextResponse } from "next/server";

// Reads a JSON body without throwing on bad input. Returns {} for anything that
// isn't a JSON object, so route code can just check the fields it needs.
export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

// A 500 that doesn't leak database or auth internals to the caller. The real
// error goes to the server log.
export function serverError(error, where = "api") {
  console.error(`[${where}]`, error?.message || error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

// A PIN is a password, so refuse the ones that are guessed first: a single
// repeated digit (111111) or a straight run (123456, 654321).
export function isWeakPin(pin) {
  const p = String(pin);
  if (/^(.)\1+$/.test(p)) return true;
  if (/^\d+$/.test(p)) {
    const d = [...p].map(Number);
    const step = d[1] - d[0];
    if (Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return true;
  }
  return ["000000", "123123", "112233", "121212", "696969", "159753"].includes(p);
}
