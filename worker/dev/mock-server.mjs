// Lokal testserver uden Cloudflare: serverer public/ og /api/chat med en falsk sprogmodel.
// Kør: node dev/mock-server.mjs  ->  http://localhost:8787/demo.html
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import worker from "../src/index.js";

const env = {
  ALLOWED_ORIGINS: "http://localhost:8787",
  AI: {
    async run(model, { messages }) {
      const q = messages.at(-1).content;
      const ctx = messages[0].content.split("KONTEKST:\n")[1] || "";
      const first = ctx.split("\n\n")[0].slice(0, 260);
      let reply = `(Testsvar uden AI) Mest relevante kilde:\n${first}…`;
      if (/drypper|itu|virker ikke/i.test(q)) reply += `\n[[FORMULAR:vicevaert|${q}]]`;
      return { response: reply };
    },
  },
};
const types = { ".js": "text/javascript", ".html": "text/html; charset=utf-8" };
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8787");
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
    const body = req.method === "POST" ? await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); }) : undefined;
    const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  const file = new URL("../public" + (url.pathname === "/" ? "/demo.html" : url.pathname), import.meta.url);
  if (!existsSync(file)) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "Content-Type": types[file.pathname.slice(file.pathname.lastIndexOf("."))] || "text/plain" });
  res.end(readFileSync(file));
}).listen(8787, () => console.log("Rita test: http://localhost:8787/demo.html"));
