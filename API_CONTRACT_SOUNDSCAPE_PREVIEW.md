# Soundscape Preview Clip Contract

What the frontend needs to know about `preview_url` — the short (~1 minute)
preview clip field on the soundscape object, distinct from `file_url` (the
full 1-hour master).

---

## Where it shows up

`preview_url` is a plain field on every soundscape object, wherever the API
already returns one: `GET /api/soundscapes`, `GET /api/soundscapes/mode/{mode}`,
`GET /api/soundscapes/mode/{mode}/preview`, `GET /api/soundscapes/{id}/details`,
`GET /api/soundscapes/{id}/similar`, `GET /api/library`, `GET /api/soundscapes/search`,
collection responses, and the admin soundscape endpoints. No new endpoint, no
new request params — it's just a new key next to `file_url`.

## Shape

```
preview_url: string | null
```

- A `https://...` URL to a short audio file, same as `file_url`'s shape — same
  streaming route pattern, just under `/previews/` instead of `/soundscapes/`.
- `null` when no preview clip has been uploaded yet for that soundscape. Preview
  clips are being added by hand over time, so **expect `null` on most rows for
  a while.**

## How to use it

For the onboarding "Try Passage" preview screen (and any other short-preview
moment — see the original spec's O10/O21 preview requirements):

1. **Prefer `preview_url` for playback** when it's non-null — it's the short
   clip meant for exactly this moment.
2. **If `preview_url` is `null`, fall back to streaming `file_url` instead.**
   Never block or show an error/empty state waiting for a preview clip that
   doesn't exist — every soundscape is always playable via `file_url`, so the
   preview screen should always have something to play.
3. Both URLs are playable the same way (HTTP range requests supported for
   scrubbing/seeking on both), so the fallback is just swapping which URL you
   pass to the player — no separate playback code path needed.

## Not covered here

This doc is only about the `preview_url` field. Everything else about the
soundscape object's shape is unchanged — see the existing soundscape endpoints'
responses for the rest of the fields.
