import { FLOWS, LEGACY } from "./prompt.js";

const MAX_MSG_CHARS = 1000;
const MAX_TURNS = 10;

// [[HJÆLP:vicevaert|Min vandhane drypper.]]  (også HJAELP/HELP og den gamle FORMULAR-syntaks)
const TAG = /\[\[\s*(?:HJÆLP|HJAELP|HELP|FORMULAR)\s*:\s*([a-zæøå0-9]+)\s*\|([\s\S]*?)\]\]/i;

export function parseReply(raw) {
  let help = null;
  let reply = raw;
  const m = raw.match(TAG);
  if (m) {
    let code = m[1].toLowerCase().replace(/ø/g, "oe").replace(/æ/g, "ae");
    code = LEGACY[code] ?? code;
    const message = m[2].trim();
    if (FLOWS.includes(code)) help = { code, message: message === "-" ? "" : message };
    reply = raw.replace(m[0], "");
  }
  reply = reply.replace(/\[\[[^\]]*\]\]/g, "").trim();
  return { reply, help };
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
