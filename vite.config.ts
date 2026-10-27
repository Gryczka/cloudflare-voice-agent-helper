import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    // The hosted demo builds from an untracked owner config with its account
    // and Worker name. Everyone else uses wrangler.jsonc.
    cloudflare(
      process.env.GARDEN_PRODUCTION_PREFLIGHT === "1"
        ? { configPath: "./wrangler.production-preflight.jsonc" }
        : {}
    ),
  ],
  build: {
    outDir: "dist",
  },
});
