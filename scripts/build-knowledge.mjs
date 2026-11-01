// Bygger worker/src/knowledge.json ud fra data/sources/*.md
// (husorden, GDPR og kontakt – Rita svarer kun ud fra disse)
// Kør: node scripts/build-knowledge.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chunks = [];

// Markdown-kilder: én chunk pr. "## "-overskrift
for (const file of readdirSync(join(root, "data/sources")).filter((f) => f.endsWith(".md"))) {
  const raw = readFileSync(join(root, "data/sources", file), "utf8");
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = Object.fromEntries(
    (fm ? fm[1] : "").split("\n").filter(Boolean).map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
  );
  const body = fm ? raw.slice(fm[0].length) : raw;
  const sections = body.split(/^## /m).filter((s) => s.trim());
  sections.forEach((sec, i) => {
    const [head, ...rest] = sec.split("\n");
    const own = rest.join("\n").match(/Side: (https?:\/\/\S+?)\.?\s/); // afsnit med egen side
    chunks.push({
      id: `${meta.type}-${i + 1}`,
      source: meta.type,
      sourceTitle: meta.title,
      title: head.trim(),
      url: own ? own[1] : meta.url,
      text: rest.join("\n").trim(),
    });
  });
}

writeFileSync(join(root, "worker/src/knowledge.json"), JSON.stringify(chunks, null, 1));
const bySource = chunks.reduce((a, c) => ((a[c.source] = (a[c.source] || 0) + 1), a), {});
console.log("Chunks:", chunks.length, bySource);
