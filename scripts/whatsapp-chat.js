// Chat with the WhatsApp bot from the terminal, without Twilio, a phone or a tunnel.
// It sends the same signed request Twilio would, so the real webhook code runs.
//
//   1. In .env set TWILIO_AUTH_TOKEN=test-token  and
//      TWILIO_WEBHOOK_URL=http://localhost:5173/api/public/whatsapp   (use your dev server's port)
//   2. npm run dev          (in one terminal)
//   3. npm run whatsapp:chat -- --port=5173   (in another; the port npm run dev printed)
import { createHmac } from "node:crypto";
import { createInterface } from "node:readline";

const token = process.env["TWILIO_AUTH_TOKEN"];
const url = process.env["TWILIO_WEBHOOK_URL"];
if (!token || !url) {
  console.error(
    "Set TWILIO_AUTH_TOKEN and TWILIO_WEBHOOK_URL in .env first (see the comment at the top of this file).",
  );
  process.exit(1);
}

// --port=5174 sends to your local dev server while still signing for TWILIO_WEBHOOK_URL.
const port = process.argv.find((a) => a.startsWith("--port="))?.slice(7);
const target = port ? `http://localhost:${port}${new URL(url).pathname}` : url;
const phone = `whatsapp:${process.argv.find((a) => a.startsWith("+")) ?? "+910000000001"}`;
const sign = (params) =>
  createHmac("sha1", token)
    .update(
      Object.keys(params)
        .sort()
        .reduce((acc, k) => acc + k + params[k], url),
    )
    .digest("base64");

const unxml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

async function send(body) {
  const params = { From: phone, To: "whatsapp:+14155238886", Body: body };
  const res = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": sign(params),
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  if (!res.ok) return `[server answered ${res.status}] ${text}`;
  return unxml(text.match(/<Message>([\s\S]*)<\/Message>/)?.[1] ?? text);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(
  `Chatting as ${phone}. Type messages like on WhatsApp (start with: login). Ctrl+C to quit.\n`,
);
rl.setPrompt("you > ");
if (process.stdin.isTTY) rl.prompt();
for await (const line of rl) {
  console.log(`\nbot > ${(await send(line)).replace(/\n/g, "\n      ")}\n`);
  if (process.stdin.isTTY) rl.prompt();
}
