# 004: Atomic inventory consumption for throw/place/shoot

- **Status:** Done
- **Priority:** P0
- **Area:** server / socket handlers
- **Source:** Mining game audit

## Problem
`handleMiningThrowDynamite`, `handleMiningPlaceLadder`, `handleMiningPlaceTorch` (`sockets/mining/handlers/`) read the item with `findFirst`, spawn/place, then decrement. Two rapid requests can both pass the check (free item), or the second delete/decrement throws after the entity has already spawned. The "reload full character + broadcast inventory" block is copy-pasted 4 times.

## Proposed approach
- Atomically consume first (`updateMany where quantity > 0` or transaction), spawn only on success, refund on engine rejection.
- Extract a shared `consumeInventoryItem` + `broadcastInventory` helper.

## Acceptance
- Concurrent requests cannot duplicate items; tests simulate parallel calls.

## Decisions
- Placement: validate first -> atomically consume -> commit; refund if the commit is refused after consuming.
- Inventory sync: one shared helper, same behaviour (full reload + broadcast).
- Item matching rules (ladder name-contains, etc.) are unchanged here; cleanup is ticket 019.
- Throwing now **requires `itemId`** from the client (no more "find any throwable" fallback).

## Implementation notes
- New `sockets/mining/handlers/inventoryActions.ts`: `consumeInventoryItem` (guarded `updateMany`, then removes zero rows), `refundInventoryItem`, `broadcastInventory`. Removes the 3 copy-pasted reload/broadcast blocks.
- `MiningBlockSubsystem` split into `validateLadderPlacement` / `validateTorchPlacement` + commit; engine exposes `canPlaceLadder` / `canPlaceTorch`.
- Throw: ownership **and** throwability (`throwable` or subType DYNAMITE) are now checked for the specified item (previously a supplied itemId was not checked for throwability). For throws the engine has no validation beyond the session check done earlier, so the order is consume -> launch -> refund on failure.
- `forceRatio` is clamped to [0,1], non-finite ignored.
- Existing handler tests updated for the new DB calls; new `inventoryActions.test.ts` covers concurrent consume, refund, invalid placement, throw requirements.
- Note: the client's throw action sends `itemId: targetItem?.id`; if the client can't resolve an item it now gets "No throwable item specified."
