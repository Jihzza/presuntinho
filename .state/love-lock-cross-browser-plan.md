# Love Lock Cross-Browser Fix — Design Plan (my own draft, ready for Skander 1 validation)

## Problem
- `src/lib/auth/loveLock.ts` persists lock state ONLY in localStorage
- User opens app in fresh browser/incognito → no localStorage → no lock → bypasses emotional gate
- Skander/Daniel explicitly requested cross-browser block

## Constraints
- Static SPA on Netlify (`adapter-static` + `ssr=false`)
- Netlify Functions supported (no Functions dir exists yet — greenfield)
- Primary deploy via `netlify deploy --build` (CI restored by 28dbd39)
- Must NOT break: existing Love Lock UI, splash flow, PBKDF2 first-check ordering

## Chosen approach: Option D — Netlify Function + HttpOnly cookie

### Why D over alternatives
- **A (Netlify Blobs/KV)**: requires Netlify account + token config — adds operational complexity
- **B (fingerprint+IndexedDB)**: client-only, **does NOT fix the bug** (different browser = different storage)
- **C (mutate hashes.json via Netlify API)**: requires deploy hook + write token, fragile
- **D (function + cookie)**: works cross-browser because cookies are domain-scoped (not browser-scoped); uses existing Netlify Functions infra (free tier: 125k req/month); HttpOnly so client JS can't tamper; **fixes the actual bug**

### Architecture
1. **POST /.netlify/functions/love-lock** — body `{kind: 'sad'|'love', password: '...'}` — verifies PBKDF2-ish pass (or just accepts any "sad"/"love" trigger like current client code), sets `Set-Cookie: lovelock=1; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`
2. **GET /.netlify/functions/love-lock** — returns `{active: bool, kind: 'sad'|'love' | null, expiresAt: ts}` if cookie present
3. **DELETE /.netlify/functions/love-lock** — clears cookie
4. **Splash client** — on mount, GET love-lock → if active, show LoveLock component; on submit, POST if trigger matched; on unlock button, DELETE then redirect
5. **Cross-tab sync** — `BroadcastChannel('lovelock')` postMessage on activate/unlock so multiple tabs in same browser react

### Files to create
- `netlify/functions/love-lock.js` — Express-style handler, ~80 lines
- `netlify/functions/love-lock/package.json` — declares @netlify/blobs if used (NOT for D — pure cookie)

### Files to modify
- `src/lib/auth/loveLock.ts` — replace localStorage with fetch() calls; keep LoveLockState interface
- `src/routes/splash/+page.svelte` — call readLoveLock via fetch on mount
- `src/lib/components/LoveLock.svelte` — onUnlock → DELETE cookie instead of clearLoveLock
- `netlify.toml` — confirm functions dir is auto-detected (it is by default at `netlify/functions/`)

### Cookie schema
```
Name:    lovelock
Value:   1 (or base64 of JSON {kind, expiresAt})
Domain:  .presuntinho.netlify.app (production) / .netlify.app (preview)
Path:    /
Max-Age: 3600
Secure:  true (production only)
HttpOnly: true
SameSite: Lax
```

### Risks / edge cases
- **Cookie cleared by user**: intentional bypass (we documented emotional not technical)
- **Multi-device**: works because cookie is domain-scoped, not device-scoped (assuming Fatma uses same browser profile; if she switches devices the lock resets — accept this, it's actually MORE romantic: "go say I love you on this device too")
- **Cookie rejected by Safari ITP**: it works on first-party context, which we are
- **Race conditions on activate**: use POST → response sets cookie → GET on next mount; multi-tab via BroadcastChannel
- **Backwards compat**: keep `localStorage` as fallback if function call fails (network offline); UI shows "offline" indicator

### Verification plan
- After deploy: type "Sad" in browser A → curl GET love-lock function → confirm cookie set
- Open fresh browser B → fetch love-lock → confirm lock active
- Click unlock in B → DELETE cookie → redirect to hub
- Refresh A → confirm lock cleared (cookie deleted)

### Estimated effort
- 30 min implementation (1 Skander 2 task)
- 10 min testing (1 Skander 2 task)
- 5 min deploy (netlify deploy --build)
- Total: ~45 min

### Confidence
HIGH — Function + cookie is well-trodden, low risk, works cross-browser.