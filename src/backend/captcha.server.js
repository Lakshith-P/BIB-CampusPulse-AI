import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// A self-hosted text captcha. The server draws a distorted image and hands back a signed token
// that holds only a keyed hash of the answer, so nothing needs to be stored and the answer is
// never sent to the browser. Each token works once and expires after five minutes.
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679"; // no look-alikes (0/O, 1/I, 5/S, 2/Z, 8/B)
const TTL_SECONDS = 300;
const used = new Map(); // token id -> expiry, so a solved captcha cannot be replayed

function secret() {
  const s = process.env["JWT_SECRET"];
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set to at least 32 characters.");
  return s;
}
const hash = (answer) =>
  createHmac("sha256", secret()).update(`captcha:${answer.toUpperCase()}`).digest("hex");

function drawSvg(code) {
  const w = 190;
  const h = 64;
  const rnd = (a, b) => randomInt(a, b + 1);
  const colors = ["#1f6f5c", "#2b5aa8", "#8a3b8f", "#a8541f", "#2c2c2c"];
  let body = `<rect width="${w}" height="${h}" fill="#f1f5f3"/>`;
  for (let i = 0; i < 6; i++) {
    body += `<path d="M${rnd(0, 30)} ${rnd(8, h - 8)} C ${rnd(40, 90)} ${rnd(0, h)}, ${rnd(100, 150)} ${rnd(0, h)}, ${rnd(w - 30, w)} ${rnd(8, h - 8)}" stroke="${colors[rnd(0, 4)]}" stroke-opacity=".45" stroke-width="1.6" fill="none"/>`;
  }
  [...code].forEach((ch, i) => {
    const x = 20 + i * 32;
    const y = rnd(40, 48);
    body += `<text x="${x}" y="${y}" font-family="Verdana,Arial,sans-serif" font-size="${rnd(30, 38)}" font-weight="700" fill="${colors[rnd(0, 4)]}" transform="rotate(${rnd(-22, 22)} ${x} ${y})">${ch}</text>`;
  });
  for (let i = 0; i < 40; i++) {
    body += `<circle cx="${rnd(0, w)}" cy="${rnd(0, h)}" r="${rnd(1, 2)}" fill="${colors[rnd(0, 4)]}" fill-opacity=".5"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

export async function createCaptcha() {
  const code = Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const token = await new SignJWT({ h: hash(code) })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("captcha")
    .setJti(randomUUID())
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret()));
  return {
    token,
    image: `data:image/svg+xml;base64,${Buffer.from(drawSvg(code)).toString("base64")}`,
  };
}

export async function checkCaptcha(token, answer) {
  const fail = () => {
    throw new Error("The verification text was wrong or expired. Try the new image.");
  };
  if (!token || !answer) fail();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret()), {
      audience: "captcha",
      algorithms: ["HS256"],
    }));
  } catch {
    return fail();
  }
  const now = Date.now();
  for (const [id, exp] of used) if (exp < now) used.delete(id);
  if (!payload.jti || used.has(payload.jti)) return fail();
  used.set(payload.jti, now + TTL_SECONDS * 1000);
  const a = Buffer.from(hash(answer.trim()));
  const b = Buffer.from(String(payload.h));
  if (a.length !== b.length || !timingSafeEqual(a, b)) fail();
}
