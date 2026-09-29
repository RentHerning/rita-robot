// Let BM25-søgning med simpel dansk stemming. Ingen eksterne afhængigheder,
// så vidensbasen kan ligge direkte i Workeren. Kan senere udskiftes med
// Cloudflare Vectorize + @cf/baai/bge-m3 embeddings.

const STOP = new Set(
  ("og i jeg det at en den til er som på de med han af for ikke der var mig sig men et har om vi min havde ham hun nu over da fra du ud sin dem os op man hans hvor eller hvad skal selv her alle vil blev kunne ind når være dog noget ville jo deres efter ned skulle denne end dette mit også under have dig anden hende mine alt meget sit sine vor mod disse hvis din nogle hos blive mange ad bliver hendes været thi jer sådan kan må får få hvem hvordan hvorfor hvornår mit mine jeres vores ja nej hej tak gerne bare lige").split(" ")
);

// Hverdagsord -> ord der står i kilderne
const SYNONYMS = {
  kæledyr: ["husdyr"], hund: ["husdyr"], kat: ["husdyr"], katte: ["husdyr"], hunde: ["husdyr"], dyr: ["husdyr"],
  indeklima: ["udluftning", "skimmelsvamp", "luftfugtighed"], fugt: ["skimmelsvamp", "luftfugtighed", "udluftning"],
  skimmel: ["skimmelsvamp"], mug: ["skimmelsvamp"], dug: ["skimmelsvamp", "udluftning"],
  larm: ["støj"], musik: ["støj"], fest: ["støj", "fester"], naboer: ["støj", "lejere"],
  flytte: ["opsigelse", "fraflytning"], udflytning: ["fraflytning", "opsigelse"], fraflytte: ["fraflytning"],
  opsige: ["opsigelse", "opsigelsesvarsel"], sige: ["opsigelse"],
  indflytning: ["14", "syn", "mangler"], indflyttet: ["14", "syn", "mangler"], mangel: ["mangler"],
  maling: ["vedligeholdelse", "maleristandsættelse"], male: ["vedligeholdelse", "maleristandsættelse"],
  vedligehold: ["vedligeholdelse"], reparation: ["vedligeholdelse", "vicevært"], repareret: ["vedligeholdelse", "vicevært"],
  itu: ["vicevært", "vedligeholdelse"], defekt: ["vicevært", "vedligeholdelse"], virker: ["vicevært"],
  vandhane: ["vicevært"], toilet: ["vicevært"], radiator: ["vicevært", "varme"],
  depositum: ["depositum", "fraflytning"], husleje: ["leje", "lejen"], huslejen: ["leje", "lejen", "lejeforhøjelse"],
  hæve: ["lejeforhøjelse", "regulering"], stige: ["lejeforhøjelse"], stiger: ["lejeforhøjelse"], forhøje: ["lejeforhøjelse"],
  forhøjelse: ["lejeforhøjelse"], huslejestigning: ["lejeforhøjelse", "varsling"], varsle: ["varsling"],
  fremleje: ["fremleje", "fremlejeren", "fremlejeforhold"], udleje: ["fremleje"], airbnb: ["fremleje", "udlejning"],
  persondata: ["personoplysninger", "gdpr"], data: ["personoplysninger"], privatliv: ["personoplysninger", "gdpr"],
  slette: ["sletning", "slettes"], gemme: ["sletning", "slettes"],
  ryge: ["rygning"], ryger: ["rygning"], cigaret: ["rygning"],
  cykel: ["cykler", "opgangen"], barnevogn: ["barnevogne"], skrald: ["affald"], storskrald: ["affald"],
  vasketøj: ["tøjtørring", "vaskerum"], tørre: ["tøjtørring"], tøj: ["tøjtørring"],
  akut: ["akut", "vandskade"], oversvømmelse: ["vandskade", "akut"], brand: ["akut", "brand"],
  bolig: ["lejemål", "lejlighed"], lejlighed: ["lejemål"], ledig: ["ledige", "boligportal"], ledige: ["boligportal"],
  kontakt: ["formular", "formularer"], formular: ["formularer"], hjemmesiden: ["hjemmesidens", "menu"],
  huslejenævn: ["huslejenævnet"], nøgle: ["nøgler", "låse"], lås: ["låse"],
};

const SUFFIXES = [
  "erendes", "erende", "hedens", "ethed", "erede", "heden", "heder", "endes", "ernes", "erens", "erets",
  "ered", "ende", "erne", "ener", "eres", "eren", "erer", "heds", "enes", "eret", "hed", "ene", "ere",
  "ens", "ers", "ets", "en", "er", "es", "et", "e", "s",
];
export function stem(w) {
  if (w.length <= 4) return w;
  for (const s of SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= 3) return w.slice(0, -s.length);
  }
  return w;
}

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-zæøåé0-9]+/g) || []).filter((t) => !STOP.has(t) && t.length > 1);
}

function expand(tokens) {
  const out = [...tokens];
  for (const t of tokens) if (SYNONYMS[t]) out.push(...SYNONYMS[t]);
  return out;
}

// Praktiske kilder vægtes over lovteksten, fordi de oftest besvarer lejernes spørgsmål direkte
const SOURCE_BOOST = { husorden: 1.7, hjemmeside: 1.5, gdpr: 1.2, lejeloven: 0.9 };

export class Index {
  constructor(chunks) {
    this.chunks = chunks;
    this.docs = chunks.map((c) => {
      const toks = [...tokenize(c.title), ...tokenize(c.title), ...tokenize(c.text)].map(stem);
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      return { tf, len: toks.length };
    });
    this.avgLen = this.docs.reduce((a, d) => a + d.len, 0) / this.docs.length;
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }

  search(query, k = 6) {
    const q = [...new Set(expand(tokenize(query)).map(stem))];
    const N = this.docs.length, k1 = 1.2, b = 0.75;
    const scored = this.docs.map((d, i) => {
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (N - this.df.get(t) + 0.5) / (this.df.get(t) + 0.5));
        s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen)));
      }
      // Direkte paragrafhenvisning, fx "§ 112"
      const para = query.match(/§\s*(\d+)/);
      if (para && this.chunks[i].id.startsWith(`lejeloven-${para[1]}`)) s += 20;
      return { i, s: s * (SOURCE_BOOST[this.chunks[i].source] || 1) };
    });
    return scored
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map((x) => ({ ...this.chunks[x.i], score: +x.s.toFixed(2) }));
  }
}
