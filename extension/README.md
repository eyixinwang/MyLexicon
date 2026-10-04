# MyLexicon Capture

Chrome/Edge Manifest V3 extension. It shows a Chinese explanation beside selected English text and saves only when you choose **加入 Revisit**.

## Install

1. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, then choose **Load unpacked** and select this folder. If using the ZIP download, unzip it first and select the `mylexicon-capture` folder containing `manifest.json`.
2. Open the extension's **Options**. The default service is `https://eyixinwang.github.io/MyLexicon/`. For local development, run `npm run dev` in the project and change the address to the URL Vite prints, normally `http://127.0.0.1:5173/`.
3. Open MyLexicon in this same browser profile. Configure Gemini in Settings (or use the existing local development proxy), and unlock/open the local library if prompted. An already installed PWA can have different browser-profile storage; use a regular service tab in the capture browser.
4. On an ordinary webpage, select a word, phrase, or sentence. Right-click → **Explain in Chinese · MyLexicon**, click the pinned extension icon, or press **Alt+Shift+L** (**Option+Shift+L** on macOS). Change conflicting shortcuts on your browser's Extensions keyboard-shortcuts page.
5. Read the compact explanation, choose **加入 Revisit** if useful, then press Escape to resume reading. In MyLexicon → **Revisit**, expand **Learn this expression**, edit it, **Move to Library**, **Start practice**, or discard it.

## Behavior and boundaries

- A lookup and closing its preview create no entry, backup record, or review event. Previews are held in service-tab memory for up to 30 minutes; closing/reloading that tab invalidates them.
- Saving is committed to MyLexicon's IndexedDB before success is shown. Save retries use the same operation; a matching expression in the same context is reused. An existing Library entry is never moved back to Revisit.
- Different contexts are retained as separate captures. Revisit entries use the existing revision log, Google Drive synchronization, conflict resolution, and JSON export/import. They do not become practice material until selected.
- The extension opens the service in a background tab when needed, leaving the reading tab active. A bound library must be unlocked in that tab. Keep it open for subsequent lookups.
- Gemini receives only the selected text and the short surrounding passage, not the page URL, title, full article, or library. Context extraction is best effort, especially across frames or multiple paragraphs. AI explanations can be wrong; inspect them before practising.
- The API key stays in the service. The extension stores its service address and temporary routing identifiers; it has no second vocabulary database and no broad permission to read every site. Reader access uses `activeTab` only after invocation. Permanent host access is limited to the MyLexicon GitHub origin and loopback development addresses.
- Browser internal pages, the Chrome Web Store, inaccessible frames, and some PDF viewers do not allow script injection. Use MyLexicon's paste/manual lookup for those. Mobile browsers and Safari are outside this first extension version.
- The hosted service must include the new capture bridge. Deploy the updated app before pointing the extension at a previous hosted release. Development use is available immediately with the local server.

## Build and verification

`npm run build` produces the app and `dist/mylexicon-capture.zip`. Service/protocol and extension routing tests run with `npm test`. See `CAPTURE_DESIGN.md` in the project for lifecycle and integration decisions.
