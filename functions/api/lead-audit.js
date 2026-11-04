const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function onRequestPost({ request, env }) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/x-www-form-urlencoded") && !type.includes("multipart/form-data")) {
    return reply(415, { ok: false, error: "Unsupported form encoding" });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { ok: false, error: "Invalid form data" });
  }

  // Quietly accept honeypot submissions without forwarding or storing them.
  if (String(form.get("bot-field") || "").trim()) return reply(200, { ok: true });

  const lead = {
    name: String(form.get("name") || "").trim(),
    business_type: String(form.get("business_type") || "").trim(),
    email: String(form.get("email") || "").trim(),
    whatsapp: String(form.get("whatsapp") || "").trim(),
    source: "website-lead-audit",
  };

  if (!lead.name || lead.name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) || lead.email.length > 254 || lead.business_type.length > 160 || lead.whatsapp.length > 40) {
    return reply(400, { ok: false, error: "Please check your name, email, business type, and phone number." });
  }

  // Deliver to the site owners through Resend. Keep the provider key server-side.
  if (!env.RESEND_API_KEY || !env.LEAD_AUDIT_FROM) {
    return reply(503, { ok: false, error: "Lead submissions are temporarily unavailable. Please contact us by WhatsApp." });
  }

  const emailBody = [
    "New LeadOro website lead audit request", "",
    `Name: ${lead.name}`, `Business type: ${lead.business_type || "Not provided"}`,
    `Email: ${lead.email}`, `WhatsApp: ${lead.whatsapp || "Not provided"}`,
  ].join("\n");
  let delivery;
  try {
    delivery = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: env.LEAD_AUDIT_FROM,
        to: ["kotikutaiye@gmail.com", "promisetaiye16@gmail.com"],
        reply_to: lead.email,
        subject: `Website lead audit request: ${lead.name}`,
        text: emailBody,
      }),
    });
  } catch {
    return reply(502, { ok: false, error: "We could not submit your request. Please try again or contact us by WhatsApp." });
  }
  if (!delivery.ok) return reply(502, { ok: false, error: "We could not submit your request. Please try again or contact us by WhatsApp." });

  // Preserve the existing callback request, but only where the configured,
  // verified callback URL is available. Callback failure does not undo lead capture.
  if (lead.whatsapp && lead.email && env.META_DEMO_CALL_URL) {
    const callbackUrl = new URL(env.META_DEMO_CALL_URL);
    if (callbackUrl.protocol === "https:") {
      try {
        await fetch(callbackUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: lead.whatsapp, email: lead.email, name: lead.name, business_type: lead.business_type, website: "" }),
        });
      } catch { /* lead remains captured; callback can be retried independently */ }
    }
  }

  return reply(200, { ok: true });
}

export function onRequestGet() {
  return reply(405, { ok: false, error: "Method not allowed" });
}
