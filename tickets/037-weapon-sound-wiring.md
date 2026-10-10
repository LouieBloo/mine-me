# 037 - Weapon sound wiring (reload, gunshots)

**Priority:** P2 - **Status:** Done (2026-10-10)

## Audit findings
1. **Auto-reload was silent (the reported bug).** Firing the last round makes the server start the reload itself and answer `isReloading: true`. The client only played the reload sound from its own reload path (`handleWeaponReload`, the R key / empty-click), which it skips when the server says it is already reloading. So only a manual reload ever sounded.
2. **Local shot echoed on slow connections.** The server's gunshot event for the local player was suppressed only if it arrived within 350 ms of the local shot; with a longer round trip the shot sound, flash and light fired twice.
3. Remote players' reloads are never heard (the reload sound is purely local; nothing is broadcast). Not changed: needs a design decision.
4. Data, not code: the 6-Shooter's `shoot` slot is empty. Its gunshot plays because the client falls back to the legacy `soundEffectUrl`, which happens to be the file stored in the `throw` ("Weapon Swing / Use") slot. Set the `shoot` slot in the admin so it doesn't rely on that.
5. The old `revolver_reload.wav` is no longer referenced since the reload sound was re-uploaded (`cmn_revolver_6shooter_reload_sfx.mp3`); a leftover to clean up.
6. Checked and fine: shoot sound resolution order (`shoot` slot, legacy url, fetched fallback) on client and server; the asset preloader finds slot urls generically, so reload/shoot files are preloaded.

## Implementation notes
- `ReloadSoundTrigger` (systems/): one object shared by the R key and the server ammo ticks. Plays the weapon's `reload` slot once per reload (time-window dedupe, at least 600 ms or the weapon's reload time); the tick path plays on the not-reloading -> reloading edge, and ignores a reload already under way when the run starts.
- `tickHandlers.applySessionData` reports each ammo update (`onWeaponAmmo`); `useMiningStateSync` feeds it to the trigger; `useMiningActions.handleWeaponReload` uses the same trigger instead of playing directly.
- `ProjectileVisualManager`: the local player's own shot is never replayed from the server echo (removed the 350 ms heuristic and `recordLocalShot`).
- Tests: trigger unit tests, tick -> sound wiring (auto-reload plays once; R then server confirm doesn't double), echo test. Mutation-checked: tick wiring, echo suppression, dedupe.

## Not done
- Items 3-5 above.
- After changing a weapon's sounds in the admin, reload the game page: the client's copy of the weapon comes from the character state sent when the character is selected.
