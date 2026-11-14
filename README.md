# LabLens: a glass-box lab report explainer

**TechFusion '26 AI Hackathon · Challenge B (Medical Lab Report Explainer)**

> Every result is **computed** by exact rules, **cited** to the lab's own files, and **checked** before a patient reads it.

- Live app: _add Vercel link_
- Demo video: _add link_

---

## The idea

The CityLab files are about 95% boilerplate (HIPAA, CLIA, QA appendices). The real data is a few short lines. A plain "embed and ask the LLM" RAG can grab the wrong paragraph, mis-convert units or guess a range. LabLens splits the job:

```
 data/*.md ──► 1. Noise-proof parser ──► 2. Rule engine (TypeScript, no AI)
                (drops appendices &       alias → unit conversion → range by age/sex
                 long boilerplate,        → edge rule → urgent check → evidence trail
                 keeps line numbers)                 │
                                                     ▼
                                 3. Guard: patient lock · ask for missing age/sex
                                           · "cannot be classified from the files"
                                                     ▼
                                 4. AI writer: simple words from the facts only
                                                     ▼
                                 5. Verifier: numbers match? no diagnosis? agrees
                                    with the engine? reading grade ≤ 8?
                                    ✕ → rewrite once → safe template fallback
```

**The AI never decides a result.** It only words facts the engine has already proven, and the verifier blocks anything it adds.

## Features

| | |
|---|---|
| **Exact classification** | Normal / Low / High / Urgent / Needs info / Cannot be classified, with the range sheets' edge rule (a value exactly on a limit is normal) and inclusive age bands |
| **Name & unit matching** | Glossary aliases (SGPT→ALT, SGOT→AST, FBS, Hb, PLT, WBC). Exact conversions with the working shown, e.g. `6.0 mmol/L × 18 = 108 mg/dL` |
| **"Why?" panel** | Every result shows each step with `file:line` citations |
| **Never guesses** | Missing age or sex → asks (not even a guess from the name). Unknown test or unit → "cannot be classified from the files" |
| **Urgent warnings** | Red banner + "Please see a doctor today". Urgent still fires when age or sex is missing |
| **Privacy lock** | Questions naming another patient (name, ID, MRN, "all patients") are refused **in code, before any AI call** (safety rule 1) |
| **Verified AI text** | Rejects invented numbers, diagnosis wording, contradictions with the engine and text above class 8 reading level |
| **Reliability** | **Round-robin across fast free-tier models** (Gemini 3.5 Flash Lite → 3.1 Flash Lite → 3 Flash → …) to spread load over each model's quota; on failure the next model is tried, then Groq / OpenRouter if keys exist. 429 cool-down with `retry-after`, backoff, timeouts, response cache, and a fully working **no-AI template mode** |
| **Body map** | Organs coloured by their worst result |
| **Doctor questions** | 3–5 questions based on the results that are not normal, plus a printable doctor visit sheet |
| **Paste any report** | Works on new reports in any of the corpus formats (bullets, tables, `Test:/Result:` pairs, `->` arrows) |
| **Live self-test** | `/tests` runs 40 tricky cases against the real engine |
| **Read aloud** | Browser speech, no extra API |

## API

| Method | Path | Body / notes |
|---|---|---|
| POST | `/api/analyze` | `{ "patientId": "P004" }` or `{ "reportText": "...", "age"?: 40, "sex"?: "Female", "useAI"?: false }` |
| POST | `/api/chat` | same, plus `"question": "..."` (locked to that one patient) |
| GET | `/api/patients` | report list (IDs + initials only) |
| GET | `/api/health` | corpus counts + AI provider status |
| GET | `/api/selftest` | runs the self-test suite as JSON |

Input is validated with zod. Errors return clear JSON messages with the right status code (400 / 404 / 422 / 500).

## Run locally

```bash
npm install
cp .env.example .env.local   # add at least one key (or none: template mode)
npm run dev                  # http://localhost:3000
npm test                     # 72 unit tests
```

Deployed on Vercel. The corpus in `data/` is bundled at build time by `scripts/build-corpus.mjs`, so there are no file-system reads at runtime.

## Decisions & assumptions (from reading the files)

1. **Urgent limits are inclusive.** The directive says results that "hit or pass" a threshold are urgent, while its table says "Less than / Greater than". We follow "hit or pass" (safer): Hb exactly 7.0 is urgent.
2. **Edge rule applies everywhere.** It's written in the hematology sheet. The corpus README's example (cholesterol exactly 200) shows it applies to all tests.
3. **Unit conversions.** The files give no factors, so we only use mathematically exact ones: glucose ×18 and cholesterol ×38.67 (molar mass), g/L→g/dL, ×10⁹/L→cells/mcL, µIU/mL = mIU/L. Anything else → "cannot be classified".
4. **Extra report labels.** "pH Level" → Urine pH and "Protein" → Urine Protein (urine report). Not in the glossary; listed in `src/lib/engine/aliases.ts`.
5. **Plain-language descriptions** of what each test measures are short general-health sentences (`src/lib/explain/testInfo.ts`), because the lab files contain only names, ranges and limits. They never state a disease.

## Known failure cases

- **Ages outside 18–100** cannot be classified, because the range sheets only cover adults.
- **RBC** has an alias but no range, so it's always "cannot be classified".
- **Units we don't know exactly** (e.g. hemoglobin in mmol/L, which needs a specific factor) are not converted.
- **Free-form scanned/PDF reports** aren't supported. Input must be text (paste works for any of the corpus layouts).
- **Very unusual report layouts** (e.g. value before the test name, results across multiple columns) may not be parsed.
- **Privacy detection** checks names, IDs, MRNs and phrases such as "other patients". A cleverly disguised question about another person (e.g. only a nickname) could get past the name check. Even then, the AI only ever receives the open patient's data, so it cannot reveal anything else.
- **Reading level** is a heuristic (Flesch-Kincaid with test names excluded), not a guarantee.
- **AI rate limits:** if every provider is rate-limited, explanations fall back to rule-based templates (still correct, less natural).
- **Chat** answers only from the open report. General medical questions get "The lab files do not cover this question."

## Project layout

```
src/lib/data/       parser for reports + reference sheets (noise removal, line numbers)
src/lib/engine/     aliases, units, classification (pure, tested)
src/lib/guard/      privacy lock, diagnosis-question detection
src/lib/llm/        provider router (fallback, backoff, cache)
src/lib/explain/    AI writer + safe templates
src/lib/verify/     verifier + readability
src/lib/selftest/   live self-test cases
src/app/api/        analyze, chat, patients, health, selftest
src/components/     UI
tests/              vitest suites
```
