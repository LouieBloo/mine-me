# 132 - Weather state and sync

**Priority:** P2 - **Status:** Open - **Depends on:** 129

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
