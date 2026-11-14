# Lab Report Explainer

**Understand your lab report in plain language.**

Lab Report Explainer reads a patient's lab report, checks every result against the lab's own reference ranges, and explains it in simple words, with questions to ask the doctor. It never diagnoses, never guesses, and only ever uses the report that is open.

Built for **TechFusion '26 AI Hackathon, Challenge B: Medical Lab Report Explainer**.

| | |
|---|---|
| Live app | _add link_ |
| Demo video | _add link_ |

---

## Contents

1. [Features](#features)
2. [How it works](#how-it-works)
3. [Getting started](#getting-started)
4. [API](#api)
5. [Testing](#testing)
6. [Design decisions](#design-decisions)
7. [Known limitations](#known-limitations)
8. [Project structure](#project-structure)

---

## Features

### Reading results
- **Reads any report layout**: bullet lists, tables, `Test:` / `Result:` pairs and `->` arrows. Boilerplate text is ignored automatically.
- **Matches test names**: aliases from the lab glossary are recognised (SGPT = ALT, SGOT = AST, FBS = Fasting Blood Sugar, Hb, PLT, WBC).
- **Converts units**: values in other units are converted before comparison, and the working is shown (e.g. `6.0 mmol/L × 18 = 108 mg/dL`).
- **Picks the right range**: by test, age and sex. Values exactly on a limit count as normal, as the range sheet requires.

### Classifying results
Each result gets exactly one status:

| Status | Meaning |
|---|---|
| Normal | Inside the normal range |
| Low / High | Below or above the normal range |
| Urgent | At a dangerous level from the lab's urgent-values list |
| Needs info | Age or sex is missing, so the right range can't be chosen; the user is asked |
| Not classified | No range or no valid unit in the lab files, so it "cannot be classified from the files" |

### Explaining results
- **Plain-language explanations** a class 8 student can follow.
- **Urgent alert**: a clear "Please see a doctor today" banner for dangerous values.
- **3–5 doctor questions** based on the results that are not normal.
- **"How was this worked out?"**: a step-by-step breakdown for every result, with its source.
- **Visuals**: a range bar for each result, summary cards and a body overview.
- **Listen and print**: read results aloud, or print a summary for the doctor visit.

### Asking questions
- **Chat assistant** that answers questions about the open report, remembers the conversation and explains lab terms from the reference sheets.
- **Never diagnoses**: questions like "Do I have diabetes?" get an explanation of the relevant values and a referral to a doctor.
- **Stays on topic**: medicine, diet or unrelated questions are politely redirected.

### Safety and privacy
- **Patient lock**: questions about any other patient (by name, ID or "all patients") are blocked **in code, before any AI call**.
- **Verified AI text**: every AI answer is checked for invented numbers, diagnosis wording, contradictions with the computed result and reading level. Failing text is rewritten or replaced with a safe version.
- **Never guesses**: missing age or sex is requested, never inferred from a name.

### Using your own report
- Choose a built-in report from a searchable list, **upload** a `.md` / `.txt` / `.csv` file, or **paste** report text.
- Uploaded reports go through exactly the same pipeline and produce identical results.

### Reliability
- **Round-robin across free-tier models** to spread load over each model's quota, with automatic failover.
- Rate-limit cool-down, timeouts, retries and response caching.
- **Works without AI**: if every model is unavailable, results are still classified and explained with safe built-in wording.

---

## How it works

```
Report ──► Parser ──► Rule engine ──► Safety guard ──► AI writer ──► Verifier ──► Patient
```

| Step | What it does |
|---|---|
| **Parser** | Removes boilerplate and extracts demographics and results, keeping line numbers for citations. |
| **Rule engine** | Matches names, converts units, selects the range, applies the edge rule and urgent limits. Pure code, no AI. |
| **Safety guard** | Locks to one patient, asks for missing details and marks unknown tests as not classified. |
| **AI writer** | Turns the computed facts into simple sentences and doctor questions. It never decides a result. |
| **Verifier** | Rejects invented numbers, diagnoses, contradictions and hard wording, then asks for a rewrite or falls back to safe wording. |

The AI only words facts the rule engine has already worked out, so results are accurate and repeatable.

---

## Getting started

**Requirements:** Node.js 20+

```bash
npm install
cp .env.example .env.local    # add an API key (optional)
npm run dev                   # http://localhost:3000
```

**Environment variables** (all optional; without a key the app uses safe built-in wording):

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini free tier (primary) |
| `GROQ_API_KEY` | Groq (optional backup) |
| `OPENROUTER_API_KEY` | OpenRouter (optional backup) |
| `GEMINI_MODELS` | Override the model pool (comma-separated) |

**Deploy:** import the repository into Vercel and add `GEMINI_API_KEY`. The lab files in `data/` are bundled at build time.

---

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analyze` | Classify and explain a report |
| `POST` | `/api/chat` | Ask a question about a report |
| `GET` | `/api/patients` | List built-in reports (IDs and initials only) |
| `GET` | `/api/health` | Service status |
| `GET` | `/api/selftest` | Run the built-in test cases |

**Analyze a built-in report**

```json
POST /api/analyze
{ "patientId": "P004" }
```

**Analyze your own report**

```json
POST /api/analyze
{ "reportText": "Patient Full Name: ...\nRecorded Age: 40\n...", "age": 40, "sex": "Female" }
```

**Ask a question**

```json
POST /api/chat
{ "patientId": "P009", "question": "Why is my ALT high?", "history": [] }
```

All input is validated. Errors return a clear JSON message with the matching status code (`400`, `404`, `422`, `500`).

---

## Testing

```bash
npm test
```

- **89 automated tests**: every organizer report, boundary values, age limits, aliases, unit conversions, privacy, the verifier and upload parity.
- **Live self-test page** at `/tests`: runs 40 tricky cases against the real engine in the browser.

**Expected results for the organizer reports:**

| Report | Result |
|---|---|
| P001 | Hemoglobin normal · WBC normal |
| P002 | SGPT (ALT) 45 → normal: exactly on the female limit |
| P003 | Needs info: asks for age and sex |
| P004 | Hemoglobin 6.5 → **urgent** · Platelets low |
| P005 | 6.0 mmol/L → 108 mg/dL → high |
| P006 | Serum Ferritin → not classified (no range) |
| P007 | TSH normal |
| P008 | Urine pH normal · Protein normal |
| P009 | ALT high · AST high |
| P010 | Cholesterol 200 → normal: exactly on the limit |
| P011 | WBC high · Platelets low |
| P012 | Needs info: sex missing (AST range depends on it) |
| P013 | Fasting sugar 350 → **urgent** |
| P014 | FBS normal · SGOT (AST) normal |

---

## Design decisions

1. **Urgent limits include the threshold.** The urgent-values file says results that "hit or pass" a limit are urgent, so a hemoglobin of exactly 7.0 is urgent.
2. **Edge rule applies to every test.** It's stated in the hematology sheet, and the organizer example (cholesterol exactly 200) shows it applies everywhere.
3. **Only exact unit conversions.** The files give no conversion factors, so only mathematically exact ones are used: glucose ×18, cholesterol ×38.67, g/L→g/dL, ×10⁹/L→cells/mcL, µIU/mL = mIU/L. Anything else is not classified.
4. **Two extra labels.** "pH Level" and "Protein" in urine reports map to Urine pH and Urine Protein.
5. **Missing age or sex always asks.** Following lab safety rule 3, if either is missing the app says the right normal range cannot be chosen and asks for it, even for tests whose range is the same for all sexes. Urgent limits still apply, because they don't depend on age or sex.
6. **Age bands include their upper limit.** If two bands meet (e.g. 18–40 and 40–60), a 40-year-old uses 18–40, as the range sheet says.
7. **Test descriptions.** The lab files contain only names and ranges, so short general descriptions of what each test measures are included. They never name a disease.

---

## Known limitations

- Reference ranges cover ages **18–100** only; other ages can't be classified.
- **RBC** has an alias but no range, so it's always not classified.
- Units without an exact conversion (e.g. hemoglobin in mmol/L) aren't converted.
- **PDF and image reports** aren't supported; reports must be text.
- Very unusual layouts (e.g. value before the test name, multi-column tables) may not be read.
- Privacy detection covers names, IDs, MRNs and phrases such as "other patients". A disguised reference such as a nickname may slip through, but the AI never receives any other patient's data, so nothing can be revealed.
- The reading-level check is an estimate, not a guarantee.
- If every AI model is rate-limited, explanations use built-in wording: still correct, but less conversational.

---

## Project structure

```
data/                 Lab files (reports, ranges, urgent values, glossary, safety rules)
src/app/              Pages and API routes
src/components/       User interface
src/lib/data/         Report and reference-file parsers
src/lib/engine/       Name matching, unit conversion, classification
src/lib/guard/        Privacy and diagnosis guards
src/lib/llm/          Model routing, failover and caching
src/lib/explain/      Explanations and doctor questions
src/lib/chat/         Chat assistant
src/lib/verify/       Output verifier and reading-level check
src/lib/selftest/     Built-in test cases
tests/                Automated tests
```

**Stack:** Next.js 15 · TypeScript · Tailwind CSS · Zod · Vitest · Gemini (free tier)
