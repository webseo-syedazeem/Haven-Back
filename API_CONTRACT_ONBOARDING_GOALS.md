# Onboarding API Contract

This document defines the onboarding contract shared by the app, the Express API,
and public.user_onboarding.

Endpoints: POST /api/onboarding, GET/PATCH /api/onboarding, and
POST /api/account/import-guest-data.

## Preview-only third screen

The "A place for the state you need" screen is now informational. Its Focus
deeply, Feel calmer, and Sleep easier tiles are decorative, are not selectable,
and do not produce a request or database field.

## Mode-scoped fields

There are seven onboarding data fields. Only mode is shared by all modes.

| Field | Type | Focus | Sleep | Relax |
|---|---|:--:|:--:|:--:|
| mode | enum string | yes | yes | yes |
| mode_breakers | string[] | yes | yes | no |
| mode_areas | string[] | yes | yes | no |
| target_minutes | integer, optional | yes | yes | no |
| main_goal | string | no | no | yes |
| relax_causes | string[] | no | no | yes |
| calming_moments | string | no | no | yes |

Current app payloads omit target_minutes because the catalogue currently has no
duration choice. The backend keeps accepting a non-negative integer for a future
duration step.

FOCUS/SLEEP send mode, mode_breakers, and mode_areas (plus target_minutes when
collected). RELAX sends mode, main_goal, relax_causes, and calming_moments.
Omitted arrays persist as [] and omitted nullable values persist as null.

Only mode is required and enum-constrained. Array fields must contain strings;
target_minutes must be a non-negative integer when supplied. A submission fully
overwrites all seven onboarding answer fields.

## Examples

Focus:

~~~json
{
  "mode": "focus",
  "mode_breakers": ["Background noise", "Phone distractions"],
  "mode_areas": ["At a desk", "Studying"]
}
~~~

Relax:

~~~json
{
  "mode": "relax",
  "main_goal": "Manage daily stress",
  "relax_causes": ["Work", "Overthinking"],
  "calming_moments": "In the evenings"
}
~~~

The guest-import endpoint accepts the same mode-scoped onboarding fields along
with favourites, playlists, and sound_preferences. It imports onboarding only
when the account has no existing user_onboarding row.

GET returns the stored row plus user_id, completed, completed_at, and updated_at.
PATCH accepts only mode and leaves all other answers unchanged.

## Recommendation behavior

mode is the hard catalogue filter. mode_breakers, mode_areas, target_minutes,
relax_causes, and calming_moments may contribute soft ranking signals. main_goal
is stored but not ranked because it has no defensible catalogue correlate.
Sound exclusions remain owned by user_sound_preferences and are applied as hard
exclusions.
