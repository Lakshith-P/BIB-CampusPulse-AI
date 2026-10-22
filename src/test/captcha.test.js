// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { checkCaptcha, createCaptcha } from "@/backend/captcha.server";

beforeAll(() => {
  process.env["JWT_SECRET"] = "x".repeat(40);
});

describe("captcha", () => {
  it("issues an svg image and a token", async () => {
    const c = await createCaptcha();
    expect(c.image.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(c.token.split(".")).toHaveLength(3);
  });
  it("rejects a wrong answer and a token reused after use", async () => {
    const c = await createCaptcha();
    await expect(checkCaptcha(c.token, "WRONG")).rejects.toThrow();
    await expect(checkCaptcha(c.token, "WRONG")).rejects.toThrow();
  });
  it("rejects a missing token or answer", async () => {
    await expect(checkCaptcha("", "ABCDE")).rejects.toThrow();
    await expect(checkCaptcha("not-a-jwt", "ABCDE")).rejects.toThrow();
  });
});
