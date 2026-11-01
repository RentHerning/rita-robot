import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Index } from "../src/retrieval.js";
import { parseReply, sanitizeMessages } from "../src/util.js";
import { buildContext } from "../src/prompt.js";
import { handleChat } from "../src/index.js";

const knowledge = JSON.parse(readFileSync(new URL("../src/knowledge.json", import.meta.url)));
const index = new Index(knowledge);

test("vidensbasen indeholder kun husorden, GDPR og kontakt", () => {
  assert.deepEqual([...new Set(knowledge.map((c) => c.source))].sort(), ["gdpr", "husorden", "kontakt"]);
});

test("hele vidensbasen kommer med i konteksten, husordenen først", () => {
  const ctx = buildContext(knowledge);
  assert.match(ctx.split("\n")[0], /HUSORDENEN/);
  for (const c of knowledge) assert.ok(ctx.includes(c.title), `mangler ${c.title}`);
  assert.ok(ctx.length < 30000, "konteksten skal holde sig lille");
});

// Kildelinks: spørgsmål -> afsnit der skal være blandt top 3 (dansk og engelsk)
const CASES = [
  ["Må jeg have en hund?", ["husorden-10"]],
  ["Can I have a cat?", ["husorden-10"]],
  ["Hvornår skal der være ro?", ["husorden-7"]],
  ["Is it ok to have a party?", ["husorden-7"]],
  ["Må jeg ryge i lejligheden?", ["husorden-15"]],
  ["Can I smoke on the balcony?", ["husorden-15"]],
  ["Hvordan forbedrer man indeklimaet?", ["husorden-16"]],
  ["How do I avoid mould?", ["husorden-16"]],
  ["Hvor længe gemmer I mine oplysninger?", ["gdpr-6"]],
  ["How long do you keep my personal data?", ["gdpr-6"]],
  ["Min vandhane drypper", ["kontakt-4"]],
  ["Hvor lang opsigelse har jeg?", ["kontakt-6"]],
  ["Jeg har fundet fejl efter indflytning", ["kontakt-5"]],
];
for (const [q, expected] of CASES) {
  test(`søgning: ${q}`, () => {
    const top = index.search(q, 3).map((h) => h.id);
    assert.ok(expected.some((e) => top.includes(e)), `forventede ${expected} i ${top}`);
  });
}

test("parseReply trækker hjælpekortet ud", () => {
  const r = parseReply("Det skal viceværten se på.\n[[HJÆLP:vicevaert|Min vandhane i køkkenet drypper.]]");
  assert.equal(r.reply, "Det skal viceværten se på.");
  assert.deepEqual(r.help, { code: "vicevaert", message: "Min vandhane i køkkenet drypper." });
});

test("parseReply forstår gamle koder og ignorerer ukendte", () => {
  assert.equal(parseReply("x [[FORMULAR:forespørgsel|hej]]").help.code, "andet");
  assert.equal(parseReply("x [[HJAELP:syn14|hej]]").help.code, "syn");
  assert.equal(parseReply("x [[HJÆLP:hacker|hej]]").help, null);
  assert.equal(parseReply("x [[HJÆLP:boliger|-]]").help.message, "");
});

test("sanitizeMessages afviser ugyldigt input og begrænser længde", () => {
  assert.equal(sanitizeMessages("nej"), null);
  assert.equal(sanitizeMessages([{ role: "assistant", content: "hej" }]), null);
  const long = sanitizeMessages([{ role: "system", content: "hack" }, { role: "user", content: "a".repeat(5000) }]);
  assert.equal(long.length, 1);
  assert.equal(long[0].content.length, 1000);
});

// handleChat med en falsk model
const fakeEnv = (reply) => ({ AI: { run: async () => ({ response: reply }) } });
const ask = (q, reply = "Svar.") => handleChat({ messages: [{ role: "user", content: q }] }, fakeEnv(reply));

test("akut-kortet vises altid ved brand eller vandskade", async () => {
  assert.equal((await ask("Der er vandskade i køkkenet")).data.help.code, "akut");
  assert.equal((await ask("There is water damage in my bathroom")).data.help.code, "akut");
});

test("'fire' (= 4) og 'smoke' udløser ikke akut", async () => {
  assert.equal((await ask("Har I en lejlighed med fire værelser?")).data.help, null);
  assert.equal((await ask("Can I smoke on the balcony?")).data.help, null);
});

test("modellen får hele vidensbasen", async () => {
  let system = "";
  await handleChat({ messages: [{ role: "user", content: "hej" }] }, { AI: { run: async (m, { messages }) => ((system = messages[0].content), { response: "ok" }) } });
  assert.match(system, /KONTEKST:/);
  assert.match(system, /Husdyr/);
  assert.match(system, /Sletning/);
  assert.match(system, /Akut skade/);
});
