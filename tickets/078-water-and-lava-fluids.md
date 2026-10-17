# 078 - Water and Lava fluid rows and sandbox

**Priority:** P1 - **Status:** Done (2026-10-16); script applied - **Part of:** water + lava epic (074-080) - **Depends on:** 074, 075, 076, 077

## Decisions (Q&A 2026-10-16)
- Two new `Fluid` rows through a dry-run-by-default script (pattern: `add-oil-fluid.ts`; never overwrites; ask before `--apply`) plus `fluids.json` dev mirror entries.
- **Water:** thin and fast, light blue, translucent, density 1.0 (sinks under nothing, floats nothing heavy; oil 0.8 floats on it), low viscosity, high flowRate; `contact.extinguishes`; not flammable.
- **Lava:** orange, near opaque, density ~3 (items and rocks float on it), **very slow** (flowRate well below oil's 0.35, e.g. ~0.08) and **very viscous** (~0.85); `contact` = high damage + ignites; `light` = flickering orange; `reactions` = WATER -> LAVAROCK at 2:1; flammability null (it ignites things through `contact`, not as fuel). Setting oil on fire from lava comes through the existing ignition path if lava is made an ignition source (checked while building).
- Numbers are starting values, tuned in the admin.
- **Sandbox:** both appear in the fluid tool with no code change if it is generic (verify); otherwise fix.
- Sounds assigned later in the admin (no new slots).

## Tests
Script dry-run/idempotent, the loaded rows validate, sandbox tool lists both, a lava-meets-water run end to end in a room test (damage, burning, hardening, lavarock), oil on lava ignites (if decided in).

## Implementation notes
- `prisma/add-water-and-lava.ts` (dry run by default; **applied** at the owner's request) created both rows; `fluids.json` mirror regenerated from the DB (Oil unchanged). `add-pool-generation.ts` later gave Water its pool generation (079).
- **Water:** density 1, viscosity 0.25, flowRate 0.6, minLevel 0.02, `contact: { extinguishes }`, not flammable.
- **Lava:** orange, density 3 (items and rocks float on it, oil floats on it), viscosity 0.85, **flowRate 0.06** (oil is 0.35, water 0.6), `contact: { damagePerSecond: 25, ignites: 100 }`, flickering orange `light` (radius 5), reaction WATER -> LAVAROCK at 2:1, generation from row 15 down. Not fuel itself; it ignites other things through `contact.ignites`.
- **Sandbox:** the fluid picker lists every loaded fluid with no change. The layout now picks pools **by fluid key** (`fluid: 'OIL'`, not by slot): oil and water pools side by side (x 32-43, 45-56; break the wall to mix them) and a lava pool at the far left (x 1-4).
- **Tests:** script tests (4); sandbox layout/builder updated; a number of older tests assumed Oil was the first fluid or that no lava/water existed in the seeded map, and were made independent of the dev data (look up ids by key, clear fluids before carving a test hall).
