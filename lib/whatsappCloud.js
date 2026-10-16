// WhatsApp Cloud API (Meta). SERVER-ONLY.
//
// WhatsApp only lets a business start a conversation with an approved
// message template, and sending needs a Meta business account. Until those
// are set up, none of the environment variables below exist, whatsappReady()
// is false and the app falls back to one-tap wa.me links and email. Nothing
// here runs by accident.
//
//   WHATSAPP_TOKEN            permanent access token
//   WHATSAPP_PHONE_ID         the sending number's Phone Number ID
//   WHATSAPP_TEMPLATE_REMINDER  approved template, 3 body params: shop, name, amount
//   WHATSAPP_TEMPLATE_SUMMARY   approved template, 1 body param: the summary text
//   WHATSAPP_TEMPLATE_LANG      template language code (default "en")

export const whatsappReady = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

export function toWaNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

export async function sendTemplate(phone, template, params = []) {
  if (!whatsappReady() || !template) return { ok: false, skipped: true };
  const to = toWaNumber(phone);
  if (to.length < 11) return { ok: false, error: "bad phone" };
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: String(text).replace(/\s*\n\s*/g, " ").slice(0, 900) })) }],
      },
    }),
  });
  return { ok: res.ok, status: res.status };
}
