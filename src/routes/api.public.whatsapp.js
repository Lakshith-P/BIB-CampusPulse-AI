import { createFileRoute } from "@tanstack/react-router";
import { handleWhatsApp } from "@/lib/whatsapp.server";
export const Route = createFileRoute("/api/public/whatsapp")({
  server: { handlers: { POST: ({ request }) => handleWhatsApp(request) } },
});
