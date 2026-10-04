# Browser capture and Revisit

Implemented 4 October 2026. The first extension targets desktop Chrome and Edge. It complements the React PWA; it does not introduce a backend, another vocabulary database, or a separate API-key setup.

## Reading and learning logic

The reader deliberately invokes a lookup by selecting English text and using the context menu, extension toolbar icon, or configurable keyboard shortcut. Selecting text alone does nothing. A compact panel appears beside the selection where space permits, preserving page layout and scroll position. It shows the contextual Chinese meaning, concise usage guidance, uncertainty/tone notes, and an optional source passage. The reader can continue reading while the answer loads, save it, or dismiss with Escape.

| State                           | Persistent entry?                | Next actions                                                       |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Selection / explanation loading | No                               | Continue reading or cancel                                         |
| Explanation preview             | No                               | Add to Revisit or dismiss                                          |
| Revisit                         | Yes, with practice disabled      | Expand explanation, edit, discard, move to Library, start practice |
| Library                         | Yes                              | Edit, search, optionally practise                                  |
| Practice                        | Library entry plus review events | Existing FSRS recall workflow                                      |

Only **加入 Revisit** commits a new capture. Save, retry, and open-service controls require trusted user events; surrounding page scripts cannot save a preview through synthetic DOM clicks. Closing an unsaved preview creates no entry or review event. **Move to Library** changes the collection without enabling practice. **Start practice** moves it to Library and enables the existing review workflow. Choosing review in the editor for a Revisit entry also promotes it when the edit is saved. Editing other fields preserves Revisit membership.

## Integration and data ownership

1. Invocation grants temporary `activeTab` access to the reader page. A bundled content script extracts the selected text and, when accessible, its surrounding sentence. Extraction is best effort; long passages are bounded to 5,000 characters. The full article is never submitted.
2. The extension worker finds a MyLexicon tab in the same browser profile or opens one in the background. It waits for the app bridge to become ready. A library bound to a Google account must be opened/unlocked there first. No reader tab switch occurs until **Open MyLexicon** is explicitly clicked.
3. A bundled service content script relays a correlated request into the app using `postMessage`. Both ends check channels, source window, origin, and identifiers. Extension messages accept only this extension's sender ID. Reader pages cannot invoke a public external-messaging endpoint.
4. The app validates lengths, source URL, action, and identifiers. It searches saved entries by expression **and context**, rather than assuming every occurrence has the same sense. A matching entry is reused offline. Matching unresolved revisions require conflict resolution first.
5. Otherwise, the app uses its existing Gemini key or local development proxy. The request separates selected text and surrounding text from system instructions, treats page content as untrusted quoted material, asks for Simplified Chinese guidance, and preserves the selected wording. Only selection/context go to Gemini; page title/URL remain provenance stored locally on an explicit save.
6. Validated answers are held in the service tab's memory, addressed by opaque preview tokens. Tokens expire after 30 minutes; at most 30 previews and three explanations are allowed per service tab. Save requests reference a token, never client-provided replacement entry fields.
7. Saving commits an idempotent operation transaction to the app's IndexedDB before reporting success. In-tab saves are serialized; retries retain the operation ID, and matching contextual entries are rechecked before writing. An existing Library entry is never demoted. Different contexts remain separate captures.
8. A BroadcastChannel refreshes other open service tabs after changes. The existing operation log handles Drive sync, conflict resolution, JSON backups, deletion history, and promotion revisions. Offline saves remain pending until ordinary synchronization succeeds.

The extension stores its service address and temporary tab/token routing metadata, including routing to the original tab when a different service tab becomes active. It stores no API key or independent personal lexicon. Permanent host permission is limited to `eyixinwang.github.io` and loopback development hosts. Service-tab URLs are additionally checked against the exact configured MyLexicon path. Arbitrary service origins require an explicit future configuration/permission change.

## Failure behavior

- No selection, non-English text, oversized input, or invalid source: show an actionable prompt without an AI request.
- Missing Gemini key, unavailable network/provider, blocked/incomplete/invalid output: show an error and allow retry; create no entry.
- Escape/close: cancel an active query when reachable and discard its eventual preview. A dismissed panel ignores late responses. Saving already explicitly requested can still complete after dismissal.
- Lock/disconnect during lookup: do not return a new explanation or permit a new save.
- Storage failure: preserve the preview for retry. Refresh failure after a committed write does not misreport the item as unsaved.
- Lost save response: retry the same token/operation or check Revisit. If the service tab was closed, a fresh contextual lookup finds a completed save and avoids inserting it again.
- Old hosted app, service navigation, or preview expiry: request an app reload/update or a fresh lookup; do not silently substitute a different preview.
- Cross-origin frames may allow selection through the context menu while preventing context extraction. Restricted browser pages and some PDF viewers require paste/manual lookup.

## Compatibility, delivery, and validation

`collection` and `capture` are optional entry fields, retaining the existing operation schema version. Entries from old backups belong to Library by default. Capture provenance stores the selected text, surrounding context, safe HTTP(S) URL, page title, and timestamp; validation rejects malformed URLs and credentials embedded in source URLs. New Revisit entries are excluded from Library browsing and due-review selection until promoted.

Run `npm run dev` for local use. `npm run build` packages a reproducible extension ZIP and includes it in the hosted app's Settings download. Load the source `extension` directory or the unzipped package through the browser's **Load unpacked** flow. The updated hosted app must be deployed before its capture bridge is available; this development task does not publish to the extension store or install into the owner's browser.

Automated tests cover preview/save/discard lifecycles, failed and repeated saves, contextual reuse, cancellation, locks, expiry, conflict handling, validation, old/new backup compatibility, context-aware Gemini requests, and extension service-tab routing. Browser verification uses the actual capture panel, service content bridge, React request handler, and IndexedDB, with a clearly mocked provider answer. A native Chrome/Edge installation and live-provider check remain deployment/device validation steps.

Platform references: [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [script injection](https://developer.chrome.com/docs/extensions/reference/api/scripting).
