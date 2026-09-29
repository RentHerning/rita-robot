import { FORMS } from "./prompt.js";

const MAX_MSG_CHARS = 1000;
const MAX_TURNS = 10;

export function parseReply(raw) {
  let form = null;
  const m = raw.match(/\[\[\s*FORMULAR\s*:\s*([a-zø0-9]+)\s*\|([\s\S]*?)\]\]/i);
  let reply = raw;
  if (m) {
    const code = m[1].toLowerCase().replace("ø", "oe");
    if (FORMS[code]) form = { code, ...FORMS[code], message: m[2].trim() };
    reply = raw.replace(m[0], "");
  }
  reply = reply.replace(/\[\[[^\]]*\]\]/g, "").trim();
  return { reply, form };
}

export function sanitizeMessages(input) {
  if (!Array.isArray(input)) return null;
  const msgs = input
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MSG_CHARS) }))
    .slice(-MAX_TURNS);
  if (!msgs.length || msgs.at(-1).role !== "user") return null;
  return msgs;
}
