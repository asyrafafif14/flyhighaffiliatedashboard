import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "dist");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = path.join(root, cleanPath || "index.html");
    const normalized = path.normalize(filePath);

    if (!normalized.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const stats = await fs.stat(normalized).catch(() => null);
    const finalPath = stats?.isDirectory() ? path.join(normalized, "index.html") : normalized;
    const body = await fs.readFile(finalPath);
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(finalPath)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Affiliate dashboard running at http://localhost:${port}`);
});
