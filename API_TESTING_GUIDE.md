# Halcyon API Testing Guide

Read-only reference derived from the actual route/controller/SQL code (`server.ts`,
`Routes/*.ts`, `Controller/*.ts`, `Database/*.sql`) as of this writing. Every request/response
shape below matches what the code actually reads and returns — no invented fields.

**Scope.** This covers every endpoint mounted in `server.ts` *except* the sign-up/sign-in/session
family (`/api/signup`, `/api/signin`, `/api/auth/google`, `/api/auth/sync-profile`,
`/api/refresh-token`, `/api/forgot-password`, `/api/reset-password`, `/api/change-password`,
`/api/update-name`, `/api/upload-profile-image`, `/api/remove-profile-image`, `/api/logout`,
`/api/check-session`, `/api/me`), which are already tested elsewhere — **except** it does include
`DELETE /api/delete-account`, per request. Non-JSON infrastructure routes declared directly in
`server.ts` (the `/soundscapes/*.mp3` audio streamer, `/privacy-policy`, `/admin` static panel,
`/docs` swagger UI, `GET /` health check) are out of scope — they aren't part of the JSON API
surface this guide is for.

**Prerequisite for every request below:** start the server, then obtain a Bearer token via
`POST /api/signin` (not documented here — already tested). Send it as
`Authorization: Bearer <access_token>` on every endpoint marked **Auth: Bearer**.

---

## Before you test — data state

Two things about the current database will make a lot of endpoints look "broken" if you don't
account for them first. Both are evidenced directly in the code below, not assumptions.

### 1. Draft vs. Live — most catalogue reads will return empty

All three sample soundscapes are `status: "draft"`. The following endpoints hard-filter on
`status = 'live'` (or, for collections, `is_published = true`) and will return **empty
results, not errors**, until you flip some rows:

| Endpoint | Live-status filter, evidenced at |
|---|---|
| `GET /api/library` | `Database/fix_filter_soundscapes_environments.sql:26` (`filter_soundscapes` RPC: `s.status = 'live'`) |
| `GET /api/soundscapes` | `Controller/Soundscape.ts:294` (`.eq("status","live")`) |
| `GET /api/soundscapes/search` | `Database/search_soundscapes.sql:10` (`search_soundscapes` RPC) |
| `GET /api/soundscapes/suggestions` | `Controller/Soundscape.ts:437` |
| `GET /api/soundscapes/mode/:mode` | `Controller/Soundscape.ts:331` |
| `GET /api/soundscapes/:id/details` | `Controller/Soundscape.ts:366` → **404** if draft |
| `GET /api/soundscapes/:id/similar` | `Controller/Soundscape.ts:472` (source) `:487` (candidates) → **404** on source if draft |
| `GET /api/collections/:id` soundscape list | `Controller/Soundscape.ts:616` |
| `GET /api/recommendations`, `GET /api/home/recommended` | `Controller/Recommendations.ts:224` (`getRankedLiveSoundscapes`) → `best_match: null`, `soundscapes: []` (still `200`) |
| `POST /api/favourites`, `POST /api/downloads`, `POST /api/play-history`, `PUT /api/player/state`, `POST /api/playlists/:id/items` | each calls a `getLiveSoundscape()` helper first → **`400` "Soundscape not found or not live"** if the id isn't live |
| `GET /api/favourites`, `GET /api/downloads`, `GET /api/play-history`, `GET /api/home/continue-listening`, `GET /api/playlists/:id` | inner-join to `soundscapes` filtered `status = 'live'` → rows for non-live soundscapes silently vanish from the response |

`GET /api/collections`, `GET /api/collections/popular`, and `GET /api/explore` are gated on
**`collections.is_published = true`** instead (`Controller/Soundscape.ts:556, 704, 667`) — since no
sample collection data was supplied, these will also return empty until an admin creates and
publishes at least one collection.

**Fix before testing discovery/library/recommendation/save-state endpoints:** set 1–2 soundscapes
live as the very first step:

```
PUT /api/admin/soundscapes/5688323a-2fd9-4a73-af65-29c211dc76e8/status
Authorization: Bearer <admin token>
{ "status": "live" }
```
Do the same for `8301b75f-867a-43b3-88bf-ab066a20d5f5` so you have two live soundscapes to test
similarity/recommendations/reordering against.

**Endpoints that do *not* require live status** (worth noting so you don't over-apply the rule):
`GET /api/admin/soundscapes/:id` (admin, any status), `POST /api/support/report-audio-problem`
(`Controller/Support.ts:171-175` looks the soundscape up with no `status` filter at all), and every
`/api/admin/*` CMS endpoint.

**Admin token prerequisite (separate from the above).** `AdminAuthMiddleware`
(`Middleware/AdminAuthMiddleware.ts:27`) requires `users.is_admin = true` for the signed-in row, and
there is **no API to grant this** — it must be set directly in the database before any `/api/admin/*`
route or `POST /api/admin/notifications/new-collection-alert` will pass authorization:
```sql
update public.users set is_admin = true where email = 'your-test-account@example.com';
```
Without it, every admin call correctly returns `403 { "success": false, "error": "Admin access required" }`.

### 2. Array fields stored as JSON strings, not native arrays

In the sample data, `contains`, `does_not_contain`, and `animals` (and, by the same column family,
`instruments` / `sound_sources` / `search_keywords`) are given as **one JSON-encoded string per
field**, e.g. `"contains": "[\"deep distant surf\",\"sealed room tone\",\"faint curtain movement\"]"`,
rather than a real list of separate tag strings.

The evidence for what the columns are *supposed* to hold: both SQL functions call
`unnest(coalesce(s.contains, array[]::text[]))` (`Database/search_soundscapes.sql:17`,
`Database/fix_filter_soundscapes_environments.sql:44`) — `unnest()` only type-checks against a
Postgres `text[]` column, so the column is declared as a real array type. The admin write path
agrees: `Controller/Admin.ts:227-238` (`SOUNDSCAPE_ARRAY_FIELDS`) rejects anything that isn't
`Array.isArray(value) && value.every(item => typeof item === "string")` — i.e. it expects
`["deep distant surf", "sealed room tone", "faint curtain movement"]`, three separate elements. The
sample data is consistent with the column instead holding a **one-element array whose single
element is the whole JSON blob** (which is exactly what you'd get if a seed script did something
like `contains: [JSON.stringify(tagsArray)]` instead of `contains: tagsArray`) — that single string
still passes the `every(item => typeof item === "string")` check, so nothing would have rejected it
at write time.

Per-endpoint effect, evidenced at the line that reads the field:

- **`GET /api/library`** (`filter_soundscapes` RPC, `contains`/`avoids`/`animals`/`instruments`
  params) — `unnest()` on a one-element array yields a single row whose value is the entire JSON
  blob, then compares it with `ilike '%word%'`. This **partially works by accident**: a filter word
  that happens to appear as a literal substring of the blob (e.g. `contains=surf` against
  `..."deep distant surf"...`) still matches, but this is substring luck, not tag matching — a
  synonym, multi-word phrase, or word not verbatim in the blob will silently fail to match even
  though it's semantically present. The `soundscapes[].contains` field in the response will also
  come back as a one-item array holding the raw JSON text, not a clean tag list.
- **`GET /api/soundscapes/search`** — same `unnest()` + `ilike` substring pattern over
  `contains`/`does_not_contain`/`animals`/`instruments`/`sound_sources`/`search_keywords`
  (`Database/search_soundscapes.sql:15-44`) — same accidental-substring-match behavior as library.
- **`GET /api/soundscapes/suggestions`** — **unaffected**. `GetSearchSuggestions`
  (`Controller/Soundscape.ts:434-440`) only matches `title`/`subcategory` via `ilike`; it never
  touches the array columns.
- **`GET /api/soundscapes/:id/similar`** — **works, but silently loses the array-overlap signal.**
  `toLowerStringSet` (`Controller/Soundscape.ts:147-158`) runs in Node against data supabase-js has
  already deserialized, so `Array.isArray(value)` is `true` (it's a one-element JS array) — no error.
  But that one element is the entire JSON blob as a single lowercased "tag", so two soundscapes only
  share an element if their blobs are byte-identical. `SIMILARITY_ARRAY_FIELDS` scoring
  (`Controller/Soundscape.ts:499-521`) therefore contributes `0` in practice; ranking falls back to
  subcategory + mode match only.
- **`GET /api/recommendations`, `GET /api/home/recommended`** — same mechanism, same silent
  degradation. `scoreSoundscape` and `isHardExcluded` (`Controller/Recommendations.ts:150-204`) read
  `contains`/`sound_sources`/`animals`/`instruments` via the same `toLowerStringArray`/`Set` helpers;
  overlap scoring against `preferred_sounds`/`preferred_animals`/`preferred_instruments` and hard
  exclusion against `excluded_sounds` will not find real matches (short discrete preference words
  vs. one giant blob string), so recommendations fall back to mode/detail/duration scoring or the
  no-signal popularity fallback — no error, no empty response, just reduced ranking quality.
- **`GET /api/explore`** — **unaffected**. `GetExploreGroups` only reads `collections.explore_group`;
  it never touches soundscape array fields.

**Correct format to fix this:** store each tag as its own array element —
`contains: ["deep distant surf", "sealed room tone", "faint curtain movement"]` — not
`contains: ["[\"deep distant surf\",...]"]`. This is exactly what `PUT /api/admin/soundscapes/:id`
and `POST /api/admin/soundscapes` already validate for and expect (`Controller/Admin.ts:227-238`).

---

## Testing order

1. **Admin: set 1–2 soundscapes live** (`PUT /api/admin/soundscapes/:id/status`) — prerequisite for
   nearly everything below.
2. Catalogue/discovery reads (`/api/soundscapes*`, `/api/library`, `/api/collections*`, `/api/explore`).
3. `POST /api/onboarding` → then `GET /api/recommendations` (so preferences exist to score against).
4. `PUT /api/player/state` → `GET /api/player/state`; `POST /api/play-history` →
   `GET /api/home/continue-listening`.
5. Favourites, playlists, downloads, preferences, notification settings + device registration.
6. Support, analytics, help (admin create+publish → public read).
7. Account export / import-guest-data.
8. **`DELETE /api/delete-account` last.** It is destructive — irreversibly deletes the user row, the
   Supabase auth user, and every related row (favourites, downloads, playlists, play history,
   preferences, onboarding, player state, device tokens, avatar storage files). Use a disposable
   test account for this step, not your main admin/test account.

---

## Catalogue & Discovery

#### `GET /api/library`
- **Auth:** Optional Bearer (`OptionalAuthMiddleware`) — if authenticated, the user's
  `excluded_sounds` sound preference is merged into `avoids`.
- **Path params:** none.
- **Query params (all optional):** `modes`, `environments`, `contains`, `avoids`, `animals`,
  `instruments`, `detail_levels` — comma-separated strings; `min_duration`, `max_duration` —
  non-negative integers (seconds); `sort` — one of `recommended, most_played, most_saved,
  recently_added, a_z, shortest, longest, lowest_intensity, highest_detail` (default `recommended`).
- **Request body:** No body.
- **Example request:** `GET /api/library?modes=sleep&sort=a_z`
- **Success response (200):**
```json
{
  "success": true,
  "data": {
    "soundscapes": [ { "id": "5688323a-2fd9-4a73-af65-29c211dc76e8", "title": "Distant Ocean Through Closed Balcony Doors", "mode": "sleep", "status": "live", "...": "..." } ],
    "result_count": 1,
    "applied_filters": {
      "modes": ["sleep"], "environments": null, "contains": null, "avoids": null,
      "animals": null, "instruments": null, "detail_levels": null,
      "min_duration": null, "max_duration": null, "sort": "a_z"
    }
  }
}
```
- **Errors:** `400` invalid `sort`, or `min_duration`/`max_duration` not a non-negative integer; `500` server/RPC error.
- **Verify against spec:** confirms live-only filtering + sort work; per the data-state note above,
  set at least one soundscape live first or `soundscapes` will be `[]` with `result_count: 0`.

#### `GET /api/soundscapes`
- **Auth:** none.
- **Path/query params:** none. **Body:** none.
- **Success response (200):**
```json
{ "success": true, "data": { "soundscapes": { "sleep": { "Go Back to Sleep": [ { "id": "...", "title": "..." } ] }, "relax": {}, "focus": {} } } }
```
- **Errors:** `500` server error.
- **Verify:** grouped by `mode` → `subcategory`; empty (all three mode keys present but empty) until soundscapes are live.

#### `GET /api/soundscapes/search`
- **Auth:** none.
- **Query params:** `q` (required, string).
- **Body:** none.
- **Example:** `GET /api/soundscapes/search?q=ocean`
- **Success response (200):** `{ "success": true, "data": { "soundscapes": [ /* full soundscape rows */ ] } }`
- **Errors:** `400` missing/empty `q`; `500` RPC error.
- **Verify:** per data-state note #2, a hit here may be an accidental substring match inside the
  raw JSON blob rather than a real tag match — eyeball whether the matched soundscape's `contains`
  genuinely contains `q` as a clean tag or only as a substring of the blob.

#### `GET /api/soundscapes/suggestions`
- **Auth:** none.
- **Query params:** `q` (required).
- **Body:** none.
- **Example:** `GET /api/soundscapes/suggestions?q=rain`
- **Success response (200):**
```json
{ "success": true, "data": { "suggestions": [ { "id": "8301b75f-867a-43b3-88bf-ab066a20d5f5", "title": "Gentle Rain Beyond Thick Glass", "subcategory": "Go Back to Sleep", "mode": "sleep" } ] } }
```
(max 8, matches `title`/`subcategory` only)
- **Errors:** `400` missing `q`; `500` server error.
- **Verify:** confirms title/subcategory-only matching (see data-state note — this endpoint is unaffected by the array-string issue).

#### `GET /api/soundscapes/mode/:mode`
- **Auth:** none.
- **Path params:** `:mode` → `sleep` (also valid: `relax`, `focus`).
- **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "mode": "sleep", "soundscapes": { "Go Back to Sleep": [ /* rows */ ] } } }`
- **Errors:** `400` invalid mode; `500` server error.
- **Verify:** only `live` rows for that mode appear.

#### `GET /api/soundscapes/:id/details`
- **Auth:** none.
- **Path params:** `:id` → `5688323a-2fd9-4a73-af65-29c211dc76e8`.
- **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "soundscape": { "id": "...", "title": "...", "contains": [...], "does_not_contain": [...], "...": "..." } } }`
- **Errors:** `404` not found or not live; `500` server error.
- **Verify:** returns full row (`select("*")`) only when `status = 'live'` — test both a live id (200) and the same id before it's set live (404).

#### `GET /api/soundscapes/:id/similar`
- **Auth:** none.
- **Path params:** `:id` → a live soundscape id.
- **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "soundscapes": [ { "...soundscape fields...", "similarity_score": 4 } ] } }` (top 6, same-mode candidates only, `similarity_score` = subcategory match(+3) + same-mode(+1) + shared contains/animals/instruments/sound_sources elements (capped at +5)).
- **Errors:** `404` source not found or not live; `500` server error.
- **Verify:** per data-state note #2, the array-overlap component of `similarity_score` will effectively always be 0 right now — confirm score is driven by subcategory/mode only, and that excluded/irrelevant-mode soundscapes never appear.

#### `GET /api/collections`
- **Auth:** none. **Path/query params:** none. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "collections": [ { "id": "...", "slug": "...", "title": "...", "is_published": true, "...": "..." } ] } }`
- **Errors:** `500` server error.
- **Verify:** empty until an admin creates + publishes a collection (`is_published = true`).

#### `GET /api/collections/popular`
- **Auth:** none. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "collections": [ { "...": "...", "popularity_score": 3 } ] } }` (top 10, `popularity_score` = sum of play-history count + favourites count across live member soundscapes).
- **Errors:** `500` server error.
- **Verify:** score should rise as you add plays/favourites to a live soundscape that's a member of the collection.

#### `GET /api/collections/:id`
- **Auth:** none.
- **Path params:** `:id` → a published collection id.
- **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "collection": { "id": "...", "title": "...", "soundscapes": [ /* ordered, live-only member rows */ ] } } }`
- **Errors:** `404` not found or not published; `500` server error.
- **Verify:** member list only includes soundscapes that are both in `collection_soundscapes` and currently `status = 'live'`; order matches `sort_order`.

#### `GET /api/explore`
- **Auth:** none. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "groups": [ { "group": "nature", "collections": [ /* published collections with live members */ ] } ] } }`. Each collection includes live-only `soundscape_count` and `soundscape_modes` metadata. Unclassified collections fall back to `editorial`.
- **Errors:** `500` server error.
- **Verify:** collections with no live members are excluded; non-live members neither count nor contribute a mode; a null `explore_group` does not make an otherwise valid collection disappear.

---

## Recommendations & Home

#### `GET /api/recommendations`
- **Auth:** Optional Bearer — signed-in users are scored against `user_sound_preferences` +
  `user_onboarding`; guests/no-preference users fall back to most-played/popular.
- **Query params:** `count` (optional, integer 0–20, default 4 — number of alternatives).
- **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "best_match": { /* soundscape */ } , "alternatives": [ /* up to `count` soundscapes */ ] } }` (`best_match: null`, `alternatives: []` if no live soundscapes exist).
- **Errors:** `400` `count` not an integer or `> 20`; `500` server error.
- **Verify:** with `excluded_sounds` set via onboarding/preferences, confirm excluded soundscapes never appear as `best_match` or in `alternatives` — but see data-state note #2: exclusion matching against `contains/sound_sources/animals/instruments` is currently blunted by the JSON-string format, so a soundscape whose *stringified blob* doesn't literally contain the excluded word as a substring will not be excluded even if it semantically should be.

#### `GET /api/home/recommended`
- **Auth:** Optional Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "soundscapes": [ /* top 10, same ranking as /api/recommendations */ ] } }`
- **Errors:** `500` server error.
- **Verify:** ordering should match the `best_match` + `alternatives` order from `/api/recommendations` for the same user/guest state.

#### `GET /api/home/continue-listening`
- **Auth:** Bearer.
- **Body:** none.
- **Success response (200):**
```json
{ "success": true, "data": { "items": [ { "soundscape": { "...": "..." }, "position_seconds": 42, "duration_seconds": 30, "updated_at": "2026-08-15T10:00:00.000Z" } ] } }
```
- **Errors:** `401` no/invalid token; `500` server error.
- **Verify:** only shows plays with `completed = false` on a currently-live soundscape, de-duplicated to one (most recent) entry per soundscape, newest first, capped at 20.

---

## Player State

#### `PUT /api/player/state`
- **Auth:** Bearer.
- **Body:**
```json
{
  "soundscape_id": "5688323a-2fd9-4a73-af65-29c211dc76e8",
  "position_seconds": 12,
  "duration_seconds": 30,
  "queue": ["5688323a-2fd9-4a73-af65-29c211dc76e8", "8301b75f-867a-43b3-88bf-ab066a20d5f5"],
  "timer_minutes": 15
}
```
(`soundscape_id`, `position_seconds` required; `duration_seconds`, `queue`, `timer_minutes` optional)
- **Success response (200):** `{ "success": true, "data": { "player_state": { "user_id": 1, "soundscape_id": "...", "position_seconds": 12, "queue": [...], "updated_at": "..." } } }`
- **Errors:** `400` missing `soundscape_id`/invalid `position_seconds`/`queue` not array of strings; `400` soundscape not found or not live; `401` no token; `500` server error.
- **Verify:** confirms this is a single-row upsert per user (`onConflict: "user_id"`) — calling twice with different soundscapes replaces, doesn't accumulate.

#### `GET /api/player/state`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "player_state": { /* row */ } } }` or `{ "success": true, "data": { "player_state": null } }` if never saved.
- **Errors:** `401` no token; `500` server error.

---

## Onboarding

#### `POST /api/onboarding`
- **Auth:** Bearer.
- **Body — Focus/Sleep** (`mode_breakers` / `mode_areas` / `target_minutes`):
```json
{
  "mode": "focus",
  "mode_breakers": ["Background noise", "Phone distractions"],
  "mode_areas": ["At a desk", "Studying"],
  "target_minutes": 45
}
```
- **Body — Relax** (`main_goal` / `relax_causes` / `calming_moments` instead):
```json
{
  "mode": "relax",
  "main_goal": "Manage daily stress",
  "relax_causes": ["Work", "Overthinking"],
  "calming_moments": "In the evenings"
}
```
(`mode` is the only required field. Send only the fields your mode uses — omitted ones stay at `[]`/`null`. `target_minutes` is plain integer minutes, never `"45 min"`. See API_CONTRACT_ONBOARDING_GOALS.md for the per-mode option lists.)
- **Errors:** `400` invalid/missing `mode`, malformed array, non-integer `target_minutes`; `401` no token; `500` server error.
- **Verify:** confirm the other mode family reads back as `[]`/`null`, and that `users.onboarding_completed` flipped to `true`. This endpoint does **not** write to `user_sound_preferences` — use `PUT /api/preferences/sound` for Sound Preferences / Sounds to Avoid.

#### `GET /api/onboarding`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "onboarding": { /* same 8 fields POST accepts, + bookkeeping */ } } }` or `{ "onboarding": null }` if never completed.
- **Errors:** `401` no token; `500` server error.

#### `PATCH /api/onboarding`
- **Auth:** Bearer. **Body:** `{ "mode": "focus" }` (required, one of `sleep`/`relax`/`focus`).
- Updates **only** `mode`; the other 7 answers are left as stored.
- **Success response (200):** `{ "success": true, "data": { "onboarding": { /* full row, mode + updated_at changed */ } } }`
- **Errors:** `400` invalid `mode`, or onboarding was never completed; `401` no token; `500` server error.
---

## Favourites

#### `POST /api/favourites`
- **Auth:** Bearer.
- **Body:** `{ "soundscape_id": "5688323a-2fd9-4a73-af65-29c211dc76e8" }`
- **Success response (200):** `{ "success": true, "data": { "favourite": { "id": 1, "user_id": 1, "soundscape_id": "...", "created_at": "..." } } }`
- **Errors:** `400` missing `soundscape_id`; `400` soundscape not found/not live; `400` already favourited; `401` no token; `500` server error.
- **Verify:** requires the soundscape to be `live` first (data-state note #1).

#### `GET /api/favourites`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "favourites": [ { "id": 1, "soundscape_id": "...", "created_at": "...", "soundscape": { "...": "..." } } ] } }`
- **Errors:** `401` no token; `500` server error.
- **Verify:** inner-joined to live soundscapes — a favourite whose soundscape later goes non-live disappears from this list even though the row still exists.

#### `DELETE /api/favourites/:soundscapeId`
- **Auth:** Bearer.
- **Path params:** `:soundscapeId` → `5688323a-2fd9-4a73-af65-29c211dc76e8`.
- **Body:** No body.
- **Success response (200):** `{ "success": true, "data": { "favourite": { /* deleted row */ } } }`
- **Errors:** `401` no token; `404` favourite not found; `500` server error.

---

## Playlists

#### `POST /api/playlists`
- **Auth:** Bearer.
- **Body:** `{ "name": "Sleep Mix", "description": "Wind-down sounds", "cover_image_url": null }` (only `name` required)
- **Success response (201):** `{ "success": true, "data": { "playlist": { "id": "...", "user_id": 1, "name": "Sleep Mix", "description": "Wind-down sounds", "cover_image_url": null, "created_at": "...", "updated_at": "..." } } }`
- **Errors:** `400` empty `name`; `401` no token; `500` server error.

#### `GET /api/playlists`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "playlists": [ { "id": "...", "name": "Sleep Mix", "item_count": 2, "...": "..." } ] } }` (ordered by `updated_at` desc)
- **Errors:** `401` no token; `500` server error.

#### `GET /api/playlists/:id`
- **Auth:** Bearer.
- **Path params:** `:id` → playlist id from the create response.
- **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "playlist": { "id": "...", "name": "Sleep Mix", "items": [ { "playlist_id": "...", "soundscape_id": "...", "sort_order": 0, "added_at": "...", "soundscape": { "...": "..." } } ] } } }`
- **Errors:** `401` no token; `404` playlist not found (wrong id or not owned by this user); `500` server error.
- **Verify:** `items` only includes members whose soundscape is currently live.

#### `PUT /api/playlists/:id`
- **Auth:** Bearer.
- **Path params:** `:id`.
- **Body:** `{ "name": "Deep Sleep Mix" }` (any of `name`/`description`/`cover_image_url`, at least one required)
- **Success response (200):** `{ "success": true, "data": { "playlist": { "...updated row..." } } }`
- **Errors:** `400` empty `name` or no fields supplied; `401` no token; `404` not found; `500` server error.

#### `DELETE /api/playlists/:id`
- **Auth:** Bearer. **Path params:** `:id`. **Body:** No body.
- **Success response (200):** `{ "success": true, "data": { "message": "Playlist deleted successfully" } }`
- **Errors:** `401` no token; `404` not found; `500` server error.

#### `POST /api/playlists/:id/items`
- **Auth:** Bearer.
- **Path params:** `:id` → playlist id.
- **Body:** `{ "soundscape_id": "5688323a-2fd9-4a73-af65-29c211dc76e8" }`
- **Success response (201):** `{ "success": true, "data": { "item": { "playlist_id": "...", "soundscape_id": "...", "sort_order": 0, "added_at": "...", "soundscape": { "...full soundscape row..." } } } }`
- **Errors:** `400` missing `soundscape_id`, not live, or already in playlist; `401` no token; `404` playlist not found; `500` server error.

#### `DELETE /api/playlists/:id/items/:soundscapeId`
- **Auth:** Bearer. **Path params:** `:id`, `:soundscapeId`. **Body:** No body.
- **Success response (200):** `{ "success": true, "data": { "message": "Playlist item removed successfully" } }`
- **Errors:** `401` no token; `404` playlist or item not found; `500` server error.

#### `PUT /api/playlists/:id/reorder`
- **Auth:** Bearer.
- **Path params:** `:id`.
- **Body:** `{ "soundscape_ids": ["8301b75f-867a-43b3-88bf-ab066a20d5f5", "5688323a-2fd9-4a73-af65-29c211dc76e8"] }` — must be the **exact** current set of item ids, just reordered.
- **Success response (200):** `{ "success": true, "data": { "items": [ /* items in new order, live-only */ ] } }`
- **Errors:** `400` not an array, contains duplicates/empties, or doesn't exactly match current items; `401` no token; `404` playlist not found; `500` server error.
- **Verify:** add two live soundscapes to a playlist first, then reorder and confirm `sort_order` flips in the response.

---

## Downloads

#### `POST /api/downloads`
- **Auth:** Bearer.
- **Body:** `{ "soundscape_id": "5688323a-2fd9-4a73-af65-29c211dc76e8", "quality": "standard" }` (`quality` optional, default `standard`, or `high`)
- **Success response (200):** `{ "success": true, "data": { "download": { "id": 1, "user_id": 1, "soundscape_id": "...", "quality": "standard", "status": "queued", "progress_percent": 0, "downloaded_bytes": 0, "file_size_bytes": null, "updated_at": "..." } } }`
- **Errors:** `400` missing `soundscape_id`, invalid `quality`, or not live; `401` no token; `500` server error.
- **Verify:** calling again for the same `soundscape_id` resets status back to `queued` (upsert on `user_id,soundscape_id`) rather than erroring as a duplicate.

#### `GET /api/downloads`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "downloads": [ { "id": 1, "quality": "standard", "status": "queued", "soundscape": { "title": "...", "artwork_url": null, "mode": "sleep", "duration_seconds": 30 } } ] } }`
- **Errors:** `401` no token; `500` server error.

#### `GET /api/downloads/storage`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "total_bytes": 0, "count": 0 } }`
- **Errors:** `401` no token; `500` server error.
- **Verify:** only `status = "completed"` downloads count toward `total_bytes`/`count` — set a download to `completed` via the status endpoint first to see it change.

#### `PUT /api/downloads/:soundscapeId/status`
- **Auth:** Bearer.
- **Path params:** `:soundscapeId`.
- **Body:** `{ "status": "completed", "progress_percent": 100, "downloaded_bytes": 4096000 }` (`status` required; `progress_percent` 0–100 and `downloaded_bytes` ≥0 optional)
- **Success response (200):** `{ "success": true, "data": { "download": { "...updated row..." } } }`
- **Errors:** `400` invalid `status`/`progress_percent`/`downloaded_bytes`; `401` no token; `404` download not found (create it via `POST /api/downloads` first); `500` server error.

#### `DELETE /api/downloads/:soundscapeId`
- **Auth:** Bearer. **Path params:** `:soundscapeId`. **Body:** No body.
- **Success response (200):** `{ "success": true, "data": { "download": { /* deleted row */ } } }`
- **Errors:** `401` no token; `404` not found; `500` server error.

#### `DELETE /api/downloads`
- **Auth:** Bearer. **Body:** No body.
- **Success response (200):** `{ "success": true, "data": { "deleted_count": 2 } }`
- **Errors:** `401` no token; `500` server error.
- **Verify:** deletes **all** of the user's download records at once — confirm `GET /api/downloads` is empty afterward.

---

## Play History

#### `POST /api/play-history`
- **Auth:** Bearer.
- **Body:** `{ "soundscape_id": "5688323a-2fd9-4a73-af65-29c211dc76e8", "position_seconds": 15, "completed": false, "listened_seconds": 15 }` (only `soundscape_id` required)
- **Success response (200):** `{ "success": true, "data": { "play_history": { "id": 1, "user_id": 1, "soundscape_id": "...", "position_seconds": 15, "completed": false, "listened_seconds": 15, "played_at": "..." } } }`
- **Errors:** `400` missing `soundscape_id`, invalid numeric field, `completed` not boolean, or soundscape not live; `401` no token; `500` server error.
- **Verify:** each call inserts a **new** row (not an upsert) — call it once with `completed: false` to populate continue-listening, then again with `completed: true` for the same soundscape and confirm it drops out of `/api/home/continue-listening`.

#### `GET /api/play-history`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "play_history": [ { "id": 1, "soundscape_id": "...", "played_at": "...", "soundscape": { "...": "..." } } ] } }` (most recent 50, live-only)
- **Errors:** `401` no token; `500` server error.

---

## Preferences

#### `GET /api/preferences/sound`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "preferences": { "user_id": 1, "preferred_environments": [], "preferred_sounds": [], "preferred_animals": [], "preferred_instruments": [], "excluded_sounds": [], "detail_preference": null, "typical_duration": null, "intensity_preference": null, "updated_at": null } } }` (defaults shown if never set)
- **Errors:** `401` no token; `500` server error.

#### `PUT /api/preferences/sound`
- **Auth:** Bearer.
- **Body:** `{ "excluded_sounds": ["gulls", "voices"], "detail_preference": "minimal", "intensity_preference": 2 }` (any subset of `preferred_environments/preferred_sounds/preferred_animals/preferred_instruments/excluded_sounds` (string arrays), `detail_preference` (`minimal|balanced|rich`), `typical_duration` (string|null), `intensity_preference` (1–5))
- **Success response (200):** `{ "success": true, "data": { "preferences": { "...merged row..." } } }`
- **Errors:** `400` invalid field type/value; `401` no token; `500` server error.
- **Verify:** this is a partial upsert merged over existing values, not a full replace — set one field, then set a different field, and confirm the first one survived.

#### `GET /api/preferences/playback`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "settings": { "user_id": 1, "background_playback": true, "default_timer_minutes": null, "fade_enabled": true, "end_behaviour": "silent", "quality": "standard", "autoplay_next": false, "updated_at": null } } }`
- **Errors:** `401` no token; `500` server error.

#### `PUT /api/preferences/playback`
- **Auth:** Bearer.
- **Body:** `{ "background_playback": false, "default_timer_minutes": 30, "fade_enabled": true, "end_behaviour": "gentle_tone", "quality": "high", "autoplay_next": true }` (all optional)
- **Success response (200):** `{ "success": true, "data": { "settings": { "...": "..." } } }`
- **Errors:** `400` invalid type/enum value; `401` no token; `500` server error.

#### `GET /api/preferences/downloads`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "settings": { "user_id": 1, "wifi_only": true, "quality": "standard", "updated_at": null } } }`
- **Errors:** `401` no token; `500` server error.

#### `PUT /api/preferences/downloads`
- **Auth:** Bearer.
- **Body:** `{ "wifi_only": false, "quality": "high" }` (both optional)
- **Success response (200):** `{ "success": true, "data": { "settings": { "...": "..." } } }`
- **Errors:** `400` invalid type/enum value; `401` no token; `500` server error.

#### `GET /api/preferences/notifications`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "settings": { "user_id": 1, "reminders_enabled": false, "new_collection_alerts": false, "updated_at": null } } }`
- **Errors:** `401` no token; `500` server error.

#### `PUT /api/preferences/notifications`
- **Auth:** Bearer.
- **Body:** `{ "reminders_enabled": true, "new_collection_alerts": true }` (both optional booleans)
- **Success response (200):** `{ "success": true, "data": { "settings": { "...": "..." } } }`
- **Errors:** `400` non-boolean value; `401` no token; `500` server error.
- **Verify:** set `new_collection_alerts: true` here before testing the admin alert endpoint below — otherwise no user is eligible and `users_notified` will be `0`.

---

## Notifications (device + admin alert)

#### `POST /api/notifications/register-device`
- **Auth:** Bearer.
- **Body:** `{ "token": "fcm-test-token-abc123", "platform": "android" }` (`platform` one of `ios, android, web`)
- **Success response (200):** `{ "success": true, "data": { "device": { "id": 1, "user_id": 1, "token": "fcm-test-token-abc123", "platform": "android", "...": "..." } } }`
- **Errors:** `400` missing `token`/invalid `platform`; `401` no token; `500` server error.
- **Verify:** re-registering the same `token` for the same user upserts (`onConflict: user_id,token`) rather than erroring.

#### `DELETE /api/notifications/device/:token`
- **Auth:** Bearer.
- **Path params:** `:token` → `fcm-test-token-abc123`.
- **Body:** No body.
- **Success response (200):** `{ "success": true, "data": { "message": "Device unregistered successfully" } }` (returns success even if the token didn't exist — delete is not existence-checked)
- **Errors:** `401` no token; `500` server error.

#### `POST /api/admin/notifications/new-collection-alert`
- **Auth:** Admin (Bearer + `is_admin = true`).
- **Body:** `{ "collection_id": "<a real collection id>", "title": "New: Rainy Nights", "body": "A new collection just landed." }`
- **Success response (200):** `{ "success": true, "data": { "users_notified": 1, "push_configured": false, "queued": 1, "sent": 0, "failed": 0 } }` (writes one `notifications_log` row per user who has `new_collection_alerts = true` **and** at least one registered device; if `FCM_SERVER_KEY` isn't configured, rows are left `status = "queued"` instead of failing)
- **Errors:** `400` missing `collection_id`/`title`/`body`, or unknown `collection_id`; `401` no token; `403` not admin; `500` server error.
- **Verify:** the collection lookup here does **not** require `is_published` — an unpublished draft collection id still passes.

---

## Support

#### `POST /api/support/contact`
- **Auth:** Optional Bearer — guests must supply `contact_email`.
- **Body:** `{ "subject": "Question about downloads", "message": "How much storage do downloads use?", "contact_email": "guest@example.com" }` (`message` required; `subject`/`contact_email` optional for signed-in users, `contact_email` required for guests)
- **Success response (201):** `{ "success": true, "data": { "request": { "id": 1, "user_id": null, "type": "contact_support", "subject": "...", "message": "...", "contact_email": "guest@example.com", "created_at": "..." } } }`
- **Errors:** `400` missing `message`, or guest missing `contact_email`; `500` server error.

#### `POST /api/support/report-audio-problem`
- **Auth:** Optional Bearer.
- **Body:** `{ "soundscape_id": "5688323a-2fd9-4a73-af65-29c211dc76e8", "message": "Audio cuts out at 20s", "contact_email": "guest@example.com" }` (`soundscape_id` required and must be a UUID; `message` optional — defaults to "Audio problem reported")
- **Success response (201):** `{ "success": true, "data": { "request": { "id": 2, "type": "report_audio_problem", "subject": "Audio issue: Distant Ocean Through Closed Balcony Doors", "soundscape_id": "...", "...": "..." } } }`
- **Errors:** `400` missing/malformed `soundscape_id`, unknown soundscape, or guest missing `contact_email`; `500` server error.
- **Verify:** unlike most soundscape lookups, this one does **not** require `status = 'live'` — a draft soundscape id still resolves.

#### `POST /api/support/request-soundscape`
- **Auth:** Optional Bearer.
- **Body:** `{ "message": "Please add a thunderstorm soundscape", "contact_email": "guest@example.com" }` (`message` required)
- **Success response (201):** `{ "success": true, "data": { "request": { "id": 3, "type": "request_soundscape", "subject": null, "message": "...", "...": "..." } } }`
- **Errors:** `400` missing `message`, or guest missing `contact_email`; `500` server error.

#### `GET /api/support/my-requests`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "requests": [ /* all 3 request types, newest first */ ] } }`
- **Errors:** `401` no token; `500` server error.

---

## Analytics

#### `POST /api/analytics/events`
- **Auth:** Optional Bearer — guests may pass `session_id` to group events.
- **Body (single event):** `{ "event_name": "soundscape_played", "event_data": { "soundscape_id": "5688323a-2fd9-4a73-af65-29c211dc76e8" }, "session_id": "guest-session-1" }`
  **Body (batch):** `{ "events": [ { "event_name": "app_opened" }, { "event_name": "soundscape_played", "event_data": { "soundscape_id": "..." } } ] }`
- **Success response (200):** `{ "success": true, "data": { "logged": 1, "events": [ { "id": 1, "event_name": "soundscape_played", "event_data": { "...": "..." }, "session_id": "guest-session-1", "created_at": "..." } ] } }`
- **Errors:** `400` neither `event_name` nor `events` present, `events` empty/not array, or an item missing `event_name`; `500` server error.
- **Verify:** confirms it never rejects on a malformed `event_data` — send `event_data: "not an object"` and confirm it's silently wrapped as `{ "value": "not an object" }` rather than erroring (per `Controller/Analytics.ts:27-37`).

---

## Help

#### `GET /api/help`
- **Auth:** none. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "categories": [ { "category": "Getting Started", "articles": [ { "slug": "how-to-download", "title": "...", "sort_order": 0 } ] } ] } }`
- **Errors:** `500` server error.
- **Verify:** empty until an admin creates + publishes an article (see admin section below).

#### `GET /api/help/:slug`
- **Auth:** none.
- **Path params:** `:slug` → `how-to-download` (or whatever slug you created).
- **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "article": { "id": "...", "slug": "how-to-download", "category": "Getting Started", "title": "...", "body": "...", "is_published": true, "sort_order": 0 } } }`
- **Errors:** `404` not found or not published; `500` server error.

#### `POST /api/admin/help`
- **Auth:** Admin.
- **Body:** `{ "slug": "how-to-download", "category": "Getting Started", "title": "How to download a soundscape", "body": "Tap the download icon...", "sort_order": 0 }` (`slug`, `category`, `title`, `body` required)
- **Success response (201):** `{ "success": true, "data": { "article": { "...": "...", "is_published": false } } }` (always created unpublished)
- **Errors:** `400` empty required field, or duplicate `slug`; `401` no token; `403` not admin; `500` server error.

#### `GET /api/admin/help`
- **Auth:** Admin. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "articles": [ /* all articles, published + unpublished */ ] } }`
- **Errors:** `401`/`403`; `500`.

#### `GET /api/admin/help/:id`
- **Auth:** Admin. **Path params:** `:id` → article id. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "article": { /* row */ } } }`
- **Errors:** `401`/`403`; `404` not found; `500`.

#### `PUT /api/admin/help/:id`
- **Auth:** Admin.
- **Path params:** `:id`.
- **Body:** `{ "title": "How to download a soundscape for offline use" }` (any of `slug/category/title/body/sort_order`, at least one)
- **Success response (200):** `{ "success": true, "data": { "article": { "...updated..." } } }`
- **Errors:** `400` empty text field or duplicate `slug`; `401`/`403`; `404`; `500`.

#### `PUT /api/admin/help/:id/publish`
- **Auth:** Admin.
- **Path params:** `:id`.
- **Body:** `{ "is_published": true }`
- **Success response (200):** `{ "success": true, "data": { "article": { "is_published": true, "...": "..." } } }`
- **Errors:** `400` `is_published` not boolean; `401`/`403`; `404`; `500`.
- **Verify:** publish, then confirm `GET /api/help/:slug` now returns 200 for it.

#### `DELETE /api/admin/help/:id`
- **Auth:** Admin. **Path params:** `:id`. **Body:** No body.
- **Success response (200):** `{ "success": true, "data": { "message": "Help article deleted successfully" } }`
- **Errors:** `401`/`403`; `404`; `500`.

---

## Account

#### `GET /api/account/export`
- **Auth:** Bearer. **Body:** none.
- **Success response (200):** `{ "success": true, "data": { "exported_at": "...", "account": { "id": 1, "email": "...", "name": "..." }, "favourites": [...], "playlists": [ { "...": "...", "items": [...] } ], "downloads": [...], "play_history": { "entries": [...] }, "onboarding": null, "player_state": null, "device_tokens": [...], "sound_preferences": { "...": "..." }, "playback_settings": { "...": "..." }, "download_settings": { "...": "..." }, "notification_settings": { "...": "..." }, "support_requests": [...] } }`
- **Errors:** `401` no token; `500` server error.
- **Verify:** run this after exercising the other endpoints and confirm every prior write (a favourite, a playlist, a download, a play, a support request) shows up here — this is meant to be a complete data dump.

#### `POST /api/account/import-guest-data`
- **Auth:** Bearer.
- **Body (all optional):**
```json
{
  "favourites": ["5688323a-2fd9-4a73-af65-29c211dc76e8"],
  "playlists": [ { "name": "Guest Mix", "soundscape_ids": ["8301b75f-867a-43b3-88bf-ab066a20d5f5"] } ],
  "sound_preferences": { "excluded_sounds": ["gulls"] },
  "mode": "relax",
  "main_goal": "Manage daily stress",
  "relax_causes": ["Work", "Overthinking"],
  "calming_moments": "In the evenings"
}
```
- **Success response (200):** `{ "success": true, "data": { "favourites_added": 1, "favourites_skipped": 0, "playlists_created": 1, "playlist_items_skipped": 0, "preferences_applied": true, "onboarding_applied": true } }` (adds `preferences_note`/`onboarding_note` instead of applying if the account already has preferences/onboarding)
- **Errors:** `400` malformed playlist entry (missing `name`) or invalid `sound_preferences`/`mode`/`target_minutes`/any onboarding array; `401` no token; `500` server error.
- Accepts the same 8 onboarding fields as `POST /api/onboarding` under the same names — swap the Relax trio above for `mode_breakers`/`mode_areas`/`target_minutes` to import a Focus or Sleep guest. Onboarding is applied only if the account has no `user_onboarding` row yet.
- **Verify:** non-live or already-favourited soundscape ids are silently skipped (counted in `favourites_skipped`/`playlist_items_skipped`), not rejected — this is a best-effort import, not all-or-nothing.

#### `DELETE /api/delete-account`
- **Auth:** Bearer.
- **Body:** No body.
- **Success response (200):** `{ "success": true, "data": { "message": "Account deleted successfully" } }`
- **Errors:** `401` no/invalid token; `500` server error.
- **⚠️ Destructive — run this last, on a throwaway test account.** Deletes rows from
  `user_favourites, user_downloads, user_play_history, user_sound_preferences,
  user_playback_settings, user_download_settings, user_notification_settings, user_playlists,
  user_player_state, user_onboarding, user_device_tokens`, removes any avatar storage files, deletes
  the `public.users` row, then deletes the Supabase **auth** user itself — the account cannot sign in
  again afterward.
- **Verify:** immediately after, confirm the same Bearer token now fails on any endpoint with `401`, and that a fresh `POST /api/signin` for that email fails.

---

## Admin / CMS

All endpoints below require **Admin** auth (Bearer token whose `users.is_admin = true` — see the
prerequisite note at the top of this guide).

### Soundscapes

#### `POST /api/admin/soundscapes`
- **Body:** `{ "mode": "sleep", "subcategory": "Go Back to Sleep", "title": "Test Soundscape", "contains": ["ocean waves"], "does_not_contain": ["voices"], "animals": [], "instruments": [], "duration_seconds": 30, "detail_level": "minimal" }` (`mode`, `subcategory`, `title` required; array fields must be **real arrays of separate strings** — see data-state note #2 for the format bug to avoid repeating)
- **Success response (201):** `{ "success": true, "data": { "soundscape": { "id": "...", "status": "draft", "contains": ["ocean waves"], "...": "..." } } }`
- **Errors:** `400` missing required field, wrong type, or a `science_note` containing a prohibited claim phrase (see `PROHIBITED_SCIENCE_NOTE_PHRASES` in `Controller/Admin.ts:65-81`, e.g. the word "heal"); `401`/`403`; `500`.
- **Verify:** `status` is always forced to `"draft"` regardless of what's sent.

#### `GET /api/admin/soundscapes`
- **Query params:** `status` (optional, one of `draft, master_review, tags_verified, release_approved, live, revised, retired`).
- **Success response (200):** `{ "success": true, "data": { "soundscapes": [ /* all statuses unless filtered */ ] } }`
- **Errors:** `400` invalid `status`; `401`/`403`; `500`.

#### `GET /api/admin/soundscapes/:id`
- **Path params:** `:id`.
- **Success response (200):** `{ "success": true, "data": { "soundscape": { /* any status */ } } }`
- **Errors:** `401`/`403`; `404`; `500`.

#### `PUT /api/admin/soundscapes/:id`
- **Path params:** `:id`.
- **Body:** `{ "one_line_description": "Soft distant surf behind a closed door", "intensity": 2 }` (any editable field except `status`; a supplied `status` is silently ignored, with `data.note` explaining that)
- **Success response (200):** `{ "success": true, "data": { "soundscape": { "...updated..." } } }`
- **Errors:** `400` invalid field value, or zero editable fields supplied with no status either; `401`/`403`; `404`; `500`.

#### `PUT /api/admin/soundscapes/:id/status`
- **Path params:** `:id`.
- **Body:** `{ "status": "live" }`
- **Success response (200):** `{ "success": true, "data": { "soundscape": { "status": "live", "...": "..." } } }`
- **Errors:** `400` invalid status; `401`/`403`; `404`; `500`.
- **Verify:** this is the endpoint to use for the "set live" prerequisite step.

#### `DELETE /api/admin/soundscapes/:id`
- **Path params:** `:id`.
- **Success response (200):** `{ "success": true, "data": { "message": "Soundscape deleted successfully" } }`
- **Errors:** `400` soundscape is not `draft` status ("Only draft soundscapes can be deleted. Set this soundscape to retired instead."), or still referenced by a collection (`23503`); `401`/`403`; `404`; `500`.

#### `POST /api/admin/soundscapes/:id/revise`
- **Path params:** `:id`.
- **Body:** No body.
- **Success response (201):** `{ "success": true, "data": { "soundscape": { "id": "<new id>", "status": "draft", "version_of": "<original id>", "catalogue_ref": null }, "original": { /* unmodified original row */ } } }`
- **Errors:** `401`/`403`; `404`; `500`.
- **Verify:** the original row's `status` is untouched by this call — confirm it separately with the status endpoint if you want it `revised`.

#### `GET /api/admin/soundscapes/:id/tag-events`
- **Path params:** `:id`.
- **Success response (200):** `{ "success": true, "data": { "tag_events": [ /* newest first */ ] } }`
- **Errors:** `401`/`403`; `404` soundscape not found; `500`.

#### `POST /api/admin/soundscapes/:id/tag-events`
- **Path params:** `:id`.
- **Body:** `{ "tag_group": "contains", "tag_value": "ocean waves", "state": "verified", "source": "manual QA" }` (`tag_group` one of `contains, does_not_contain, animals, instruments, sound_sources, search_keywords`; `tag_value` required; `state` one of `intended, generated, detected, verified`; `source` optional)
- **Success response (201):** `{ "success": true, "data": { "tag_event": { "id": 1, "soundscape_id": "...", "tag_group": "contains", "tag_value": "ocean waves", "state": "verified", "source": "manual QA", "created_at": "..." } } }`
- **Errors:** `400` invalid `tag_group`/`tag_value`/`state`/`source`; `401`/`403`; `404`; `500`.
- **Verify:** this only logs governance history — it does **not** write into the soundscape's own `contains` array (per the route doc comment); confirm `GET /api/admin/soundscapes/:id` is unchanged afterward.

### Collections

#### `POST /api/admin/collections`
- **Body:** `{ "slug": "rainy-nights", "title": "Rainy Nights", "description": "Sounds for stormy evenings", "mode": "sleep", "explore_group": "weather", "sort_order": 0 }` (`slug`, `title` required)
- **Success response (201):** `{ "success": true, "data": { "collection": { "id": "...", "is_published": false, "...": "..." } } }`
- **Errors:** `400` missing `slug`/`title`, invalid `mode`/`explore_group`, or duplicate `slug`; `401`/`403`; `500`.

#### `GET /api/admin/collections`
- **Success response (200):** `{ "success": true, "data": { "collections": [ { "...": "...", "item_count": 0 } ] } }`
- **Errors:** `401`/`403`; `500`.

#### `GET /api/admin/collections/:id`
- **Path params:** `:id`.
- **Success response (200):** `{ "success": true, "data": { "collection": { "...": "...", "item_count": 1, "soundscapes": [ { "...": "...", "collection_sort_order": 0 } ] } } }` (includes members of any status, unlike the public endpoint)
- **Errors:** `401`/`403`; `404`; `500`.

#### `PUT /api/admin/collections/:id`
- **Path params:** `:id`.
- **Body:** `{ "title": "Rainy Nights (Updated)" }` (any of `slug/title/description/cover_image_url/mode/explore_group/sort_order`, at least one)
- **Success response (200):** `{ "success": true, "data": { "collection": { "...updated..." } } }`
- **Errors:** `400` empty required field, invalid enum, duplicate slug, or zero fields; `401`/`403`; `404`; `500`.

#### `PUT /api/admin/collections/:id/publish`
- **Path params:** `:id`.
- **Body:** `{ "is_published": true }`
- **Success response (200):** `{ "success": true, "data": { "collection": { "is_published": true, "...": "..." } } }`
- **Errors:** `400` not boolean; `401`/`403`; `404`; `500`.
- **Verify:** publish, then confirm `GET /api/collections` and `GET /api/explore` now surface it.

#### `POST /api/admin/collections/:id/soundscapes`
- **Path params:** `:id` → collection id.
- **Body:** `{ "soundscape_id": "5688323a-2fd9-4a73-af65-29c211dc76e8", "sort_order": 0 }` (`soundscape_id` required; `sort_order` optional, auto-incremented if omitted; membership is **not** restricted to live soundscapes — any status can be added)
- **Success response (201):** `{ "success": true, "data": { "membership": { "collection_id": "...", "soundscape_id": "...", "sort_order": 0 }, "soundscape": { "...full row..." } } }`
- **Errors:** `400` missing `soundscape_id`, unknown soundscape, or already a member; `401`/`403`; `404` collection not found; `500`.

#### `DELETE /api/admin/collections/:id/soundscapes/:soundscapeId`
- **Path params:** `:id`, `:soundscapeId`.
- **Success response (200):** `{ "success": true, "data": { "message": "Soundscape removed from collection successfully" } }`
- **Errors:** `401`/`403`; `404` collection or membership not found; `500`.

### Remote Config

#### `GET /api/admin/remote-config`
- **Success response (200):** `{ "success": true, "data": { "entries": [ { "key": "min_app_version", "value": "1.0.0", "is_verified": false } ] } }` (includes unverified placeholders)
- **Errors:** `401`/`403`; `500`.

#### `GET /api/admin/remote-config/:key`
- **Path params:** `:key` → `min_app_version`.
- **Success response (200):** `{ "success": true, "data": { "entry": { "key": "min_app_version", "value": "1.0.0", "is_verified": false, "updated_at": "..." } } }`
- **Errors:** `401`/`403`; `404`; `500`.

#### `PUT /api/admin/remote-config/:key`
- **Path params:** `:key`.
- **Body:** `{ "value": "1.2.0", "is_verified": true }` (`value` required, any JSON-serializable value; `is_verified` optional — defaults to `false` on create, only changes on update when explicitly supplied)
- **Success response:** `200` on update / `201` on create — `{ "success": true, "data": { "entry": { "key": "min_app_version", "value": "1.2.0", "is_verified": true } } }`
- **Errors:** `400` missing `key`, missing/non-serializable `value`, or `is_verified` not boolean; `401`/`403`; `500`.

#### `DELETE /api/admin/remote-config/:key`
- **Path params:** `:key`.
- **Success response (200):** `{ "success": true, "data": { "message": "Remote config entry deleted successfully" } }`
- **Errors:** `401`/`403`; `404`; `500`.

#### `GET /api/remote-config/:key`
- **Auth:** none (public).
- **Path params:** `:key`.
- **Success response (200):** `{ "success": true, "data": { "key": "min_app_version", "value": "1.2.0" } }`
- **Errors:** `404` missing key **or** `is_verified = false` (both look identical — this is deliberate).
- **Verify:** set `is_verified: false` via the admin PUT and confirm this public endpoint 404s even though the key exists; set it `true` and confirm it returns.

---

## Reminder

Start the server (`npm run dev` / your usual start command), then `POST /api/signin` with a real
account's email/password to get an `access_token` — use that as `Authorization: Bearer <token>` for
every endpoint above marked **Auth: Bearer**. For **Auth: Admin** endpoints, that same account's
`public.users.is_admin` column must be `true` first (set directly in the database — see the
prerequisite note near the top of this guide).
