# Zitadel Auth Design

**Goal:** Replace HTTP Basic Auth with Zitadel Cloud OIDC so the small team can sign in with real accounts and access is controlled via a manually-granted `member` role.

**Architecture:** React SPA performs PKCE login via `oidc-client-ts`, receives a JWT access token, and sends it as a Bearer header on every API call. The Express API validates the JWT locally using Zitadel's public keys (cached, no network call per request) and checks for the `member` role claim. Users who sign up without a granted role see an "access pending" screen.

**Tech Stack:** `oidc-client-ts` (frontend), `jose` (backend JWT validation), Zitadel Cloud (identity provider)

---

## Zitadel configuration

- **Instance:** `onder-stroom-auth-n32ncs.eu1.zitadel.cloud`
- **Project:** `Team` — hosts all internal tools (Show Uploader, Scheduler, etc.)
- **Application:** `Show Uploader`, type **User Agent (SPA)**, auth method **PKCE**
  - Client ID: `373451781885243427`
  - Redirect URIs: `http://localhost:5173/callback`, production URL (add when known)
  - Post-logout redirect: production URL (add when known)
- **Role:** `member` (key: `member`, display name: `Member`)
- **Access flow:** User signs up → no role → cannot access app (403) → admin grants `member` role in Zitadel console → user refreshes → access granted

Future apps under the same team (Scheduler, etc.) are added as additional Applications inside the same `Team` project. The Website gets its own separate project.

---

## Backend: `requireAuth` middleware

**Replaces:** `api/src/middleware/basicAuth.ts` (deleted)  
**New file:** `api/src/middleware/requireAuth.ts`

Behaviour:
1. Reads `Authorization: Bearer <token>` header — returns 401 if absent
2. Verifies JWT signature against Zitadel's JWKS endpoint using `jose`'s `createRemoteJWKSet` (keys cached in memory, auto-refreshed on unknown key ID)
3. Verifies `iss` claim matches `https://onder-stroom-auth-n32ncs.eu1.zitadel.cloud`
4. Checks `urn:zitadel:iam:org:project:roles` claim — returns 403 if `member` key is absent
5. Calls `next()` on success

**Watcher route** mounts before `requireAuth` in `app.ts` and is unaffected.

**Removed env vars:** `UI_USERNAME`, `UI_PASSWORD`  
**New env var:** `ZITADEL_DOMAIN=onder-stroom-auth-n32ncs.eu1.zitadel.cloud`

---

## Frontend: OIDC auth flow

**New files:**
- `ui/src/auth/AuthProvider.tsx` — React context holding `UserManager` and current `User`
- `ui/src/auth/useAuth.ts` — hook to access auth context
- `ui/src/pages/AuthCallback.tsx` — handles Zitadel redirect, calls `signinRedirectCallback()`, redirects to `/`
- `ui/src/pages/AccessDenied.tsx` — shown when API returns 403

**Modified files:**
- `ui/src/App.tsx` — wrapped in `<AuthProvider>`, `/callback` route added, auth gate applied to all other routes
- `ui/src/api/client.ts` — `apiFetch` reads token from auth context and adds `Authorization: Bearer <token>`

**`UserManager` config:**
```ts
{
  authority: 'https://onder-stroom-auth-n32ncs.eu1.zitadel.cloud',
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID,
  redirect_uri: `${window.location.origin}/callback`,
  scope: 'openid profile email urn:zitadel:iam:org:project:roles',
  response_type: 'code',
}
```

**Auth gate behaviour in `App.tsx`:**
- Loading → blank screen (checking session)
- No user → `userManager.signinRedirect()` (redirect to Zitadel, no login page in app)
- User present, API returns 403 → `<AccessDenied />` shown
- User present, API OK → normal app renders

**New Vite env vars** (in `ui/.env` and `ui/.env.example`):
```
VITE_ZITADEL_DOMAIN=onder-stroom-auth-n32ncs.eu1.zitadel.cloud
VITE_ZITADEL_CLIENT_ID=373451781885243427
```

---

## Access denied UX

Simple full-screen message on 403:
> "Your account is pending approval. Ask an admin to grant you access in Zitadel."

No app content visible. After an admin grants the `member` role, the user refreshes — `oidc-client-ts` silently renews the token with updated claims — and they get in without re-logging in.

---

## What does NOT change

- `POST /api/watcher/notify` — still protected by `WATCHER_API_KEY` Bearer token, mounted before `requireAuth`
- Worker, Redis, Minio, database — untouched
- All existing API routes — same behaviour, just need a valid JWT now instead of Basic Auth
