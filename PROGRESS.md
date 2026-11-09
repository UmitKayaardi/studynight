# StudyNight — Progress

Resume rule: read `STUDYNIGHT_PLAN.md` (local only) and this file, run `git status` and `git log -5`, then continue
from the first unchecked step. Commit after every step.

## Phase 0 — Setup & verification
- [x] 0.1 Node/npm, gh, vercel, GROQ_API_KEY presence verified
- [x] 0.2 Groq models chosen, Groq data terms read, embedding model chosen (see DECISIONS.md)
- [x] 0.3 Scaffold: .gitignore, tooling, strict TS, Tailwind tokens, ESLint/Prettier, Vitest, Playwright, CI, checks
- [x] 0.4 Private GitHub repo created and pushed

## Phase 1 — Learning engine (`src/lib/learning/`)
- [x] 1.1 Secure randomness + shuffle
- [x] 1.2 FSRS wrapper + rating mapping
- [x] 1.3 Mastery + adaptive difficulty
- [x] 1.4 XP, levels, daily goal / active time
- [x] 1.5 Streaks + freezes (time zones, DST)
- [x] 1.6 Exam planner
- [x] 1.7 Badges + session titles + predicted score band

## Phase 2 — Ingestion & retrieval
- [x] 2.1 Shared text utils: normalisation, fuzzy match, answer checking
- [x] 2.2 Extractors: TXT/MD/paste, DOCX, PPTX, PDF (worker), photos (resize → API)
- [x] 2.3 Cleaning (headers/footers, hyphenation), language detection
- [x] 2.4 Chunker (+ property tests)
- [x] 2.5 BM25
- [x] 2.6 Embeddings worker + vector store + hybrid RRF

## Phase 3 — API functions
- [x] 3.1 Shared API schemas, error shape, Groq client (timeouts, back-off, fallback), abuse guard
- [x] 3.2 /api/health, /api/topics
- [x] 3.3 /api/questions (generation + deterministic checks + verifier)
- [x] 3.4 /api/grade, /api/ask
- [x] 3.5 /api/read-image, /api/transcribe
- [x] 3.6 One live call per endpoint locally

## Phase 4 — Data layer
- [x] 4.1 Dexie schema + migrations + tests
- [x] 4.2 Repositories (decks, questions, reviews, sessions, profile, settings)
- [x] 4.3 Backup export/import, delete-all, storage persistence/quota

## Phase 5 — Design system & shell
- [x] 5.1 Primitives (buttons, cards, sheets, toasts, rings), icons
- [x] 5.2 Mascot (6 expressions), logo, avatars, badge art
- [x] 5.3 i18n runtime, fonts per script, RTL, theme, router, bottom tabs, error boundary
- [x] 5.4 Sounds, haptics, reduced motion

## Phase 6 — Core flow
- [x] 6.1 Onboarding
- [x] 6.2 Home
- [x] 6.3 Create deck + processing pipeline
- [x] 6.4 Deck page + topic map + settings
- [x] 6.5 Play screen + all question kinds
- [x] 6.6 Feedback, source sheet, report/undo, hints
- [x] 6.7 Results

## Phase 7 — Modes & engagement
- [x] 7.1 Quick play, topic practice, review due
- [x] 7.2 Boss battle
- [x] 7.3 Exam mode + report
- [x] 7.4 Sudden death, flashcards swipe
- [x] 7.5 XP/levels/streaks/badges wiring, session titles, share cards

## Phase 8 — AI features
- [x] 8.1 Ask your notes
- [x] 8.2 Explain answers (typed + voice)
- [x] 8.3 Figure questions
- [x] 8.4 Challenge links

## Phase 9 — Profile & planner
- [x] 9.1 Profile, stats, streak calendar, badges
- [x] 9.2 Exam planner + .ics
- [x] 9.3 Settings, Smart search management, backup UI, delete-all UI
- [x] 9.4 Review tab + forecast

## Phase 10 — Languages
- [ ] 10.1 Translate all 21 languages
- [ ] 10.2 Language sweep (Playwright) + runtime switch test, fix overflows

## Phase 11 — Legal, PWA, a11y, security, errors, samples
- [x] 11.1 Privacy, Terms, Licences, About pages + docs/LEGAL.md + THIRD_PARTY_NOTICES.md
- [x] 11.2 PWA (manifest, icons, offline, update toast), security headers (vercel.json)
- [ ] 11.3 Error states audit + accessibility audit
- [ ] 11.4 Sample decks written, generated, reviewed, shipped

## Phase 12 — Benchmark
- [x] 12.1 Dataset (notes + qa.json)
- [ ] 12.2 Runner + runs + docs/BENCHMARK.md

## Phase 13 — E2E, performance, docs, deploy
- [x] 13.1 Playwright E2E suite
- [ ] 13.2 Performance budget
- [ ] 13.3 Screenshots
- [ ] 13.4 Docs (README, ARCHITECTURE, PLAY_STORE, CHANGELOG …)
- [ ] 13.5 Deploy to Vercel + smoke test + store assets
- [ ] 13.6 Final full re-run

## Phase 14 — Final report
- [ ] 14.1 FINAL_REPORT.md

Next: When Groq quota allows: (1) finish translations (scripts/translate.mjs, then check:i18n + full i18n sweep), (2) sample decks vaccines/machine-learning/personal-finance/ciclo-del-agua → review in samples/review.json → apply-sample-review, (3) benchmark stages generate, figure, judge, ask, explain, latency, then manual review + summary + docs/BENCHMARK.md, (4) store description translations + store screenshots, (5) README, (6) redeploy + smoke-live, (7) Phase 13.6 full re-run, (8) FINAL_REPORT.md. Live: https://studynight-sable.vercel.app

Known issues:
- Locale files are mid-translation (CI i18n check fails until step (1) above is done). Do not push before it passes.
- Phases 7-9 code is written and typechecks; only quick play was browser-tested end to end (pasted notes to playable deck in ~7 s with the live API). Other modes need a browser test.
- PWA plugin + update toast added in vite.config.ts but production build not yet verified.
- Sample builder: an earlier JSON-mode 400 was fixed (repair of failed_generation + LaTeX escapes); generator prompts were tightened afterwards, so decks built before that change need careful manual review.
