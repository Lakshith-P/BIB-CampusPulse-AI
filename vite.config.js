import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  // Make .env visible to server code (Vite only exposes VITE_* to the client).
  for (const [k, val] of Object.entries(loadEnv(mode, process.cwd(), ""))) process.env[k] ??= val;
  return {
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
    // Lets a tunnel (ngrok, Cloudflare) reach the dev server so Twilio can call the WhatsApp webhook.
    server: {
      allowedHosts: [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.app", ".trycloudflare.com"],
    },
    plugins: [
      tanstackStart({
        server: { entry: "server" },
      }),
      viteReact(),
      tailwindcss(),
      ...(command === "build" ? [nitro()] : []),
    ],
  };
});
