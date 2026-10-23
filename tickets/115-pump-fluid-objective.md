# 115 - Pump-out-a-fluid objective (future)

**Priority:** P3 - **Status:** Open - **Depends on:** 109, and a pump device that does not exist yet

## Decisions (2026-10-22, from the owner)
- Eventually a goal can be to pump a certain fluid out. Not buildable until pumps exist.

## Proposed design
- `PUMP_FLUID` objective type in the registry, using the same baseline-and-percent counter as CLEAR_FLUID (109) but counting only units removed through a pump (a `source` tag on `drainFluid`), so draining by mining or burning doesn't count.
- Needs its own ticket for the pump (placeable device, intake, output/storage) first. This ticket only reserves the objective hook and tests the counter with a fake pump source.
- Generation (110): require a pocket large enough to be worth pumping.

## Tests
Counter counts only pump-sourced drain; baseline unaffected by evaporation.
