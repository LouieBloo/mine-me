# Product Requirements Document (PRD): Combat System

## 1. Overview
The Combat System is a core gameplay feature of Need vs. Greed (NVG), enabling characters to engage in turn-based battles against various mobs within dungeons or during special events. The system focuses on tactical decision-making, real-time synchronization via WebSockets, and persistent state to ensure a seamless experience even across browser refreshes or disconnections.

---

## 2. User Experience (Frontend)

### 2.1 Routing & Layout
- **URL**: `/combat`
- **Layout**: Utilizes the `InGameLayout`.
    - **Sidebar (Left)**: Character stats, attributes, and status (persistent).
    - **Sidebar (Right)**: Inventory management (persistent).
- **Combat Area**: A central viewport rendering the battle.
    - **Background**: Dynamic background based on the current dungeon or combat location (reusing the logic from `/home`).

### 2.2 Rendering
- **Player Character**: Rendered on the left side of the combat area using existing character rendering components.
- **Mobs**: Rendered on the right side of the combat area using the `MobSprite` component (PixiJS).
- **Actions UI**: 
    - Rendered in the bottom-middle of the combat area.
    - Uses standard HTML/CSS buttons (Tailwind) for "Attack" and "Defend".
    - Buttons must have proper hover/active states and cursors.

---

## 3. Combat Mechanics

### 3.1 Turn Flow
- **Initialization**: Battles are turn-based; the player always takes the first turn in the first round.
- **Player Turn**:
    - If multiple mobs exist, the player must choose an action for **each** mob.
    - Actions are locked in via the UI, disabling buttons until the round resolves.
- **Round Resolution**:
    - Once the player locks in actions, the backend resolves both player and mob actions simultaneously.
    - Damage and effects are calculated and pushed to the client in real-time.

### 3.2 Actions & Calculations
- **Attack**: Deals damage based on character/mob stats.
- **Defend**: A defensive stance that reduces incoming damage from attacks by **80%** for that round.
- **Death**: 
    - When a unit's health reaches zero, it is removed from the battle.
    - If a mob dies, the player is immediately awarded loot from that mob's drop table.

---

## 4. Technical Architecture

### 4.1 Networking (WebSockets)
- **Scoped Channel**: Upon joining a battle, the client joins a dedicated WebSocket channel scoped specifically to that character and battle instance (e.g., `battle:[characterId]`).
- **Validation**: The server must validate that the character is eligible to join the specific battle (e.g., correct dungeon level).
- **State Sync**: All combat actions, status updates, and resolutions are transmitted over this channel.
- **Loot Broadcast**: Any loot acquired during combat should be broadcasted via the player's primary WebSocket channel for inventory synchronization.

### 4.2 State Persistence
- **Battle Resilience**: Combat state must be persistent to handle disconnections or page refreshes.
- **Tracking**: The system must track:
    - Current mobs and their current health.
    - Current round number.
    - Current turn owner (Player vs. Mobs).
    - Random seed for the battle (to ensure consistent outcomes on resume).
    - Current dungeon/level context.

---

## 5. Backend & Data

### 5.1 Database Schema (Prisma)
A new `Battle` table (or similar) is required to track persistent state. Suggested fields:
- `id`: UUID
- `characterId`: Reference to the active character.
- `dungeonId` / `levelId`: Context for where the battle is taking place.
- `mobsState`: JSON blob containing mob IDs, current HP, and status effects.
- `round`: Integer.
- `turn`: Enum (PLAYER, MOBS).
- `rngSeed`: String/Float for deterministic resolution.

### 5.2 Mob AI
- **Behavior Patterns**: Mobs choose actions based on configurable percentages (e.g., Goblin: 70% Attack, 30% Defend).
- **Pattern Logic**: Implement a "naive" guard to prevent repetitive actions (e.g., if a mob attacks 3 times in a row, the next action is forced to Defend).
- **Configuration**: These patterns and percentages must be manageable via the **Admin Application**.

---

## 6. Rewards & Loot
- **Mob Drops**: Individual mobs trigger their specific `DropTable` upon death.
- **Dungeon Rewards**:
    - **Level Completion**: Clearing a dungeon level awards the `LevelDropTable`.
    - **Dungeon Completion**: Clearing the entire dungeon awards the `DungeonCompletionDropTable`.

---

## 7. Implementation Phases
- **Phase 1**: Minimum Viable Product (MVP)
    - Single dungeon level focus.
    - Basic Attack/Defend loop.
    - WebSocket synchronization and basic DB persistence.
    - Static AI percentages.
