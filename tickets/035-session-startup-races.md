# 035 - Session startup races and flaky loading

**Priority:** P1 - **Status:** Done (2026-10-10)

## Audit findings
Symptoms: on /home (and other game screens) item icons sometimes don't load until refresh; sometimes a "Character/Player not found" style error appears.

1. **Child effects run before the provider connects.** `InGameLayout` joins the city in an effect on mount; React runs child effects before the parent `SocketProvider`'s connect effect, so on a reload `socketService.socket` is still null -> `joinCity` rejects "Not connected". A `joinedCityIdRef` guard then blocks any retry, so city_data/chat never arrive.
2. **Strict-Mode remount leaves the city.** The cleanup calls `leaveCity` and nulls `cityIdRef`, but `joinedCityIdRef` stays set, so the second mount skips the join: the player ends up out of the city room.
3. **No readiness model.** `sendGameEvent` and friends reject "Not connected" or hit the server before `select_character` finished (`socket.data.characterId` unset -> "No character selected" / "Character not found"). Views render from stale localStorage immediately and fire events straight away.
4. **Reconnects lose server state.** After a socket reconnect the server has no character/city rooms, but `joinedCityId` in `socketService` makes `joinCity` a no-op ("already in city"). `select_character` re-runs, the city join does not.
5. **`connect()` failure is sticky.** A failed first attempt leaves a dead `socket` object, so later `connect()` calls attach `once` listeners to it and never resolve/retry.
6. **Auto-select failure is only a console.error.** A stale `nvg_active_character` (deleted/reset DB, other user) leaves the user on a half-working screen. `nvg_player_state` from localStorage is also never checked against the active character.
7. **Icons:** three different URL builders (`import.meta.env.VITE_API_URL || ''` in ItemListIcon/QuickAccessBar, `getAssetUrl` elsewhere) and plain `<img>` with no error handling or retry. A single failed request (server restart, race with the dev proxy) is permanent until refresh.
8. Smaller: `CharacterSelection` does not check `response.ok` (an error body gets set as the character list); `InventoryPanel` returns before its `useMemo` (hook-order violation).

## Decisions (owner)
- Icon failure = broken image / empty slot (request failure), so retry the image load.
- While the socket session connects after a reload: **full-view shared spinner until ready** (connected, character selected, city joined). After the first ready, later drops show a non-blocking "Reconnecting" notice instead of unmounting the screen (so a mine view isn't torn down).

## Plan
1. Shared `LoadingSpinner` component (CLAUDE.md: one spinner everywhere); use in ProtectedRoute and the gate.
2. `socketService`: single in-flight connect promise that resets on failure; `whenConnected()` wait with timeout used by every emit; per-connection state (selected character, joined city) reset on every (re)connect; idempotent `selectCharacter`.
3. `SocketContext`: one session state machine (`connecting -> selecting -> joining -> ready | error`) with cancel-safe effect, bounded auto-retry, `retrySession`; stale-character errors clear the active character and send the user to character selection. Remove the auto-select effect and move the city join here from `InGameLayout`.
4. `InGameLayout`: gate on session status (spinner / error + Retry / reconnect banner).
5. `GameImage` component (retry with backoff + cache-bust, then fallback) and one URL resolver (`getAssetUrl`) in ItemListIcon, QuickAccessBar, LootSpoilsModal, TemporaryBackpack.
6. GameContext: drop persisted playerState that doesn't belong to the active character. CharacterSelection: check `ok`, show the error. InventoryPanel hook order.
7. Tests for each piece; mutation-check the key rules. No commits.

## Implementation notes
- `LoadingSpinner` (shared, own folder); used by `ProtectedRoute` and the session gate.
- `socketService`: one shared connect promise, reuses a still-retrying socket (found by test: it used to leak a second one), infinite reconnect with capped backoff, auth errors drop the socket. Every request waits for the connection (10s) and has a 15s ack timeout. `SocketRequestError.serverRejected` separates "server said no" from network trouble. Selected character / joined city are forgotten on every (re)connect; `joinCity` leaves the previous city first.
- `SocketContext`: `session` (`connecting -> selecting -> joining -> ready | error`) + `retrySession`; 3 automatic attempts with backoff; server rejection of the character clears it and returns to selection with a notification; a stale stored city is corrected from the server's `character_state`; bad credentials sign out. The old auto-select effect and the city join in `InGameLayout` are gone.
- `InGameLayout`: spinner / error + Retry until first ready, then a "Reconnecting..." banner instead of unmounting (mine stays mounted).
- `GameImage` (retry x3 with backoff and cache-bust, then fallback) used by ItemListIcon, QuickAccessBar, LootSpoilsModal, TemporaryBackpack; one URL resolver (`getAssetUrl`) so icons are same-origin via the proxy/server.
- `GameContext` callbacks are memoized and persisted `playerState` is dropped unless it belongs to the active character. `CharacterSelection` checks `ok` and shows errors; `InventoryPanel` hook order fixed.
- Tests: socketService, SocketContext session, InGameLayout gate, GameImage, GameContext, LoadingSpinner. Mutation-checked: reconnect state reset, gate-once-ready, image retry limit, persisted-state ownership.
- Existing tests updated: mocks gained `session`; `MineViewLifecycle` fixture's player state now has an `id` (as a real one does).

## Not done / follow-ups
- Not exercised in a browser; I couldn't reproduce the original flakiness, so the fix is from the code audit. Worth reloading /home a few times, and restarting the server while on it.
- Other screens (TrainingView etc.) get the gate through `InGameLayout`; their own data fetches (cities in HomeView/CityPicker) still swallow non-OK responses silently.
- `useApi` still hard-redirects on any 401.
