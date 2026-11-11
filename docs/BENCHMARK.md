# StudyNight benchmark

This document reports how well StudyNight's AI pipeline works on a small, original benchmark: how good the generated
questions are, how well search finds the right part of the notes, how well "Ask your notes" answers and refuses, how
well free-text answers are graded, and how long it takes to get from a document to a playable quiz.

All numbers come from `benchmarks/run.ts` and are stored in `benchmarks/results/` (one JSON file per stage plus
`summary.json`). They were measured on 9–10 November 2026 with the models the live app uses.

| Role | Model (Groq free tier) |
| --- | --- |
| Question writer, Ask | `openai/gpt-oss-120b` (fallback `openai/gpt-oss-20b`) |
| Question verifier, grading of written answers, and the benchmark's judge | `qwen/qwen3.8-27b`, temperature 0 |
| Search embeddings (in the browser) | `Xenova/multilingual-e5-small` (8-bit) |

## The dataset

- **10 original documents in 5 languages** (`benchmarks/notes/`): English (plate tectonics, the printing press, Python
  lists, quadratic equations, a slide-style marketing lecture, supply and demand with a described figure), Turkish
  (earthquakes), Spanish (renewable energy), Arabic (the life cycle of stars) and Japanese (light). They were written
  for this project and use no copyrighted material. Four of the sample-deck notes are added to the search corpus to
  make retrieval harder (14 documents, 50 chunks).
- **60 labelled search questions** (`benchmarks/qa.json`), each with the text snippet that must be found; 17 of them
  are asked in a different language from the notes (for example an English question about the Japanese notes).
- **10 questions the notes cannot answer**, to test refusals.
- **34 labelled free-text answers** (`benchmarks/explain.json`) to explain-questions, with 102 "covered / not covered"
  labels on their key points.

**Who labelled and reviewed.** The documents, questions and labels, the review of the generated questions in section 1
and the reviews of the sample decks were all done by the AI coding assistant that built this project (Claude Code,
an Anthropic model), with at most a spot check by the author. No independent human reviewer was involved. The
assistant is a different model from the ones the app uses (gpt-oss and Qwen), but it is still an AI, and it also
wrote the code under test. Below, "assistant review" means this review. This is a small, synthetic dataset: treat the
numbers as a sanity check of the pipeline, not as a precise or independent measurement.

## Results at a glance

| What | Result |
| --- | --- |
| Generated questions with a correct answer key (assistant review) | **95%** (97 of 102) |
| Generated questions with no flaw at all (assistant review) | **91%** (93 of 102) |
| Drafts that pass the app's own checks | 90% (88 of 98); figure questions 93% (14 of 15) |
| Evidence quote really found in the notes | 100% of accepted questions |
| Search finds the right passage in the top 5 (recall@5) | 85% overall; 98% same language; 53% across languages |
| Ask: answerable questions answered with a correct citation | 100% (26 of 26) |
| Ask: unanswerable questions refused | 100% (10 of 10) |
| Grading of free-text answers agrees with the reference labels | 98% of key points; 100% of overall levels |
| From a 14-page document to the first playable questions | 7.7 s (one run) |
| Lighthouse, mobile (performance / accessibility / best practices / SEO) | 92 / 98 / 96 / 100 |

## 1. Question quality

**Method.** For each benchmark document the app's own pipeline builds the topic map, then generates one round of
questions for up to two topics (`generate` stage). Every accepted question was then read next to its notes by the
AI assistant (`benchmarks/results/manual-review.json`), and separately judged by the Qwen model, which comes from a different model
family from the question writer (`judge` stage).

**Pipeline checks.** 98 questions were drafted and 88 accepted (90%). Rejections: 7 failed the schema, 2 failed a
structure check, 1 was rejected by the verifier, 0 were duplicates, and 0 had an evidence quote that could not be found
in the notes. Of the accepted questions, 100% had an evidence quote that matches the notes (fuzzy match ≥ 0.9).

**Assistant review (88 text questions + 14 figure questions).**

- 85 of 88 text questions (96.6%) had a correct answer key, and 81 (92.0%) had no flaw at all.
- 12 of 14 figure questions (85.7%) were correct and flawless.
- Overall: 97 of 102 answer keys correct (95.1%); 93 of 102 with no flaw at all (91.2%).
- The problems found:
  - one multiple-choice question offered the same answer twice (the Arabic word for supernova and its transliteration);
  - one true/false statement could not be decided from the notes, and one correction went beyond the notes;
  - one correction was wrong, although the answer itself was right (it said all earthquake waves travel through
    liquids, but the notes say S waves travel only through solids);
  - three fill-in answers would read awkwardly in the blank (for example the answer repeated the word after it);
  - two figure questions: one had two right answers, one asked about something the figure description does not show.
- 5 near-duplicates (the same fact asked as two different question types) got past the duplicate filter, which only
  compares questions of similar wording.

**LLM judge.** The Qwen judge marked 100% of the questions correct and 98.9% grounded (it flagged only the term
"critical angle", which the notes describe but do not name). It was clearly more lenient than the assistant review:
it missed all five answer-key problems listed above. The same pattern appeared while reviewing the sample decks,
where the verifier accepted a step-ordering question with two steps the wrong way round. This is why the app also
lets learners report a question with one tap, and why the shipped sample decks were all reviewed question by question
before shipping (`samples/review.json`).

**Caveat.** This run used one generation round per topic, which asks for multiple-choice, true/false, fill-in and
flashcard questions only. Match, order and explain questions (made in later rounds) were reviewed in the six sample
decks instead: of the 140 questions generated for them, the assistant removed 16 and corrected 18 before shipping
(124 shipped; the Turkish deck's corrections were made before the review file existed and are not counted).

## 2. Figure questions

The `figure` stage generates questions from the described figure in the supply-and-demand notes. 14 of 15 drafts were
accepted (93%) and all 14 were linked to the figure. The assistant review found 12 of 14 correct and flawless.

**Decision:** figure questions stay **on** by default (Settings can turn them off). They are a small share of each deck
(at most one round in three, and only when the pages have a figure), their quality is close to the text questions, and
they make slides and diagrams usable.

## 3. Search (retrieval)

**Method.** All 50 chunks of the 14 documents are indexed together. For each of the 60 questions we check whether a
chunk containing the labelled snippet is in the top 5 (recall@5) and at which rank (mean reciprocal rank, MRR).

| Method | Recall@5 (all 60) | MRR | Recall@5, same language (43) | Recall@5, other language (17) |
| --- | --- | --- | --- | --- |
| Keyword (BM25) | 78.3% | 0.714 | 95.3% | 35.3% |
| Smart search (vectors) | 86.7% | 0.809 | — | 52.9% |
| Hybrid (what the app uses) | 85.0% | 0.799 | 97.7% | 52.9% |

- Keyword search alone is very good when the question and the notes are in the same language, and poor across
  languages, as expected.
- On this small corpus, vector-only search found one more passage than hybrid search overall (86.7% against 85.0%).
  The app still uses the hybrid: it is better for same-language questions and exact terms, and keyword search is what
  works before the optional Smart search model is downloaded. Fusion weights were swept (BM25 weight 1, 0.5 and 0.25);
  0.5 gave the best MRR at equal recall and is the default.
- **Cross-language search is the weak point:** only about half of the questions asked in another language find the
  right passage in the top 5. Writing the question in the language of the notes works much better.
- Embedding speed: about 14 s per 100 chunks on a desktop CPU in Node.js (single thread). On a phone it will be slower;
  this runs once per deck, in the background, and only when Smart search is turned on.

## 4. Ask your notes

**Method.** Every second search question about the 10 benchmark documents (26 questions) plus the 10 unanswerable
questions were sent to the Ask endpoint, with the top 5 keyword-search passages from the right document (the app's
fallback path, without Smart search).

- 26 of 26 answerable questions were answered, each citing a passage that contains the answer (100%).
- 10 of 10 unanswerable questions were refused (100%).
- When a question was asked in English about notes in another language, the answer sometimes came back in the
  language of the notes. One Japanese question was refused in English. (The app shows its own translated message for
  refusals, so the learner still sees their language.)
- **Bug found and fixed:** one answer contained a formula without maths delimiters, which the app would have shown as
  raw LaTeX. The Ask prompt now asks for `$…$`, and the server converts other common forms. Tested again live
  afterwards.

## 5. Grading of explain answers

**Method.** 34 written answers to 15 explain-questions, from complete to plainly wrong, were written and labelled by
the AI assistant, key point by key point (102 labels). The `explain` stage sends each answer to the grading endpoint.

- The grader agreed with the reference label on 98% of key points.
- The overall level shown to the learner ("Great", "Partly there", "Not yet") agreed in 100% of answers.

## 6. Speed

The `latency` stage processes a 7,120-word document (about 14 pages, 39 chunks, 10 topics) the way the app does:

| Step | Time |
| --- | --- |
| Chunking (in the browser) | 0.04 s |
| Topic map (AI) | 1.7 s |
| First round of questions, including verification (AI) | 5.9 s |
| **Total until the first questions are playable** | **7.7 s** |

This is a single run from a desktop on a home connection, and excludes reading the file (PDF text extraction takes
about 1 s for 20 pages). On the free tier, waits for rate limits can add tens of seconds when many requests are made in
a short time. In the live smoke test, a small PDF became a playable deck in 5 s.

Lighthouse (mobile, simulated slow 4G) on the live site: performance 92, accessibility 98 (the one finding, a missing
skip-link target on the onboarding screen, was fixed afterwards), best practices 96, SEO 100.

## Limitations

- **Small and synthetic.** 10 documents, 102 generated questions, 60 search questions and 34 graded answers.
  Differences of a few per cent are within noise.
- **Not independently reviewed.** The labels and reviews come from the same AI assistant that built the app, with at
  most a spot check by the author. An AI reviewer can share blind spots with the models it checks; an independent
  human review could find more problems.
- **Single runs.** The models are not deterministic (except the judge at temperature 0); results vary between runs.
- **Free-tier models change.** Groq may update or retire models; numbers apply to the models listed above.
- **The judge is lenient.** Use the assistant-review numbers, not the judge's, as the measure of question quality.

## How to reproduce

You need a free Groq API key in `.env` (`GROQ_API_KEY=…`). Then run the stages one at a time; each writes its result to
`benchmarks/results/`:

```bash
npm run benchmark -- retrieval
npm run benchmark -- generate
npm run benchmark -- figure
npm run benchmark -- judge
npm run benchmark -- ask
npm run benchmark -- explain
npm run benchmark -- latency
npm run benchmark -- summary
```

The `retrieval` stage runs offline after downloading the embedding model once. The other stages call Groq and wait
politely when the free tier's rate limits are reached; the `ask` stage can be resumed if it is interrupted. The review
of generated questions (`benchmarks/results/manual-review.json`) is not automated and has to be redone after a new
`generate` run, ideally by an independent human reviewer.
