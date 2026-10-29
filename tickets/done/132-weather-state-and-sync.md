# 132 - Weather state and sync

**Priority:** P2 - **Status:** Done 2026-10-29 - **Depends on:** 129

## Decisions (2026-10-22, from the owner)
- **The server rolls a weather state per run that changes slowly**, e.g. clear -> cloudy -> rain -> storm. Every player sees the same state.
- v1 weather types: **rain, lightning + thunder (storm), clouds, snow, fog, wind**.

## Proposed design
- A shared `WEATHER_TYPES` registry in `packages/shared`: id, label, cloud density, particle preset, ambient dim/tint, sound slot ids, whether lightning is allowed. A new weather type is a registry entry (like motion presets), not scattered conditionals.
- The environment lists which weather it allows with weights (129), e.g. a desert has no snow.
- Server `WeatherSchedule`: from the run seed, a pure function `weatherAt(seed, environment, t)` returns the current state and transition progress. Because it is pure, the server sends only the run start time and seed (once, with the map description); clients compute the weather themselves. Late joiners and reconnects stay in sync with no per-tick data.
- Lightning times come from the same seeded function so flashes line up across players (thunder delay is client-side from the distance to a strike point, cosmetic).
- Transitions are smooth: intensity ramps over many seconds.
- Sandbox: a control to force a weather state.

## Tests
`weatherAt` deterministic, only allowed weather chosen, ramps are continuous, two clients agree for the same time, late join. Mutation: use `Math.random` instead of the seed -> a test fails.

## Built (2026-10-28)
- **`WEATHER_TYPES` registry** (`gameLogic/weather/weatherTypes.ts`): clear, cloudy, windy, rain, storm, snow, fog, each with cloud density and darkness, rain, snow, fog, wind, dim, tint, lightning chance, which sound slots it uses and which weather it can drift into next. A new weather is one entry.
- **`weatherAt(seed, env, t, override?)`** (pure): stretches of 2 to 5 minutes, the first picked by weight from the allowed weather and each next one walking only between neighbours (clear never jumps to storm), turning smoothly over 30 seconds. It uses no `Math.random` and no real clock (a test breaks it if it does), so two clients, and a late joiner, agree. A tick never carries weather; only the start facts and sandbox changes travel.
- **Sync:** `SurfaceClock` works out the client/server clock difference once. A micro-benchmark: about 2 microseconds a call, even ten hours in.
- **Sandbox hook:** `override` forces a weather at a strength and calls strikes; the server tells the room once, in the next tick's `surface` field.
- Tests: determinism and no randomness, order independence, only allowed weather, neighbours only, continuity of every intensity, forced weather, the light colour, the rain-intensity hook for later; engine tests for the session state and the update tick.

- Wind is a continuous strength inside each weather (and a `windy` kind), with gusts from a seeded wobble, not a separate system.
