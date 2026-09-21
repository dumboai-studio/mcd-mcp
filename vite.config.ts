import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const isDevelopment = process.env.NODE_ENV === "development";

// 把 ui/ 打包成单个 HTML（dist/ui/index.html），由 MCP 服务端作为 ui:// 资源返回给宿主
export default defineConfig({
  root: fileURLToPath(new URL("./ui", import.meta.url)),
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: fileURLToPath(new URL("./dist/ui", import.meta.url)),
    emptyOutDir: true,
    sourcemap: isDevelopment ? "inline" : undefined,
    minify: !isDevelopment,
    cssMinify: !isDevelopment,
    rollupOptions: {
      input: fileURLToPath(new URL("./ui/index.html", import.meta.url)),
    },
  },
});
