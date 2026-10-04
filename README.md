# MyLexicon

Current scaffold release: **v0.0.1**.

A personal English learning app for collecting words, phrases, and sentences, adding Chinese meanings and context, and reviewing what you choose to practise. This implementation is a static React PWA with browser storage, Gemini lookup and translation, and optional Google Drive sync.

## Run locally

Use Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Manual capture, search, review, JSON export/import, and offline use after a production PWA installation work without Google configuration. `npm test` covers data merging, AI response validation, and local-first query behavior. `npm run build` creates the production `dist/` directory and service worker.

## Gemini lookup & translation

The homepage accepts English words, phrases, and sentences, Chinese expressions, and Chinese requests such as “我想礼貌地说我需要更多时间”. It uses **models/gemini-3.8-flash**, with a structured JSON response, following Google's [structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output) and [REST API reference](https://ai.google.dev/api/generate-content#TextResponseFormat).

The app searches the current local library before making any AI request. An exact saved expression, Chinese meaning, original query, or English alternative is reused with no API call. Context and meaning notes are searchable too. Related matches are shown first; choose **ask Gemini for this expression** if they do not answer the query. Only submitted queries are sent, not keystrokes or the full library. Saved matches work offline.

Validated new answers appear as an unsaved preview. Choose **Save response**, **Edit before saving**, or **Discard response**. Editing opens the full entry form with the AI fields already filled in; its **Save entry** button saves your modified version. Cancelling editing returns to the preview. Nothing is added to the local library, Drive sync, backups, or review history until you save. Entries include Chinese meaning, English explanation, part of speech, pronunciation when useful, tone, formality, spoken/written use, domain, and bilingual examples. The Library has **Words & phrases** and **Sentences** categories. AI answers are labelled and retain their model and original query. Old version-1 backups remain supported. Unsaved previews last only while the homepage remains open.

Chinese-to-English queries request 4–6 distinct contextual options where useful variety exists, with fewer for fixed terms. English phrase and sentence queries also request alternatives when helpful. A comparison table shows each English option, Chinese context/tone guidance, spoken/written suitability, and any meaning change (for example, “another problem” adds the idea of recurrence). These options remain together in one lexicon entry and can be edited, added, or removed before saving and afterwards. Distinct spoken/written versions remain available. The prompt requests faithful translations and explicit nuance notes; model output still needs your review.

Identical spoken and written sentence versions are stored once as a **shared spoken & written version** and displayed once under **Speaking & writing**. Distinct versions stay separate; the model is instructed not to invent a difference. Matching ignores spacing and typographic quote style, while preserving case and punctuation distinctions. Existing saved sentences are repaired on load and after import or sync, through new revisions in the normal change log; original history and practice records remain intact. Unresolved conflicts are left for manual resolution. A matching contextual option is labelled **both**, and a shared version remains searchable and editable. The cleanup needs no AI request and is safe to repeat.

Word queries request separate British (UK) and American (US) IPA transcriptions. These are shown in previews and saved cards, editable, and included in backups and Drive sync. The model leaves uncertain pronunciation fields empty rather than guessing. Existing undifferentiated pronunciation notes remain available; they are not automatically assigned to an accent.

In the Library, **Used in** filters work together with search and the **Words & phrases / Sentences** categories. **Speaking** and **Writing** each include entries labelled **both**; choose **Speaking & writing (both)** for only those entries. Older entries without a usage label appear under **All usage** or **Not classified**. Filtering applies to the main expression's usage, not to its contextual alternatives, and does not affect local-first AI lookup.

The Library's **Show as** controls offer **List** (compact bilingual rows), **Preview** (short cards with a usage excerpt), and **Full cards** (all saved content). List and Preview items expand to show the full entry, including Edit and Delete. Sentence entries show Chinese before English in every view. Preview is the default; your selection is remembered in this browser when preference storage is available. Changing views works with the current search and filters.

Configure a key in either of these ways:

- **Local development:** set `GEMINI_API_KEY` in the ignored `.env.local` file and restart `npm run dev`. The development server runs on `127.0.0.1` and proxies only local, same-origin requests to the fixed Gemini model. The private key is never included in the built client. Do not rename it to a `VITE_` variable, which would expose it in public assets.
- **Hosted app or production preview:** open **Settings → Google Gemini**, paste your own Google AI Studio key, and save it on that device. GitHub Pages is static, so these requests go directly from the browser to Google. The key is kept in local device metadata and excluded from operation logs, Drive sync, and JSON exports. It is accessible to this browser and site code; use a trusted personal device, restrict the key to the intended API/origins where supported, and set project quotas. Configure each device separately. See Google's [API key guidance](https://ai.google.dev/gemini-api/docs/api-key).

No private key belongs in repository files, GitHub Pages assets, or build variables. Google project quota and billing apply to new AI requests. Failed, cancelled, blocked, truncated, or invalid responses are not saved. If saving fails, the preview or edited response remains available so you can retry saving without another AI request.

## Browser capture & Revisit

The desktop Chrome/Edge extension shows Chinese explanations beside selected English words, phrases, or sentences. Select text and use the right-click menu **Explain in Chinese · MyLexicon**, the pinned extension icon, or **Alt+Shift+L** (**Option+Shift+L** on macOS). The selected wording and a short surrounding passage are explained through your existing MyLexicon Gemini connection; the extension does not need another API key.

An explanation stays temporary until you choose **加入 Revisit**. Saved captures appear in the new **Revisit** area with their context and source link. Expand **Learn this expression**, edit, discard, **Move to Library**, or **Start practice** when convenient. Revisit entries use the existing local storage, Drive synchronization, and JSON backups; they enter recall practice only when chosen. Different source contexts can remain separate entries.

To install, load the repository's `extension` folder through Chrome/Edge **Extensions → Developer mode → Load unpacked**, or download the ZIP from MyLexicon Settings and unzip it first. Set the extension's Options service address to your hosted app or local Vite URL. Keep the service open/unlocked in the same browser profile. `npm run build` creates `dist/mylexicon-capture.zip`; local development also supplies the download. See [extension setup](extension/README.md) and [capture logic](CAPTURE_DESIGN.md).

The hosted app needs the updated capture bridge deployed before the extension can connect to it. This version covers desktop Chrome/Edge, ordinary webpages, and best-effort context extraction; restricted browser pages, some PDF viewers, Safari, and mobile need other capture paths. Unsaved previews expire after 30 minutes or when their service tab closes. Gemini output still needs your judgement.

## Connect Google Drive

The app uses the Google Identity Services browser token flow and the narrow `drive.appdata` permission. It stores the access token only in memory. A Google Cloud project and web OAuth client are required for each self-hosted deployment:

1. Create a Google Cloud project and enable the Google Drive API.
2. Configure the OAuth consent screen as **External / Testing**, listing your own Google account as a test user. Request the `openid`, `email`, and `drive.appdata` scopes. Google's Testing authorization for Drive expires after seven days, so reconnect when prompted.
3. Create a **Web application** OAuth client. Add the exact site origin to Authorized JavaScript origins, such as `http://localhost:5173` for local development and `https://YOUR_USERNAME.github.io` for GitHub Pages. The project path is not part of an origin.
4. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID` to the public web client ID. Do not add a client secret. Restart Vite after changing `.env.local`.
5. In Settings, connect the same Google account on each device. The app binds a browser's local library to the account's stable Google ID before synchronizing. A different account cannot be silently substituted.

The first connection requires a user action. Tokens expire; keep using the local library and click Reconnect when needed. The app synchronizes while it is open and authorized. Google Drive app data is hidden from the normal Drive interface, so use **Export JSON** for an independent backup. Google authorization has not been exercised against a real account in this scaffold; verify it on your own devices before relying on sync.

## Deploy to GitHub Pages

1. Push the `main` branch of [eyixinwang/MyLexicon](https://github.com/eyixinwang/MyLexicon) to GitHub. The `v0.0.1` tag identifies the initial scaffold release.
2. In repository Settings → Pages, select **GitHub Actions** as the build and deployment source.
3. Run the included deployment workflow or push to `main`. When its `build` job succeeds, open `https://eyixinwang.github.io/MyLexicon/` on a desktop browser and phone.
4. Test local-only functions first: create a phrase with a Chinese meaning, reload and search it, mark it for review, reveal its answer, rate it, and export a JSON backup. Google setup is not required for these checks.
5. To test cross-device sync, configure the Google OAuth web client described above. Add `https://eyixinwang.github.io` to Authorized JavaScript origins. In repository Settings → Secrets and variables → Actions → Variables, set `GOOGLE_CLIENT_ID` to the public OAuth web client ID. Re-run the deployment workflow so Vite includes it in the built app. Connect the same Google account on each device, add an entry on one, and click **Sync now** on the other. Verify the entry appears and survives reload.
6. Make an independent JSON backup after confirming sync. The workflow sets `VITE_BASE_PATH` to `/MyLexicon/`; this is a GitHub Pages project site.

Only app code and public assets are deployed. Do not commit `.env.local`, personal data exports, access tokens, or an API client secret. GitHub Pages itself is public; Google authorization controls access to private cloud data. The local IndexedDB copy relies on the device lock for confidentiality.

## How data works

Every edit is saved to IndexedDB before the UI reports success. Entry changes have unique IDs and parent revision IDs. Google Drive stores immutable batches in its application data area, which allows two devices to upload without overwriting a shared file. Simultaneous edits to the same entry stay visible as a conflict until you choose a version in Settings. Review events are kept separately; a lookup is not counted as recall practice.

JSON export contains entries and review history as a versioned operation log. Import validates the data and merges by operation ID. Browser storage can be cleared, and Drive app data can be removed from Google, so keep occasional downloaded exports. The app does not currently compact old Drive batches or provide encrypted local storage. For the small personal collections targeted here, this preserves history and keeps conflict recovery straightforward.

See [DESIGN.md](DESIGN.md) for the broader original design. The Gemini implementation above supersedes its initial AI-disabled milestone; the packaged dictionary remains future work.
