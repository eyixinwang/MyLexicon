# MyLexicon

Current scaffold release: **v0.0.1**.

A personal English learning app for collecting words, phrases, and sentences, adding Chinese meanings and context, and reviewing what you choose to practise. This implementation is a static React PWA with browser storage and optional Google Drive sync. Dictionary and AI integrations are reserved for later work.

## Run locally

Use Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Manual capture, search, review, JSON export/import, and offline use after a production PWA installation work without Google configuration. `npm test` runs the meaningful data merge tests, and `npm run build` creates the production `dist/` directory and service worker.

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

See [DESIGN.md](DESIGN.md) for the broader project design and the planned dictionary and optional AI boundaries.
