// Bygger worker/src/knowledge.json ud fra data/sources/*.md og data/raw/lejeloven.txt
// Kør: node scripts/build-knowledge.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chunks = [];

// 1) Markdown-kilder: én chunk pr. "## "-overskrift
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

// 2) Lejeloven: én chunk pr. paragraf, med kapiteloverskrift som kontekst
const lawRaw = readFileSync(join(root, "data/raw/lejeloven.txt"), "utf8")
  .replace(/\f/g, "\n")
  .split("\n")
  .filter((l) => !/^LOV nr 341 af 22\/03\/2022\s*$/.test(l.trim()) && !/^\d{1,3}\s*$/.test(l.trim()))
  .join("\n");

const start = lawRaw.indexOf("Kapitel 1\n");
const lines = lawRaw.slice(start).split("\n");
let chapter = "";
let chapterTitle = "";
let subheading = "";
let cur = null;
const flush = () => {
  if (!cur) return;
  const text = cur.lines
    .join("\n")
    .replace(/([a-zæøå])-\n(?!og\b|eller\b)([a-zæøå])/g, "$1$2") // sammensæt orddelinger
    .replace(/\s+/g, " ")
    .trim();
  const MAX = 2400; // lange paragraffer deles
  for (let i = 0, part = 1; i < text.length; i += MAX, part++) {
    chunks.push({
      id: `lejeloven-${cur.num}${text.length > MAX ? "-" + part : ""}`,
      source: "lejeloven",
      sourceTitle: "Lejeloven (LOV nr. 341 af 22/03/2022)",
      title: `§ ${cur.num} – ${cur.chapterTitle}${cur.sub ? " / " + cur.sub : ""}`,
      url: `https://www.retsinformation.dk/eli/lta/2022/341#P${cur.num.replace(/\s/g, "")}`,
      text: text.slice(i, i + MAX),
    });
  }
  cur = null;
};
for (let i = 0; i < lines.length; i++) {
  const l = lines[i].trim();
  if (!l) continue;
  const ch = l.match(/^Kapitel (\d+)$/);
  if (ch) {
    flush();
    chapter = ch[1];
    chapterTitle = `Kapitel ${chapter}: ${(lines[i + 1] || "").trim()}`;
    i++;
    subheading = "";
    continue;
  }
  const p = l.match(/^§ (\d+(?: [a-z])?)\. (.*)$/);
  if (p) {
    flush();
    cur = { num: p[1], chapterTitle, sub: subheading, lines: [`§ ${p[1]}. ${p[2]}`] };
    continue;
  }
  // Korte linjer uden punktum mellem paragraffer er typisk mellemoverskrifter
  if (l.length < 70 && !/[.,;:]$/.test(l) && !/^Stk\./.test(l) && /^[A-ZÆØÅ]/.test(l) && cur && /[.:]$/.test(cur.lines.at(-1).trim())) {
    const next = (lines[i + 1] || "").trim();
    if (/^§ \d+/.test(next) || /^[A-ZÆØÅ]/.test(next)) {
      subheading = l;
      if (/^§ \d+/.test(next)) continue;
    }
  }
  if (cur) cur.lines.push(l);
  if (/^Givet på Christiansborg/.test(l)) break;
}
flush();

// Fjern underskrifts-støj i sidste paragraf
const last = chunks.at(-1);
if (last && last.source === "lejeloven") last.text = last.text.replace(/Givet på Christiansborg.*$/, "").trim();

writeFileSync(join(root, "worker/src/knowledge.json"), JSON.stringify(chunks));
const bySource = chunks.reduce((a, c) => ((a[c.source] = (a[c.source] || 0) + 1), a), {});
console.log("Chunks:", chunks.length, bySource);
