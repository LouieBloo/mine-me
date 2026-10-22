# 008: Per-weapon ammo and reload state

- **Status:** Done
- **Priority:** P1
- **Area:** server / combat
- **Source:** Mining game audit

## Problem
`playerWeaponAmmo` is keyed by character and initialised from the first weapon fired (`MiningProjectileSubsystem.ts:64`). Switching weapons keeps the old `maxAmmo`; stored `fireRate` and `reloadDuration` are never refreshed or used. `reloadWeapon` hard-codes 6/6/1.5/2.5 defaults and returns `remainingAmmo: 0`.

## Proposed approach
Key ammo state by (character, weapon item), derive limits from item `projectileConfig` each time, define behaviour on weapon switch and mid-reload switch.

## Acceptance
- Different weapons keep separate magazines and timings; tests cover switching.

## Decisions
- Each gun keeps its **own magazine** (rounds, fire-rate cooldown, reload progress); swapping neither refills nor loses rounds.
- Swapping away **cancels an in-progress reload** (rounds kept; no background reload).
- Weapon limits (magazine size, fire rate, reload time) come from the **database-backed item definition**. That revealed the mining server was reading JSON files, which became ticket 029 (done first).
- The ammo HUD is **removed entirely** for now ("I dont even like that HUD"); shooting/reload logic and the `R` key stay.

## Implementation notes
- New `subsystems/WeaponMagazines.ts` (`WeaponMagazines`, `resolveWeaponLimits`, `DEFAULT_WEAPON_LIMITS` as the single documented fallback). The hard-coded 6/6/1.5/2.5 defaults in `reloadWeapon` and per-character init are gone.
- `MiningProjectileSubsystem`: `shootProjectile` / `reloadWeapon` resolve the equipped weapon, then use its magazine; `getAmmoStatus` for the tick payload; reload no longer returns a fake `remainingAmmo: 0`. The `playerWeaponAmmo` map and `PlayerAmmoState` type are replaced by `magazines`.
- `MiningGameEngine.setLoadout` cancels the previous weapon's reload when the weapon changes; `removePlayer` frees the player's magazines (previously ammo state was never pruned).
- Tick `weaponAmmo` now always describes the **currently equipped** gun (full for a never-fired gun) and is omitted when no ranged weapon is equipped.
- Client: deleted `MiningWeaponAmmoHUD` (component, css, test); removed the `weaponAmmo` / `onReload` props and the Shoot/Reload legend entries from `MiningHUD`, the `onWeaponAmmoChange` plumbing in `MineView`, `MiningGrid`, `useMiningActions`, `useMiningStateSync`, and the now-unused `handleReload` in `MineView`. The legend always says "Left Click: Mine". `weaponAmmoStateRef` (used to gate client-side shooting/reload) is untouched.
- Tests: `WeaponMagazines.test.ts`, `MiningGameEngine.ammo.test.ts` (two-gun scenarios, swap/reload cancel, payload, remove player), updated `MiningGameEngine.projectiles.test.ts`, trimmed `MiningHUD.test.tsx`.
- Not done (ticket 013): fire-rate cooldown still uses wall-clock `Date.now()`.
