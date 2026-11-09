# Legal and privacy design

This document explains how StudyNight handles copyright and personal data. The in-app **Privacy** and **Terms**
pages (translated into all 21 languages) state the same in plain language. *The owner may want the Privacy Policy and
Terms reviewed by a qualified person before a store release.*

## Copyright

- **Learners process their own material for their own study.** Files are read in the browser and never uploaded.
  Only short text excerpts (chunks), resized images and short audio clips are sent, transiently, to generate
  questions, read images and transcribe speech. The server keeps nothing and publishes nothing.
- **Terms of use** state that learners must only upload material they have the right to use, that they are
  responsible for their uploads, that the app is for personal study, and that generated questions may contain
  mistakes.
- **Upload notice.** The create-deck screen shows: "Only upload material you have the right to use. Don't upload
  documents containing personal or sensitive information about yourself or others." with a link to the Privacy page.
- **Sharing never includes source passages.** Challenge links contain only questions, options, correct answers,
  short explanations, the challenger's nickname, avatar and score (in the URL fragment, so they never reach the
  server). Share cards contain only the score, the session title and — only if the learner switches it on — the deck
  title.
- **Sample decks and benchmark documents are original.** The six sample decks (`samples/notes/`) and the ten
  benchmark documents (`benchmarks/notes/`) were written from scratch for this project. They are not copied or closely
  paraphrased from any textbook, website or encyclopaedia.
- **No third-party content** beyond permissively licensed code, fonts and the embedding model, all listed in
  `THIRD_PARTY_NOTICES.md` and on the in-app Licences page. A licence check in CI fails on any licence outside the
  allow-list (MIT, ISC, BSD-2/3-Clause, Apache-2.0, 0BSD, CC0-1.0, Unlicense, OFL-1.1, Zlib).
- **Original visuals and sounds.** The mascot (Lumi, a crescent moon — not an owl or bird), logo, avatars, badge art and
  boss were drawn as SVG for this project; icons come from Lucide (ISC); sounds are synthesised with the Web Audio API.
- **Repository licence:** all rights reserved (see `LICENSE`).

## Personal data (UK GDPR-minded design)

- **Data minimisation.** No accounts, no identifiers, no analytics, no tracking, no advertising and no cookies.
  Nickname and avatar stay on the device. Free-text answers are not stored after the round.
- **Where data goes.**
  - On the device: decks, chunks, vectors, questions, progress, profile and settings (IndexedDB), preferences
    (localStorage), cached app files and the optional model (Cache Storage).
  - To Groq, through our stateless Vercel functions, only when an AI feature is used: text excerpts, resized images,
    short audio.
  - To Hugging Face, once, if Smart search is switched on: a request to download the model (they see the IP address).
  - To Vercel: normal web requests (IP address and technical data) to serve the app.
- **Groq data terms (checked 9 November 2026).** Groq's data documentation (console.groq.com/docs/your-data) says it
  does not retain inference requests by default, but may log inputs and outputs temporarily — for up to 30 days — for
  troubleshooting and abuse investigation unless Zero Data Retention is enabled for the organisation. Groq's Services
  Agreement (last modified 22 June 2026, §4.2) says Groq may not use inputs or outputs to train models. Data is stored
  in the United States. *Recommended: enable Zero Data Retention in the Groq console's Data Controls.*
- **Server logs** contain only the endpoint, status, error code and timing — never request content.
- **The model is instructed** never to output personal data found in documents; the deterministic checks also reject
  questions containing e-mail or phone number patterns.
- **Learner control.** Profile → Settings offers export (backup), import, deleting a deck (with its chunks, vectors,
  questions and history) and **Delete all my data** (IndexedDB, Cache Storage and preferences).
- **Special-category data** is neither collected nor inferred.
- **Age.** Nothing about the user is collected, so no age gate is needed; the content is suitable for children, and
  the intended store audience is 13+ (see `docs/PLAY_STORE.md`).
- **No advice.** The app gives no medical, legal or financial advice; "Ask your notes" answers only from the learner's
  own material and says so when the notes do not cover a question. The deck page and the Terms say "AI can make
  mistakes — always check against your notes."
