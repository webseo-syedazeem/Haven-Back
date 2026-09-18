# Onboarding API Contract

Everything the frontend needs to send, read back, and expect from the onboarding
flow. This document describes the **final** structure of `public.user_onboarding`.
Field names are identical in the request body, in the response, and in the
database — there is no aliasing or internal-name translation anywhere.

Endpoints covered: `POST /api/onboarding`, `GET /api/onboarding`,
`PATCH /api/onboarding`, `POST /api/account/import-guest-data`.

---

## 1. Which fields does each mode send?

There are 8 data fields. **Only `mode` and `user_goals` are common to all three
modes** — they capture the two screens that appear, identically shaped, at the
start of every flow (with mode-specific option lists). Every other field belongs
to exactly one mode family:

| Field | Type | Cardinality | Focus | Sleep | Relax | Screen |
|---|---|---|:--:|:--:|:--:|---|
| `mode` | string | single | ✅ | ✅ | ✅ | "What would you like help with?" |
| `user_goals` | string | single | ✅ | ✅ | ✅ | "Choose a goal" |
| `mode_breakers` | string[] | **multi** | ✅ | ✅ | ❌ | "What breaks your {mode}?" |
| `mode_areas` | string[] | **multi** | ✅ | ✅ | ❌ | "Where do you need it most?" |
| `target_minutes` | **integer** | single | ✅ | ✅ | ❌ | "How long do you usually {mode} for?" |
| `main_goal` | string | single | ❌ | ❌ | ✅ | "What's your main goal right now?" |
| `relax_causes` | string[] | **multi** | ❌ | ❌ | ✅ | "What's usually causing your stress?" |
| `calming_moments` | string | single | ❌ | ❌ | ✅ | "When do you most need to feel calmer?" |

So the complete payload per mode is:

```
FOCUS  →  mode, user_goals, mode_breakers, mode_areas, target_minutes
SLEEP  →  mode, user_goals, mode_breakers, mode_areas, target_minutes
RELAX  →  mode, user_goals, main_goal, relax_causes, calming_moments
```

**Just omit the fields your mode doesn't use.** They stay at their database
defaults, which are exactly what "not collected" should look like:

| Omitted field | Reads back as |
|---|---|
| `mode_breakers`, `mode_areas`, `relax_causes` | `[]` |
| `user_goals`, `target_minutes`, `main_goal`, `calming_moments` | `null` |

### Things that are easy to get wrong

- **`target_minutes` is an integer number of minutes — `45`, not `"45 min"`.**
  It is an `integer` column. A numeric string (`"45"`) is accepted and coerced,
  but anything with units or decimals in it is a `400`.
- **`mode_breakers` and `mode_areas` are Focus + Sleep only.** Relax has no
  screen for either. Do not send them in a Relax submission.
- **`main_goal`, `relax_causes` and `calming_moments` are Relax only.** Focus and
  Sleep have no screen for any of them. Do not send them in a Focus or Sleep
  submission.
- **Relax does not have a shorter version of the Focus/Sleep fields — it has a
  different set entirely.** `main_goal` is not a Relax-flavoured `user_goals`,
  and `relax_causes` is not a Relax-flavoured `mode_breakers`. The two families
  never mix.
- **`mode` and `user_goals` are two different questions**, even though both are
  "pick your goal"-shaped. `mode` picks the flow; `user_goals` is the outcome the
  user wants inside it. Same for `user_goals` vs. Relax's `main_goal`.
- **`user_goals` is singular in meaning despite the plural name** — it is a
  single `text` value, not an array.

### What the API validates

Only what the database itself constrains:

- `mode` is **required** and must be one of `sleep` / `relax` / `focus`.
- The three array fields must be arrays of strings, if sent.
- `target_minutes` must be a non-negative integer, if sent.
- Everything else is optional and nullable.

The API does **not** check that you left out the other mode's fields. Which
screens a mode shows is the frontend's business — the endpoint persists whatever
it is given. Sending a Relax field on a Focus submission is not an error; it just
stores a value nothing will read.

---

## 2. Per-mode vocabulary

None of these are enforced by a `CHECK` constraint except `mode` — the rest are
free text, so product can adjust an option list without a migration. These are
the option sets established across the project's screens.

### `mode` — all modes (**the only enum-enforced field**)

`focus` · `relax` · `sleep`

### `user_goals` — all modes, single-select

| Mode | Options |
|---|---|
| Focus | Focus deeply · Work easier |
| Sleep | Sleep easier |
| Relax | Feel calmer |

### `mode_breakers` — Focus + Sleep, multi-select

| Mode | Options |
|---|---|
| Focus | Background noise · Phone distractions · Racing thoughts · Low energy · Getting started |
| Sleep | Racing thoughts · Outside noise · Restlessness · An inconsistent routine · Waking in the night |

### `mode_areas` — Focus + Sleep, multi-select

| Mode | Options |
|---|---|
| Focus | At a desk · Studying · Creative work · On the move |
| Sleep | Falling asleep · During travel · After waking · After late work |

### `target_minutes` — Focus + Sleep, single integer

Focus's confirmed options are **25 / 45 / 90**. The backend accepts any
non-negative integer, so a Sleep option list (or a "90+" bucket sent as `90`)
needs no backend change.

### `main_goal` — **Relax only**, single-select

Feel less anxious · Manage daily stress · Be more present · Sleep more easily ·
Just explore

### `relax_causes` — **Relax only**, multi-select

Work · Overthinking · Social situations · News and social media · Finances ·
Other

### `calming_moments` — **Relax only**, single-select

During the day · In the evenings · At night · Throughout the day

---

## 3. `POST /api/onboarding`

Auth required. Saves the user's answers and sets `users.onboarding_completed = true`.

**Every submission is a full overwrite of all 8 fields.** If the user resubmits
later and omits something they previously answered, it is reset to `[]` / `null`.
Always resend everything relevant to the mode on a resubmit.

### Focus request

```json
{
  "mode": "focus",
  "user_goals": "Focus deeply",
  "mode_breakers": ["Background noise", "Phone distractions"],
  "mode_areas": ["At a desk", "Studying"],
  "target_minutes": 45
}
```

### Relax request

```json
{
  "mode": "relax",
  "user_goals": "Feel calmer",
  "main_goal": "Manage daily stress",
  "relax_causes": ["Work", "Overthinking"],
  "calming_moments": "In the evenings"
}
```

### Response (200) — Relax example

The `onboarding` object uses **the same field names as the request**. Note the
Focus/Sleep fields sitting at their defaults, untouched:

```json
{
  "success": true,
  "data": {
    "onboarding": {
      "user_id": 1,
      "mode": "relax",
      "user_goals": "Feel calmer",
      "mode_breakers": [],
      "mode_areas": [],
      "target_minutes": null,
      "main_goal": "Manage daily stress",
      "relax_causes": ["Work", "Overthinking"],
      "calming_moments": "In the evenings",
      "completed": true,
      "completed_at": "2026-09-19T10:00:00.000Z",
      "updated_at": "2026-09-19T10:00:00.000Z"
    },
    "preferences": { "...": "the user's existing user_sound_preferences row, unchanged" }
  }
}
```

`preferences` is returned for convenience only. **This endpoint never writes to
`user_sound_preferences`** — Sound Preferences and Sounds to Avoid are owned
entirely by `PUT /api/preferences/sound`. Onboarding does not accept preferred
sounds / animals / instruments / environments, excluded sounds, or detail level.

**Errors:** `400` invalid or missing `mode`, malformed array, non-integer
`target_minutes` · `401` no session or profile · `500` server error.

---

## 4. `GET /api/onboarding`

Auth required, no body. Returns the stored row in exactly the shape POST returns
it, or `null` if the user has never onboarded.

```json
{ "success": true, "data": { "onboarding": { "...": "same 8 fields + bookkeeping" } } }
```

---

## 5. `PATCH /api/onboarding`

Auth required. The lightweight "switch mode" path, for a settings or home-screen
control — so the user can change mode without walking the whole flow again.

**Body:** `{ "mode": "focus" }` — required, one of `sleep` / `relax` / `focus`.
Same field name POST uses.

Updates **only** `mode`. The other 7 answers are left exactly as stored — which
means a user who switches from Relax to Focus keeps their Relax answers and has
empty Focus ones until they resubmit. Use `POST /api/onboarding` to replace the
answers themselves.

**Response (200):** `{ "success": true, "data": { "onboarding": { ...full row, mode and updated_at changed... } } }`

**Errors:** `400` invalid `mode`, **or** the user has no onboarding row yet (the
message tells them to POST first) · `401` no session · `500` server error.

---

## 6. `POST /api/account/import-guest-data`

Auth required, all fields optional. Carries a guest's locally-stored data onto
their new account at signup. It accepts **the same 8 onboarding fields, under the
same names**, alongside `favourites`, `playlists` and `sound_preferences`.

A guest who onboarded in any mode is imported in full — nothing is dropped
regardless of which family they answered.

```json
{
  "favourites": ["5688323a-2fd9-4a73-af65-29c211dc76e8"],
  "mode": "relax",
  "user_goals": "Feel calmer",
  "main_goal": "Manage daily stress",
  "relax_causes": ["Work", "Overthinking"],
  "calming_moments": "In the evenings"
}
```

Onboarding is applied **only if the account has no `user_onboarding` row yet**.
If it already has one, nothing is overwritten and the response carries
`onboarding_note` explaining why. When it is applied,
`users.onboarding_completed` flips to `true` just as it does via POST.

`sound_preferences` is handled by a separate, unrelated branch of this endpoint
and is unaffected by any of the above.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "favourites_added": 1, "favourites_skipped": 0,
    "playlists_created": 1, "playlist_items_skipped": 0,
    "preferences_applied": true,
    "onboarding_applied": true
  }
}
```

---

## 7. How these answers affect recommendations

`GET /api/recommendations` and `GET /api/home/recommended` rank the live
catalogue using these answers. Being explicit about what is and is not used,
because several fields are deliberately stored-only:

### Used in ranking

| Field | How |
|---|---|
| `mode` | **HARD filter.** Only that mode's soundscapes are considered at all. `?mode=` / `?goal=` on `GET /api/recommendations` overrides it for one request without persisting. |
| `mode_breakers` | Soft boost on the catalogue's existing 1–5 `intensity`. "Background noise" / "Outside noise" → favours intensity ≥ 4 (steady, masking). "Racing thoughts" / "Overthinking" → favours intensity ≤ 2 (calmer). |
| `relax_causes` | **The same heuristic, same keyword sets** — an answer means the same thing whichever screen it came from. In today's Relax option list only "Overthinking" matches (→ lower intensity). |
| `mode_areas` | Soft boost when a mapped keyword appears in the soundscape's `subcategory` / `one_line_description` / `designed_for` / `best_use`. Focus: Studying→"study", Creative work→"creative", On the move→"travel"/"commute". Sleep: Falling asleep→"fall asleep", During travel→"travel", After waking→"back to sleep". |
| `calming_moments` | The same mechanism at a **lower weight**, and only for "In the evenings"→"evening" and "At night"→"night". |
| `target_minutes` | Direct duration closeness against `duration_seconds`: within 5 min scores higher than within 15 min. Falls back to `user_sound_preferences.typical_duration` if `target_minutes` is unset. |

### Stored but NOT used in ranking

| Field / value | Why not |
|---|---|
| `user_goals` | Its options restate the mode the user already picked (Focus deeply → focus, Sleep easier → sleep). Since `mode` is already the hard filter, any mapping would be perfectly collinear with it: every surviving candidate would get the identical bonus and the ordering would not change. |
| `main_goal` | No catalogue correlate that is not either collinear with the mode filter ("Sleep more easily" inside a Relax flow) or already covered by `relax_causes`. Mapping it would mean inventing metadata. |
| `mode_breakers`: Phone distractions, Low energy, Getting started, Restlessness, An inconsistent routine, Waking in the night | No existing soundscape metadata field corresponds to them. |
| `mode_areas`: Focus "At a desk", Sleep "After late work" | Same — no defensible keyword. |
| `relax_causes`: Work, Social situations, News and social media, Finances, Other | Same. |
| `calming_moments`: "During the day", "Throughout the day" | Matching bare "day" would collide with "daytime", "everyday", and with "Throughout the day" itself. |

**Honest caveat on `calming_moments`:** it is mapped more weakly than
`mode_areas`, and scored lower, on purpose. `mode_areas` values name an
*activity* the catalogue copy is literally written about ("designed_for:
returning to sleep after waking" genuinely contains "back to sleep").
`calming_moments` values name a *clock time*, which that copy is not written
about — and only two of its four options have any lexical correlate at all.
Coverage is thin: checked 2026-09-19 against the live catalogue, of 9 relax
soundscapes only 1 mentions "evening" and none mention "night", so "At night"
currently boosts nothing. It degrades safely — no match simply means no bonus.

None of the soft signals can ever empty a result set; they only add to a score.
A Relax user's `target_minutes` being `null` costs them nothing, because the
duration term is skipped for every candidate equally.

### Hard exclusion (unrelated to this table)

`user_sound_preferences.excluded_sounds` — Profile › Sounds to Avoid — is always
a hard exclusion, applied before the mode filter. Unchanged, and untouched by
anything in this document.
