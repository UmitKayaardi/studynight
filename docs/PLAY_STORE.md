# Publishing StudyNight on Google Play

StudyNight is a Progressive Web App, so it can be published on Google Play as a **Trusted Web Activity (TWA)**: a thin
Android app that opens the website full-screen, without a browser bar. Nothing has been published yet. Publishing
needs a **Google Play developer account, which has a one-time registration fee** — this guide does not create
accounts or pay anything; the steps below are for you to do when you are ready.

Store assets are ready in `store/` (icon, feature graphic, phone screenshots and descriptions in 21 languages).

## What you need

- The live site on HTTPS (for example `https://studynight.vercel.app`). Check that it installs as an app on your
  phone (browser menu → *Install app* / *Add to Home screen*).
- Node.js 20 or newer.
- A Java Development Kit (JDK 17) and the Android command-line tools. Bubblewrap can download both for you the first
  time it runs.

## 1. Create the Android project with Bubblewrap

```bash
npm install -g @bubblewrap/cli
```

```bash
mkdir studynight-android
```

```bash
cd studynight-android
```

```bash
bubblewrap init --manifest https://YOUR-SITE/manifest.webmanifest
```

Answer the questions. Suggested values:

- Application ID (package name): `app.studynight.twa` (choose once; it can never change)
- App name: `StudyNight`; launcher name: `StudyNight`
- Display mode: `standalone`; orientation: `portrait`
- Theme and background colour: `#0b1026`
- Icon: `https://YOUR-SITE/icons/icon-512.png`; maskable icon: `https://YOUR-SITE/icons/maskable-512.png`
- Enable notifications: **no**

The `studynight-android` folder is separate from this repository. Do not put it inside the repository: it will contain
your signing key.

## 2. The signing key (keep it safe!)

During `bubblewrap init` you are asked to create a **signing key** (a `.keystore` file) with a password. Google Play
uses it to recognise future updates of your app.

- **Never commit it to git.** This repository's `.gitignore` already ignores `android/`, `*.keystore` and `*.jks`, and
  `npm run check:secrets` fails if one is ever tracked.
- **Back it up** in two safe places (for example an encrypted USB stick and a password manager that stores files),
  together with its password and alias. If you lose it, you cannot update the app.
- Recommended: when you create the app in Play Console, opt in to **Play App Signing**. Google then keeps the
  release key and your keystore becomes an *upload key*, which can be reset if lost.

## 3. Build the app bundle

```bash
bubblewrap build
```

This creates `app-release-bundle.aab` (to upload to Play) and `app-release-signed.apk` (to test on your own phone).

## 4. Link the site and the app (Digital Asset Links)

Without this step the app shows a browser bar at the top.

1. Get the SHA-256 fingerprint of your key:

   ```bash
   bubblewrap fingerprint list
   ```

   If you use Play App Signing, also copy the **app signing key** SHA-256 fingerprint from Play Console →
   *Setup → App integrity*.

2. In this repository, create `public/.well-known/assetlinks.json`:

   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "app.studynight.twa",
         "sha256_cert_fingerprints": ["AA:BB:…:FF"]
       }
     }
   ]
   ```

   Put every fingerprint (upload key and app signing key) in the list.

3. Commit, push and redeploy (`vercel deploy --prod`), then check that
   `https://YOUR-SITE/.well-known/assetlinks.json` opens in a browser.

## 5. Create the store listing

In Play Console → *Create app*: name **StudyNight**, default language English (United Kingdom), app, free.

- **Short description** and **full description**: `store/descriptions/en.json` (translations for all 21 languages
  are in the same folder; add them under *Store presence → Store listings → Manage translations*).
- **App icon**: `store/icon-512.png`. **Feature graphic**: `store/feature-graphic.png` (1024 × 500).
- **Phone screenshots**: `store/screenshots/` (8 images).
- **Category**: Education. **Tags**: study, flashcards, quiz.
- **Privacy policy URL**: `https://YOUR-SITE/privacy`.
- **Contact e-mail**: required by Google — use an address you are happy to show publicly.

## 6. App content forms

**Data safety** (matches the app's privacy design):

- *Does your app collect or share any of the required user data types?* — StudyNight does not collect personal data
  on its servers and has no accounts. When the learner uses AI features, the content they choose (text excerpts,
  photos, voice recordings) is sent to the AI provider only to process the request ("ephemeral processing"). Declare:
  - **Files and docs / Photos / Audio (voice or sound recordings)**: *processed ephemerally*, not stored, not used for
    advertising or analytics, purpose *App functionality*, sent to a service provider (the AI provider).
  - Nothing else (no location, contacts, identifiers, app activity or device IDs are collected).
- *Is data encrypted in transit?* — Yes (HTTPS).
- *Can users request that data be deleted?* — Yes: all data is on the device and can be deleted in Profile → Settings
  → Delete all my data.

**Content rating questionnaire**: educational reference app, no violence, no sexual content, no gambling, no user
interaction or chat with other people (challenge links only carry quiz questions), no location sharing. Expected
rating: Everyone / PEGI 3.

**Target audience**: 13 and over. The app is not designed specifically for children, so do not opt in to the
*Designed for Families* programme.

**Ads**: no ads.

## 7. Release

1. Upload the `.aab` to an **internal testing** track first and install it on your phone from the testing link.
2. Check: the app opens without a browser bar, sample decks work offline, uploads and voice answers work, and the
   Privacy page opens.
3. Promote the release to **Production** and submit for review.

## Updating the app later

The web app updates itself whenever you redeploy — no new Play release is needed for normal changes. Only build a new
`.aab` (increase the version in `twa-manifest.json`, then `bubblewrap update` and `bubblewrap build`) if you change the
app name, icon, colours or package settings.
