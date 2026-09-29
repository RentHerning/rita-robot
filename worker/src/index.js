import knowledge from "./knowledge.json" with { type: "json" };
import { Index } from "./retrieval.js";
import { SYSTEM_PROMPT, FORMS, buildContext } from "./prompt.js";
import { parseReply, sanitizeMessages } from "./util.js";

const index = new Index(knowledge);

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const URGENT = /\b(brand|brænder|ild|røg|vandskade|oversvømme\w*|sprunget\s+rør|rørbrud|gaslugt|strømsvigt)\b/i;

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.length === 0 || allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });

// Model-kald. Workers AI som standard; en OpenAI-kompatibel API (fx Claude, OpenAI,
// eller en Hugging Face-endpoint med en dansk model) kan slås til via miljøvariabler.
export async function callModel(env, messages) {
  if (env.LLM_PROVIDER === "openai-compatible") {
    const r = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({ model: env.LLM_MODEL, messages, max_tokens: 500, temperature: 0.2 }),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    return d.choices?.[0]?.message?.content || "";
  }
  const out = await env.AI.run(env.MODEL || DEFAULT_MODEL, { messages, max_tokens: 500, temperature: 0.2 });
  return typeof out === "string" ? out : out?.response ?? out?.choices?.[0]?.message?.content ?? "";
}

export async function handleChat(body, env) {
  const messages = sanitizeMessages(body?.messages);
  if (!messages) return { status: 400, data: { error: "Ugyldig forespørgsel." } };

  const userTurns = messages.filter((m) => m.role === "user");
  const last = userTurns.at(-1).content;
  // Opfølgende spørgsmål ("og hvad med katte?") søges sammen med forrige spørgsmål
  const query = userTurns.length > 1 && last.length < 60 ? `${userTurns.at(-2).content} ${last}` : last;
  const hits = index.search(query, 6);

  const system = `${SYSTEM_PROMPT}\n\nKONTEKST:\n${hits.length ? buildContext(hits) : "(ingen relevante kilder fundet)"}`;
  const raw = await callModel(env, [{ role: "system", content: system }, ...messages]);
  let { reply, form } = parseReply(raw || "");

  if (!reply) reply = "Beklager, jeg kunne ikke finde et svar. Du er velkommen til at skrive til os via formularen Forespørgsel.";
  if (!form && URGENT.test(last)) {
    form = { code: "akut", ...FORMS.akut, message: last };
  }

  const seen = new Set();
  const sources = hits
    .filter((h) => h.score >= 5 && h.score >= hits[0].score * 0.5) // kun tydeligt relevante kilder
    .slice(0, 3)
    .map((h) => ({ title: h.source === "lejeloven" ? h.title.split(" – ")[0] + " (lejeloven)" : h.title, url: h.url }))
    .filter((s) => (seen.has(s.title) ? false : seen.add(s.title)));

  return { status: 200, data: { reply, form, sources } };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (cors["Access-Control-Allow-Origin"] === "null") return json({ error: "Origin ikke tilladt." }, 403, cors);
      if (env.RATE_LIMITER) {
        const ip = request.headers.get("CF-Connecting-IP") || "ukendt";
        const { success } = await env.RATE_LIMITER.limit({ key: ip });
        if (!success) return json({ error: "Du har sendt mange beskeder. Prøv igen om lidt." }, 429, cors);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Ugyldig JSON." }, 400, cors);
      }
      try {
        const { status, data } = await handleChat(body, env);
        return json(data, status, cors);
      } catch (err) {
        console.error("chat error", err?.message);
        return json({ error: "Rita har tekniske problemer lige nu. Prøv igen senere, eller brug kontaktformularen." }, 502, cors);
      }
    }

    if (url.pathname === "/health") return json({ ok: true, chunks: knowledge.length }, 200, cors);

    // Statiske filer (rita.js, demo.html) serveres af [assets] i wrangler.toml
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
