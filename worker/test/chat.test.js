import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Index } from "../src/retrieval.js";
import { parseReply, sanitizeMessages } from "../src/util.js";

const knowledge = JSON.parse(readFileSync(new URL("../src/knowledge.json", import.meta.url)));
const index = new Index(knowledge);

// Spørgsmål -> kilde der skal være blandt top 3
const CASES = [
  ["Hvem står for indvendig vedligehold?", ["hjemmeside-9", "lejeloven-112"]],
  ["Hvordan forbedrer man indeklimaet?", ["husorden-16"]],
  ["Må jeg have en hund?", ["husorden-10"]],
  ["Hvor lang opsigelse har jeg?", ["hjemmeside-8"]],
  ["Jeg har fundet fejl efter indflytning", ["hjemmeside-7"]],
  ["Hvor længe gemmer I mine oplysninger?", ["gdpr-6"]],
  ["Hvordan søger jeg en ledig lejlighed?", ["hjemmeside-3"]],
  ["Min vandhane drypper", ["hjemmeside-5"]],
  ["Hvornår skal der være ro?", ["husorden-7"]],
  ["Må jeg fremleje et værelse?", ["lejeloven-157"]],
  ["Må jeg tørre tøj i lejligheden?", ["husorden-4", "husorden-16"]],
  ["Hvad siger § 112?", ["lejeloven-112"]],
];
for (const [q, expected] of CASES) {
  test(`retrieval: ${q}`, () => {
    const top = index.search(q, 3).map((h) => h.id);
    assert.ok(expected.some((e) => top.includes(e)), `forventede ${expected} i ${top}`);
  });
}

test("parseReply trækker eskalering ud", () => {
  const r = parseReply("Det skal viceværten se på.\n[[FORMULAR:vicevaert|Min vandhane i køkkenet drypper.]]");
  assert.equal(r.reply, "Det skal viceværten se på.");
  assert.equal(r.form.code, "vicevaert");
  assert.match(r.form.url, /contactSupperintented/);
  assert.equal(r.form.message, "Min vandhane i køkkenet drypper.");
});

test("parseReply accepterer ø i kode og ignorerer ukendte koder", () => {
  assert.equal(parseReply("x [[FORMULAR:forespørgsel|hej]]").form.code, "forespoergsel");
  assert.equal(parseReply("x [[FORMULAR:hacker|hej]]").form, null);
});

test("sanitizeMessages afviser ugyldigt input og begrænser længde", () => {
  assert.equal(sanitizeMessages("nej"), null);
  assert.equal(sanitizeMessages([{ role: "assistant", content: "hej" }]), null);
  const long = sanitizeMessages([{ role: "system", content: "hack" }, { role: "user", content: "a".repeat(5000) }]);
  assert.equal(long.length, 1);
  assert.equal(long[0].content.length, 1000);
});
