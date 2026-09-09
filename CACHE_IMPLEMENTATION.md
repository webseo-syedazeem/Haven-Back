# Backend read caching

Implemented entirely inside `Backend local/`. Routes, middleware, authentication, player/catalogue behavior, status codes and response envelopes are unchanged. Redis startup remains mandatory. Controllers cache successful JSON **data payloads**, never HTTP responses, errors or partial failed reads.

## Cached GET endpoints

All paths below start with `/api`. TTL constants live in `Utils/CacheHelper.ts`.

| Global content endpoint | Redis key | TTL (seconds) |
| --- | --- | ---: |
| `/soundscapes` | `soundscapes:all` | 3600 |
| `/soundscapes/mode/:mode` | `soundscapes:mode:<normalized-mode>` | 3600 |
| `/soundscapes/:id/details` | `soundscape:<id>:details` | 3600 |
| `/soundscapes/:id/similar` | `soundscape:<id>:similar` | 3600 |
| `/collections` | `collections:all` | 3600 |
| `/collections/popular` | `collections:popular` | 3600 |
| `/collections/:id` | `collection:<id>` | 3600 |
| `/explore` | `explore:groups` | 3600 |
| `/library` | `library:<sha256-of-effective-filters-and-sort>` | 600 |
| `/help` without an effective search term | `help:all` | 3600 |
| `/help/:slug` | `help:<URL-encoded-slug>` | 3600 |

An article whose slug is `all` uses `help:article:all`, avoiding a collision with the help list. UUID keys are lowercased. The soundscape list has no result-varying grouping query parameters in the existing implementation.

Library keys sort/deduplicate array values and sort object keys, with lowercase normalization for case-insensitive filters. The existing SQL compares `modes` and `detail_levels` with case-sensitive equality, so their case is preserved to avoid changing results. The key includes merged account exclusions, duration bounds and sort. Only catalogue rows/count are cached: `applied_filters` is reconstructed in the original property order, preserving the current request's spelling/order and keeping account preferences out of the shared cached value.

Authenticated library requests still resolve their profile and exclusions from the database before cache lookup. A hit skips the expensive filter RPC. This preserves immediate preference changes without caching private preference snapshots or modifying catalogue behavior.

| User endpoint | Redis key | TTL (seconds) |
| --- | --- | ---: |
| `/home/continue-listening` | `user:<authUserId>:continue-listening` | 60 |
| `/home/recommended` | `user:<authUserId>:home-recommended` | 60 |
| `/recommendations` | `user:<authUserId>:recommendations` | 60 |
| `/recommendations?count=N`, when N differs from default 4 | `user:<authUserId>:recommendations:count:<N>` | 60 |
| `/favourites` | `user:<authUserId>:favourites` | 60 |
| `/play-history` | `user:<authUserId>:play-history` | 60 |
| `/downloads` | `user:<authUserId>:downloads` | 60 |

`authUserId` is exclusively `req.user.id`, the authenticated Supabase UUID already used to resolve the database profile. Reads and invalidation use this same identifier. No query/body ID is trusted. Optional-auth recommendation requests without a nonblank ID bypass caching. Both recommendation endpoints are personalized.

## Deliberately uncached

- Soundscape search and suggestions: high-cardinality queries with low expected reuse.
- Help `?q=` / `?search=` queries: likewise bypass the cache; search never contaminates `help:all`.
- Anonymous recommendations: no shared null/guest user cache.
- Other GETs, including player state, download storage, preferences, playlists, admin lists, auth and account export: outside the requested GET list.
- All mutation responses remain uncached.

## Invalidation matrix

Invalidation is awaited after successful database writes and before responding. `invalidateUser(id, suffixes)` deletes each `user:<id>:<suffix>` and its `:<variant>` descendants, including all recommendation counts. It preserves other users' entries.

| Write controller / route | Keys deleted |
| --- | --- |
| `CreateAdminSoundscape`, `UpdateAdminSoundscape` when editable fields are written, `UpdateAdminSoundscapeStatus`, `DeleteAdminSoundscape`, `ReviseAdminSoundscape` | `soundscapes:*`, `soundscape:*`, `library:*`, `collections:*`, `collection:*`, `explore:groups`; every user's `continue-listening`, `home-recommended`, `recommendations*`, `favourites`, `play-history`, `downloads` |
| `CreateAdminCollection`, `UpdateAdminCollection`, `PublishAdminCollection`, `AddAdminCollectionSoundscape`, `RemoveAdminCollectionSoundscape` | `collections:*`, `collection:<id>`, `explore:groups` |
| `CreateAdminHelpArticle`, `UpdateAdminHelpArticle`, `PublishAdminHelpArticle`, `DeleteAdminHelpArticle` | `help:*`, covering the list and both old/new slugs |
| POST `/favourites`, DELETE `/favourites/:soundscapeId` | This user's `favourites`, `recommendations` plus all counts, `home-recommended`; global `collections:popular` |
| POST `/play-history` | This user's **`play-history` AND `continue-listening`**, plus `recommendations` and all counts, `home-recommended`; global `collections:popular` |
| PUT `/player/state` | This user's `continue-listening` |
| POST `/downloads`, PUT `/downloads/:soundscapeId/status`, DELETE `/downloads/:soundscapeId`, DELETE `/downloads` | This user's `downloads` |
| PUT `/preferences/sound` | This user's `recommendations` and all counts, `home-recommended`, `continue-listening` |
| POST `/onboarding` | Same preference keys after each committed onboarding/preference change |
| POST `/account/import-guest-data` | After favourite insertion: same keys as favourite writes. After preference/onboarding writes: same keys as preference writes |
| DELETE account (`DeleteAccount`) | All six of this user's cache families and recommendation variants; global `collections:popular` |

Soundscape invalidation intentionally clears all modes/details/similarities and embedded soundscape copies. Thus mode changes cover both old and new modes, and retired content cannot persist in user or collection caches. Collection membership invalidation also runs if a later timestamp update fails. Onboarding, guest import and account deletion cover changes committed before a later operation fails.

Preference changes change the next library key immediately through the freshly resolved effective exclusions. Old library combinations remain valid public catalogue results for that filter set and expire after 600 seconds. Popularity-driven library sorts may refresh via their 600-second TTL; writes do not flush all library combinations. Other users' fallback recommendation popularity signals refresh via their 60-second TTL.

## Helper methods and failure behavior

- `remember(key, ttlSeconds, fetchFn, shouldCache?)`: Redis hit or database fetch and JSON cache fill; null key bypasses caching. Existing `getOrSetCache` and `getOrSetCacheWithRevalidate` names remain aliases. Warm reads do not trigger background DB refreshes.
- `userCacheKey`, `libraryCacheKey`: consistent identity and stable effective-filter keys.
- `invalidateUser`, `invalidateContent`, `deleteByPrefix`: exact deletes and cursor-based `SCAN MATCH` deletion in batches of 200. No Redis `KEYS` command.
- `invalidateSoundscapes`, `invalidateCollection`, `invalidateHelp`, `invalidatePreferences`: shared dependency groups for write controllers.
- `CacheReadError`: preserves original database-path error statuses/messages while preventing caching.
- `getCachedUserId`: uses the same graceful fallback, retaining the existing TTL and excluding invalid/null resolutions.

Every cache command checks connection readiness and has a 300 ms timeout. Redis read/parse failures fetch from the database. Redis SET failures return the already fetched database result. DB errors remain controller errors and never enter Redis. Failed invalidations are retained locally, retried before subsequent cache use and on Redis reconnect; this process bypasses stale cache while deletion is pending.

One Redis metadata key, `cache:read-generation`, fences cache fills. Invalidation increments it; an atomic Lua comparison plus SET prevents a read started before invalidation from putting stale data back, including across backend processes. Lua's `KEYS[...]` arguments are script key parameters, not the blocking Redis `KEYS` command.

A Redis outage cannot physically delete keys while Redis is unreachable. Pending deletions are process-local, so this recovery queue is not a durable cross-process invalidation log if the writing process exits during an outage. TTLs remain the eventual bound in that case.

## Verification

- `npm run build`: passed (TypeScript).
- `npm run test:cache`: 73 regression tests passed, with isolated simulated Redis and Supabase; no live service mutations.
- 68 comparisons against the original controller implementations passed: original status codes and serialized success/error JSON bytes match across all 17 GET controllers, including cold and warm reads.
- Covered cold DB fetch/cache fill; warm cache hits without controller DB reads (except authenticated library profile/preferences resolution); TTL expiry; two-user separation; query variants; all relevant write paths; play then reopen then recache; partial commits; multi-page SCAN; concurrent stale-fill prevention; Redis GET/SET/DEL failures, corrupt JSON, offline and hung commands.

The repeatable tests are in `Tests/cache.test.mjs` and use `Tests/cache-harness.mjs`. They require Node's `--experimental-vm-modules` flag, included by the npm script, to isolate the real TypeScript controllers from external services.
