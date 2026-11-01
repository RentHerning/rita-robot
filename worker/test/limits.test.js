import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLimits } from "../src/limits.js";
import worker from "../src/index.js";

const req = (ip = "1.2.3.4") => new Request("https://rita.test/api/chat", { headers: { "CF-Connecting-IP": ip } });

function fakeLimiter(max) {
  const seen = new Map();
  return { limit: async ({ key }) => { seen.set(key, (seen.get(key) || 0) + 1); return { success: seen.get(key) <= max }; } };
}
function fakeKV() {
  const store = new Map();
  return { store, get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
}

test("lag 1: stopper en enkelt besøgende efter grænsen, andre kan fortsætte", async () => {
  const env = { RATE_LIMITER: fakeLimiter(2) };
  assert.equal(await checkLimits(req("a"), env), null);
  assert.equal(await checkLimits(req("a"), env), null);
  const third = await checkLimits(req("a"), env);
  assert.equal(third.status, 429);
  assert.match(third.error, /mange beskeder/);
  assert.equal(await checkLimits(req("b"), env), null);
});

test("lag 2: dagligt loft for alle tilsammen, kun ét tal gemmes", async () => {
  const kv = fakeKV();
  const env = { RITA_LIMITS: kv, DAILY_LIMIT: "3" };
  for (const ip of ["a", "b", "c"]) assert.equal(await checkLimits(req(ip), env), null);
  const over = await checkLimits(req("d"), env, undefined, "en");
  assert.equal(over.status, 429);
  assert.match(over.error, /taking a break until tomorrow/);
  assert.ok(over.retryAfter > 0 && over.retryAfter <= 86400);
  assert.deepEqual([...kv.store.keys()].map((k) => k.replace(/\d{4}-\d{2}-\d{2}/, "DATE")), ["day:DATE"]);
});

test("fejler åbent: Rita svarer, selvom limiter eller KV fejler", async () => {
  const env = {
    RATE_LIMITER: { limit: async () => { throw new Error("down"); } },
    RITA_LIMITS: { get: async () => { throw new Error("down"); }, put: async () => {} },
  };
  assert.equal(await checkLimits(req(), env), null);
});

test("uden bindings (lokal udvikling) er der ingen grænser", async () => {
  assert.equal(await checkLimits(req(), {}), null);
});

test("Workeren svarer 429 med Retry-After, når grænsen er nået", async () => {
  const env = {
    ALLOWED_ORIGINS: "https://rentherning.dk",
    RATE_LIMITER: fakeLimiter(0),
    AI: { run: async () => ({ response: "ok" }) },
  };
  const r = await worker.fetch(
    new Request("https://rita.test/api/chat", {
      method: "POST",
      headers: { Origin: "https://rentherning.dk", "Content-Type": "application/json", "CF-Connecting-IP": "9.9.9.9" },
      body: JSON.stringify({ lang: "en", messages: [{ role: "user", content: "hi" }] }),
    }),
    env,
    { waitUntil() {} },
  );
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "60");
  assert.match((await r.json()).error, /a lot of messages/);
});
