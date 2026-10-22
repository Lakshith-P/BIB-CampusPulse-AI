import { withTransaction } from "@/backend/db.server";
import { clientIp, rateLimit } from "@/backend/rate-limit.server";
import { handleMessage, twiml, validTwilioSignature } from "@/backend/whatsapp.server";

const xmlResponse = (text, status = 200) =>
  new Response(twiml(text), { status, headers: { "Content-Type": "text/xml; charset=utf-8" } });

/**
 * Twilio webhook for incoming WhatsApp messages. Every request must carry Twilio's signature,
 * so nobody can talk to the bot (or pretend to be a phone number) by calling this URL directly.
 */
export async function handleWhatsApp(request) {
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  if (!authToken) return new Response("WhatsApp is not configured.", { status: 503 });
  if (!rateLimit(`wa-ip:${clientIp(request)}`, 120, 60_000))
    return new Response("Too many requests.", { status: 429 });

  const params = Object.fromEntries(new URLSearchParams(await request.text()));
  // Behind a proxy the URL the server sees can differ from the one Twilio signed.
  const url = process.env["TWILIO_WEBHOOK_URL"] || request.url;
  if (!validTwilioSignature(authToken, url, params, request.headers.get("x-twilio-signature")))
    return new Response("Invalid signature.", { status: 403 });

  const from = params["From"];
  if (!from?.startsWith("whatsapp:")) return xmlResponse("This bot only works on WhatsApp.");
  if (!rateLimit(`wa-phone:${from}`, 30, 60_000))
    return xmlResponse("You are sending messages too fast. Please wait a minute.");

  try {
    const reply = await withTransaction((db) =>
      handleMessage(db, { from, body: params["Body"] ?? "" }),
    );
    return xmlResponse(reply);
  } catch (error) {
    // Details go to the server log only; never echo internals into a chat.
    console.error("WhatsApp bot error:", error instanceof Error ? error.message : error);
    return xmlResponse("Something went wrong on our side. Please try again in a moment.");
  }
}
