import { stat } from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (
  process.env.BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${PORT}`)
).replace(/\/+$/, "");
const PUBLIC_DIR = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : null;
const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createCode() {
  let code = "";
  while (code.length < 6) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < 248) code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }
  }
  return code;
}

function newUniqueCode() {
  let code;
  do {
    code = createCode();
  } while (links.has(code));
  return code;
}

async function serveStatic(pathname) {
  if (!PUBLIC_DIR) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return null;
  }

  try {
    if (!(await stat(filePath)).isFile()) return null;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }

  return new Response(Bun.file(filePath));
}

async function handle(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/links") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (typeof body?.url !== "string") {
      return json({ error: "A valid HTTP(S) URL is required" }, 400);
    }

    let originalUrl;
    try {
      originalUrl = new URL(body.url);
    } catch {
      return json({ error: "A valid HTTP(S) URL is required" }, 400);
    }
    if (originalUrl.protocol !== "http:" && originalUrl.protocol !== "https:") {
      return json({ error: "A valid HTTP(S) URL is required" }, 400);
    }

    const code = newUniqueCode();
    const link = {
      code,
      url: originalUrl.href,
      shortUrl: `${BASE_URL}/${code}`,
      hits: 0,
      createdAt: new Date().toISOString(),
    };
    links.set(code, link);
    return json(link, 201);
  }

  if (request.method === "GET" && url.pathname === "/api/links") {
    return json(Array.from(links.values()));
  }

  if (request.method === "GET") {
    const file = await serveStatic(url.pathname);
    if (file) return file;

    const code = url.pathname.slice(1);
    if (!code || code.includes("/")) {
      return json({ error: "Not found" }, 404);
    }

    const link = links.get(code);
    if (!link) return json({ error: "Not found" }, 404);

    link.hits += 1;
    return new Response(null, {
      status: 302,
      headers: { Location: link.url },
    });
  }

  return json({ error: "Not found" }, 404);
}

Bun.serve({
  port: PORT,
  fetch: async (request) => withCors(await handle(request)),
});

console.log(`Snip backend listening on ${BASE_URL}`);
