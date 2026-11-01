// Rate limiting for Rita. Two layers:
//
//  1. Per visitor: max 10 messages per minute per IP (Cloudflare's rate-limit
//     binding RATE_LIMITER in wrangler.toml). Cloudflare keeps these counters;
//     Rita stores nothing about the visitor.
//  2. Per day, for everyone together: at most DAILY_LIMIT questions (default 500),
//     counted in the KV namespace RITA_LIMITS under "day:YYYY-MM-DD". This caps the
//     AI cost if a lot of people – or a bot spreading over many IPs – use Rita.
//     No IP addresses or texts are stored, only one number per day.
//
// Both layers "fail open": if Cloudflare's limiter or KV has a hiccup, Rita keeps
// answering rather than going silent. KV is eventually consistent, so the daily
// count is approximate (a few extra questions can slip through at the limit).

const MESSAGES = {
  da: {
    burst: "Du har sendt mange beskeder på kort tid. Vent et øjeblik, og prøv igen.",
    daily: "Rita har haft travlt i dag og holder pause til i morgen. Du kan stadig få hjælp på siden Hjælp & kontakt.",
  },
  en: {
    burst: "You’ve sent a lot of messages in a short time. Please wait a moment and try again.",
    daily: "Rita has been busy today and is taking a break until tomorrow. You can still get help on the Help & contact page.",
  },
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Returns null when the request may go ahead, or { status, error, retryAfter }.
 * `ctx` is the Worker's execution context (used to finish the KV write after replying).
 */
export async function checkLimits(request, env, ctx, lang = "da") {
  const msg = MESSAGES[lang] ?? MESSAGES.da;

  if (env.RATE_LIMITER) {
    try {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return { status: 429, error: msg.burst, retryAfter: 60 };
    } catch (err) {
      console.warn("rate limiter unavailable", err?.message);
    }
  }

  if (env.RITA_LIMITS) {
    const cap = Number(env.DAILY_LIMIT) || 500;
    const key = `day:${today()}`;
    try {
      const used = Number(await env.RITA_LIMITS.get(key)) || 0;
      if (used >= cap) return { status: 429, error: msg.daily, retryAfter: secondsToMidnightUtc() };
      const write = env.RITA_LIMITS.put(key, String(used + 1), { expirationTtl: 3 * 24 * 3600 });
      if (ctx?.waitUntil) ctx.waitUntil(write);
      else await write;
    } catch (err) {
      console.warn("daily limit unavailable", err?.message);
    }
  }

  return null;
}

function secondsToMidnightUtc() {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((midnight - now.getTime()) / 1000);
}
