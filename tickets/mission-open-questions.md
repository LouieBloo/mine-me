# Mission epic (tickets 108-114, 116): questions for the owner

Work them through one at a time with the pick-from-a-list prompt. Each has the default that is built now, so "keep" is always safe. Answer, then record it in the ticket named in brackets.

1. ~~answered~~ **Clearing a fluid is a share of everything on the map** [109]. Water pools are about 6% of the map, so "clear 60% of the water" would mean draining most of the mine, and the starter "Burn the Oil" mission asks for 40% of all the oil. Built: the percent is of the whole map's amount at the start, as decided. Options: keep; or measure it against the pockets near the player; or let a fluid objective name an amount of cells instead of a percent.
   **Answer (owner, 2026-10-28): Cells, not a percent (built 2026-10-28).**
2. ~~answered~~ **Can a run start without a mission?** [111] Built: yes, a small "Start without a mission" button on the picker (so biome testing is never blocked). Options: keep; or make the pick required whenever missions are on offer.
   **Answer (owner, 2026-10-28): Keep the skip button.**
3. ~~answered~~ **Reward items are a JSON list on the mission, not a drop table row** [108]. A `DropTable` row belongs to exactly one mob, block or level, so a mission cannot own one without a schema change. Built: the same shape (item, chance %, quantity range) rolled with the same function. Keep, or add a relation to a shared drop table.
   **Answer (owner, 2026-10-28): Keep the JSON list.**
4. **Which level picks the offers** [111]. Built: the level from the character's experience and the CharacterLevel table (levels 1-4 today), so the starter missions cover 1-4.
5. ~~answered~~ **Who gets credit when the environment finishes a mob** [109]. Built: the player whose attack hurt it last within 15 seconds (fire, a fall, a rock, gas), nobody if the environment did it alone, and the surface target dummy never counts. Fire does not remember who lit it.
   **Answer (owner, 2026-10-28): Every kill counts for the mission (co-op), credit still tracked per player; everyone gets the reward (built 2026-10-28).**
6. **The offers are kept in server memory for 30 minutes** [111], so a restart re-rolls them. Fine for now; say if it must survive restarts.
7. ~~answered~~ **Who picks in the shared lobby** [111]. Built: whoever enters an empty lobby; later joiners inherit its mission and progress and see no picker. A lobby that empties starts fresh.
   **Answer (owner, 2026-10-28): Keep: the first player in the lobby picks.**
8. ~~answered~~ **An unfinished mission shows the results screen on every safe exit** [113], to say why nothing was paid. Keep, or only show it when the mission was completed or lost?
   **Answer (owner, 2026-10-28): Keep: always show the results screen.**
9. **Starter numbers** [108]: eight missions, tiers 1-3, coins 30-300, XP 20-200, depths 45-90 small blocks (15-30 original blocks), levels 1-4. All are a first guess for the Missions page.
10. ~~answered~~ **The optional map `requirements` column (biome needs) from ticket 108 was not built** [108, 110]. Nothing needs it yet; say if a mission should be able to ask for a biome.
   **Answer (owner, 2026-10-28): Not yet.**
11. **Pumping a fluid out (115)** stays registered but cannot be saved until pumps exist.
12. **Mission sounds** [112]: three slots (objective done, mission complete, mission failed) per mission, none assigned yet. Assign them on each mission's page; with no sound the mission is silent.

4, 6, 9, 11 and 12 need no decision (4 level source, 6 offers in memory, 9 starter numbers to tune in the admin, 11/12 notes).
