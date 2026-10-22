import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";
import { pageHead } from "@/lib/metadata";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useAccount } from "@/lib/account";
import { sendContactMessage } from "@/lib/auth.functions";
import { CaptchaField, useCaptcha } from "@/components/CaptchaField";
import { Send, MessagesSquare, ArrowUpRight } from "lucide-react";
export const Route = createFileRoute("/contact")({
  head: () =>
    pageHead(
      "Connect With Us",
      "Contact TEAM BIB about campus analytics, collaboration and BIB InsightIQ.",
    ),
  component: Contact,
});
function Contact() {
  const { user } = useAccount();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: true, text: "" });
  const { captcha, reload } = useCaptcha((text) => setMsg({ ok: false, text }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    try {
      await sendContactMessage({
        data: {
          name: String(f.get("name")),
          email: String(f.get("email")),
          message: String(f.get("message")),
          captchaToken: captcha?.token ?? "",
          captchaAnswer: String(f.get("captcha") ?? ""),
        },
      });
      form.reset();
      setMsg({
        ok: true,
        text: "Your message has been saved for TEAM BIB. Thank you for connecting.",
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : "";
      setMsg({
        ok: false,
        text: text.startsWith("[")
          ? "Check your details and the verification letters, then try again."
          : text || "Your message could not be saved.",
      });
    } finally {
      void reload();
      setBusy(false);
    }
  }
  return (
    <PublicLayout>
      <main className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-2">
        <div>
          <p className="eyebrow">LET’S CONNECT</p>
          <h1 className="page-heading mt-4">
            Better campuses start
            <br />
            with a conversation.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Have a campus challenge, a collaboration idea, or feedback on the platform? We would
            love to hear from you.
          </p>
          <div className="mt-10 border-t pt-6">
            <MessagesSquare className="size-7 text-primary" />
            <h2 className="mt-4 text-xl font-semibold">TEAM BIB</h2>
            <p className="mt-2 text-muted-foreground">
              Biryani Intelligence Bureau
              <br />
              HacXLerate · Smart Campus Analytics
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/solution">
                Why BIB InsightIQ <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-7">
          <h2 className="text-2xl font-semibold">Send us a message</h2>
          <form className="mt-6 space-y-5" onSubmit={submit}>
            <label className="block text-sm">
              Your name
              <Input
                name="name"
                required
                maxLength={100}
                defaultValue={user?.displayName ?? ""}
                className="mt-2"
              />
            </label>
            <label className="block text-sm">
              Email
              <Input
                name="email"
                type="email"
                required
                defaultValue={user?.email ?? ""}
                className="mt-2"
              />
            </label>
            <label className="block text-sm">
              Your message
              <Textarea
                name="message"
                required
                minLength={10}
                maxLength={3000}
                rows={5}
                className="mt-2"
              />
            </label>
            <CaptchaField captcha={captcha} reload={reload} />
            <p className="text-xs text-muted-foreground">
              Please do not send confidential student records or complaints here.
            </p>
            <Button type="submit" disabled={busy || !captcha}>
              <Send />
              {busy ? "Saving…" : "Send message"}
            </Button>
            {msg.text && (
              <p
                role="status"
                className={`text-sm ${msg.ok ? "text-success" : "text-destructive"}`}
              >
                {msg.text}
              </p>
            )}
          </form>
        </div>
      </main>
    </PublicLayout>
  );
}
