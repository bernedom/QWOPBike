import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built game can be dropped onto any static host / subfolder.
  base: "./",
  // .direnv holds a nixpkgs checkout; watching it exhausts inotify watchers.
  server: { watch: { ignored: ["**/.direnv/**", "**/result/**"] } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
