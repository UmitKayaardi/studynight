# StudyNight — Progress

Resume rule: read `STUDYNIGHT_PLAN.md` (local only) and this file, run `git status` and `git log -5`, then continue
from the first unchecked step. Commit after every step.

## Phase 0 — Setup & verification
- [x] 0.1 Node/npm, gh, vercel, GROQ_API_KEY presence verified
- [x] 0.2 Groq models chosen, Groq data terms read, embedding model chosen (see DECISIONS.md)
- [x] 0.3 Scaffold: .gitignore, tooling, strict TS, Tailwind tokens, ESLint/Prettier, Vitest, Playwright, CI, checks
- [x] 0.4 Private GitHub repo created and pushed

## Phase 1 — Learning engine (`src/lib/learning/`)
- [ ] 1.1 Secure randomness + shuffle
- [ ] 1.2 FSRS wrapper + rating mapping
- [ ] 1.3 Mastery + adaptive difficulty
- [ ] 1.4 XP, levels, daily goal / active time
- [ ] 1.5 Streaks + freezes (time zones, DST)
- [ ] 1.6 Exam planner
- [ ] 1.7 Badges + session titles + predicted score band

## Phase 2 — Ingestion & retrieval
- [ ] 2.1 Shared text utils: normalisation, fuzzy match, answer checking
- [ ] 2.2 Extractors: TXT/MD/paste, DOCX, PPTX, PDF (worker), photos (resize → API)
- [ ] 2.3 Cleaning (headers/footers, hyphenation), language detection
- [ ] 2.4 Chunker (+ property tests)
- [ ] 2.5 BM25
- [ ] 2.6 Embeddings worker + vector store + hybrid RRF

## Phase 3 — API functions
- [ ] 3.1 Shared API schemas, error shape, Groq client (timeouts, back-off, fallback), abuse guard
- [ ] 3.2 /api/health, /api/topics
- [ ] 3.3 /api/questions (generation + deterministic checks + verifier)
- [ ] 3.4 /api/grade, /api/ask
- [ ] 3.5 /api/read-image, /api/transcribe
- [ ] 3.6 One live call per endpoint locally

## Phase 4 — Data layer
- [ ] 4.1 Dexie schema + migrations + tests
- [ ] 4.2 Repositories (decks, questions, reviews, sessions, profile, settings)
- [ ] 4.3 Backup export/import, delete-all, storage persistence/quota

## Phase 5 — Design system & shell
- [ ] 5.1 Primitives (buttons, cards, sheets, toasts, rings), icons
- [ ] 5.2 Mascot (6 expressions), logo, avatars, badge art
- [ ] 5.3 i18n runtime, fonts per script, RTL, theme, router, bottom tabs, error boundary
- [ ] 5.4 Sounds, haptics, reduced motion

## Phase 6 — Core flow
- [ ] 6.1 Onboarding
- [ ] 6.2 Home
- [ ] 6.3 Create deck + processing pipeline
- [ ] 6.4 Deck page + topic map + settings
- [ ] 6.5 Play screen + all question kinds
- [ ] 6.6 Feedback, source sheet, report/undo, hints
- [ ] 6.7 Results

## Phase 7 — Modes & engagement
- [ ] 7.1 Quick play, topic practice, review due
- [ ] 7.2 Boss battle
- [ ] 7.3 Exam mode + report
- [ ] 7.4 Sudden death, flashcards swipe
- [ ] 7.5 XP/levels/streaks/badges wiring, session titles, share cards

## Phase 8 — AI features
- [ ] 8.1 Ask your notes
- [ ] 8.2 Explain answers (typed + voice)
- [ ] 8.3 Figure questions
- [ ] 8.4 Challenge links

## Phase 9 — Profile & planner
- [ ] 9.1 Profile, stats, streak calendar, badges
- [ ] 9.2 Exam planner + .ics
- [ ] 9.3 Settings, Smart search management, backup UI, delete-all UI
- [ ] 9.4 Review tab + forecast

## Phase 10 — Languages
- [ ] 10.1 Translate all 21 languages
- [ ] 10.2 Language sweep (Playwright) + runtime switch test, fix overflows

## Phase 11 — Legal, PWA, a11y, security, errors, samples
- [ ] 11.1 Privacy, Terms, Licences, About pages + docs/LEGAL.md + THIRD_PARTY_NOTICES.md
- [ ] 11.2 PWA (manifest, icons, offline, update toast), security headers (vercel.json)
- [ ] 11.3 Error states audit + accessibility audit
- [ ] 11.4 Sample decks written, generated, reviewed, shipped

## Phase 12 — Benchmark
- [ ] 12.1 Dataset (notes + qa.json)
- [ ] 12.2 Runner + runs + docs/BENCHMARK.md

## Phase 13 — E2E, performance, docs, deploy
- [ ] 13.1 Playwright E2E suite
- [ ] 13.2 Performance budget
- [ ] 13.3 Screenshots
- [ ] 13.4 Docs (README, ARCHITECTURE, PLAY_STORE, CHANGELOG …)
- [ ] 13.5 Deploy to Vercel + smoke test + store assets
- [ ] 13.6 Final full re-run

## Phase 14 — Final report
- [ ] 14.1 FINAL_REPORT.md

Next: 1.3 mastery + adaptive difficulty.

Known issues: none yet.
