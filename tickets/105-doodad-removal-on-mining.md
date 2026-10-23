# 105 - Doodads disappear when their anchor is removed

**Priority:** P1 - **Status:** Open - **Depends on:** 100, 101

## Decisions (2026-10-22, from the owner)
- A doodad disappears if the block it hangs from or sits on is mined or blown up (a leaky cave block stops leaking when its block is mined). Free-floating (air) doodads are never removed this way.

## Proposed design
- The server keeps a map from anchor cell to doodad. Every path that clears a cell (mining, blast, burn, mob digging, falling rock landing, fluid reaction hardening) already goes through shared completion helpers; hook there, not in each system. Multi-cell anchors: the doodad goes when *any* supporting cell is removed.
- Use `clearPieceSiblings` for the doodad's own footprint pieces.
- Emit a removal delta (101) to clients that had it revealed. Server and client prediction stay consistent: the client also removes it when it predicts its own mining.
- **Decided (2026-10-22, owner):** a doodad whose anchor edge spans several blocks goes as soon as *any* supporting block is removed.
- **Decided (2026-10-22, owner):** doodads never block placement (ladders, torches, bridges); they are background only, and the placed item is drawn in front.
- Optional per-doodad drop-off particle puff (cosmetic).
- Placing a block (bridge, ladder) on top does not recreate it. 

## Tests
Mined, blasted, burned, rock-crushed anchors each remove their doodad; unrelated cell removal doesn't; air doodads stay; delta sent; mutation: skip the hook in the blast path -> blast test fails.
