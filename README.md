# Rita – Rent Hernings chatbot

Rita er en dansk chatbot til [rentherning.dk](https://rentherning.dk). Den svarer kun på spørgsmål om at leje bolig hos Rent Herning, husordenen, lejeloven, Rent Hernings behandling af persondata og hvordan hjemmesiden og kontaktformularerne virker. Når et spørgsmål kræver en medarbejder, sender Rita brugeren videre til den rigtige kontaktformular med et forslag til beskeden, som automatisk bliver skrevet ind i formularens beskedfelt.

Hele løsningen kører på én Cloudflare Worker. Den serverer selve widget-scriptet, søger i en lille indbygget vidensbase og kalder Cloudflare Workers AI. Ved få henvendelser om dagen ligger det inden for Cloudflares gratis kvote. Hjemmesiden skal kun have tilføjet én linje:

```html
<script src="https://rita-robot.<konto>.workers.dev/rita.js" defer></script>
```

## Sådan hænger det sammen

```
 rentherning.dk                        Cloudflare Worker (rita-robot)
 ┌──────────────────┐   POST /api/chat  ┌──────────────────────────────────────┐
 │ rita.js          │ ────────────────▶ │ 1. BM25-søgning i knowledge.json     │
 │ (rund knap nede  │                   │ 2. Systemprompt + 6 bedste afsnit    │
 │  til højre)      │ ◀──────────────── │ 3. Workers AI (Llama 3.3 70B)        │
 └──────────────────┘  svar + kilder +  │ 4. [[FORMULAR:…]] → eskaleringskort  │
        │              evt. formular    └──────────────────────────────────────┘
        ▼ "Gå til formularen"
 contactSupperintented.php  ← Rita udfylder beskedfeltet (sessionStorage, samme domæne)
```

Vidensbasen bygges fra fire kilder. Husordenen og GDPR-fortegnelsen er hentet ordret fra PDF'erne på hjemmesiden, og formularernes tekster og feltnavne er aflæst direkte på siderne. Lejeloven er delt op i én bid pr. paragraf.

| Kilde | Fil | Afsnit | Opdateres ved |
|---|---|---|---|
| Hjemmeside og formularer | `data/sources/hjemmeside.md` | 9 | Ret teksten, kør build |
| Husorden | `data/sources/husorden.md` | 16 | Ny PDF på hjemmesiden |
| GDPR-fortegnelse | `data/sources/gdpr.md` | 10 | Ny PDF på hjemmesiden |
| Lejeloven (LOV nr. 341 af 2022) | `data/raw/lejeloven.txt` | 223 | Ny lovbekendtgørelse |

Eskaleringen følger hjemmesidens fem formularer. Akut bruges kun ved brand, vandskade og lignende. Viceværten får reparationer, 14 dags syn bruges til mangler efter indflytning, og Opsigelse og Forespørgsel dækker resten. Nævner brugeren brand eller vandskade, viser Workeren altid Akut-kortet, også hvis modellen glemmer det.

## Kom i gang

Du skal bruge Node 20+ og en gratis Cloudflare-konto.

```bash
cd worker
npm install
npm test                      # retrieval- og parser-tests (ingen konto nødvendig)
node dev/mock-server.mjs      # lokal demo med falsk AI: http://localhost:8787/demo.html
npx wrangler login
npm run deploy                # bygger vidensbasen og deployer
```

Efter deploy kan botten afprøves på `https://rita-robot.<konto>.workers.dev/demo.html`. Når den virker, skal scriptlinjen ovenfor ind lige før `</body>` på rentherning.dk. Siden er lavet af Simpelapps.dk, så det er formentlig dem, der skal indsætte den. Husk at tilføje eventuelle test-domæner i `ALLOWED_ORIGINS` i `worker/wrangler.toml`. Andre domæner får afvist deres kald.

## Skift sprogmodel

Workers AI er standard. Modellen skiftes med `MODEL` i `wrangler.toml` (fx `@cf/mistralai/mistral-small-3.1-24b-instruct` eller `@cf/google/gemma-3-12b-it`). Workeren kan også tale med enhver OpenAI-kompatibel API. Det gælder fx Claude, OpenAI eller en Hugging Face Inference Endpoint med en dansk model:

```toml
LLM_PROVIDER = "openai-compatible"
LLM_BASE_URL = "https://api.anthropic.com/v1"
LLM_MODEL    = "claude-haiku-4-5"
```

```bash
npx wrangler secret put LLM_API_KEY
```

En bemærkning om `mhenrichsen/danskgpt-tiny`: det er en lille model på omkring 1 mia. parametre. Den kan ikke køre direkte på Workers AI, og den er for lille til pålideligt at følge regler og citere lovtekst. Den skal i givet fald hostes som Hugging Face Endpoint og kobles på via variablerne ovenfor.

## Opdatering af vidensbasen

Ret markdown-filerne i `data/sources/`. Hvert `## `-afsnit bliver én søgbar bid. Kør derefter `npm run deploy`. Står der en linje `Side: https://…` i et afsnit, linker Rita til den side som kilde.

## Vigtige forbehold

Lejeloven i vidensbasen er den oprindelige LOV nr. 341 af 22/03/2022. Retsinformation har endnu ikke udgivet en samlet lovbekendtgørelse, og loven er ændret otte gange siden (senest LOV nr. 615 af 30/06/2026). Rita gør derfor opmærksom på at tjekke den gældende tekst ved tvivl. Når der kommer en ny lovbekendtgørelse, erstattes `data/raw/lejeloven.txt` med dens tekst (`pdftotext fil.pdf data/raw/lejeloven.txt`).

Husordenen henviser til paragrafnumre fra den tidligere lejelov (§ 27, § 83, § 93). Rita er instrueret i at citere lejeloven ud fra lovens egen tekst. Rent Herning bør overveje at opdatere husordenen.

Rita gemmer ingen samtaler på serveren. Samtalen ligger kun i brugerens browserfane (sessionStorage) og forsvinder, når fanen lukkes. Widgetten beder brugeren om ikke at skrive personoplysninger, og formularerne klarer alt personligt. Cloudflare Workers AI behandler teksten under Cloudflares databehandlervilkår. Det bør nævnes i Rent Hernings privatlivstekst, før botten går live.

## Mappestruktur

```
data/sources/*.md          håndskrevne/uddragne kilder (husorden, GDPR, hjemmeside)
data/raw/lejeloven.txt     lovtekst udtrukket fra retsinformation-PDF
scripts/build-knowledge.mjs  bygger worker/src/knowledge.json
worker/src/index.js        Worker: API, CORS, rate limit, modelkald
worker/src/retrieval.js    BM25-søgning med dansk stemming og synonymer
worker/src/prompt.js       systemprompt og formularer
worker/public/rita.js      widget (shadow DOM, ingen afhængigheder)
worker/public/demo.html    testside
worker/dev/mock-server.mjs lokal test uden Cloudflare
```
