# Product Requirements Document (PRD): Need vs. Greed

## 1. Executive Summary
**Need vs. Greed** is a browser-based, simplified MMORPG. Players start with nothing, choose a class, and embark on a journey utilizing a core gameplay loop of grinding, leveling up, acquiring gear, and advancing professions. The game's defining feature is its weekly world boss fights, which distribute premium currency ("Lear")—equivalent to real-world US dollars—funded by ad and microtransaction revenue. The game balances cooperative multiplayer efforts with selfish incentives, true to the "Need vs. Greed" principle.

## 2. Core Gameplay Loop
Players begin their journey in a city. The core loop consists of choosing actions:
- **Venture into the Dungeon:** Fight mobs, gain combat XP, Sol, and gear.
- **Train:** Passively increase Combat or Defense scores.
- **Profession Action:** Gather resources or craft items based on chosen profession.
- **Shop/Trade:** Buy/sell goods via the marketplace or NPCs.
- **Travel:** Move between cities to access different dungeons and resources.

## 3. Character Attributes & Status
- **Level:** Characters start at level 1 with a level cap of 50. Leveling up boosts attributes.
- **Combat Score:** Modifier for damage dealt (boosted by training and defeating mobs).
- **Defense Score:** Modifier for damage taken (boosted by leveling, gear, and training).
- **Stamina:** Required for all non-combat actions. Fully restored by resting, or partially restored via potions.
- **Age:** Characters age whenever they rest or die in combat. Reaching 100 years of age results in **permadeath** for that character.
- **Gear Slots:** Head Piece, Chest Piece, Leggings, Boots, and Weapon.
- **Inventory:** Limited to 25 slots by default. Expandable using Sol.

## 4. Currencies
- **Sol (Standard Currency):** Gained by killing mobs, finishing dungeons, or trading. Lost entirely upon character permadeath.
- **Lear (Premium Currency):** Represents actual US dollars (approx. 1 Lear = $0.0001). Earned exclusively from participating in weekly boss fights. Cannot be traded between players.

## 5. Breakdown of Actions
### 5.1 Venture Into a Dungeon
Dungeons consist of 5 sequential encounters. Defeating a mob grants combat XP, Sol, and potential gear drops. Players can leave at any time (forfeiting dungeon completion rewards but keeping earned drops) or continue until the end/death. Re-running dungeons yields diminishing completion rewards.

### 5.2 Train
A cooldown-based action that slightly increases either **Combat Score** or **Defense Score**. The cooldown duration scales with the player's level.

### 5.3 Travel
Players can travel freely between different cities to access unique dungeons and professional resources. Traveling costs **1 month of Age**.

### 5.4 Trade
Trading is conducted strictly through a global highly-regulated Marketplace or directly to NPCs. No 1-1 direct player trading. Players can choose to sell items to NPCs for **more Sol** than they can get through selling to a player. This creates the "Greed" incentive: a player can take the higher NPC payout for themselves, or accept a lower price on the Marketplace to help another player gear up for the World Boss. Marketplace prices are fixed by developers to control the economy.

## 6. Combat System & Mechanics
Combat uses simultaneous action phases between the player and the mob. 
- Mobs telegraph potential actions with percentage probabilities.
- **Actions:** Attack, Defend, Use Class Ability (all pass priority), Use Potion (free action). 
- **Damage Formula:** `Damage = (Weapon Damage - Armor Score) * (1 - (Defense Score / 100)) * (1 - (Potion Score / 100))`

### 6.1 Potions
Crucial for difficult encounters. Durations vary (instant, 1-round, N-rounds). Only one potion of each *buff type* can be active at once (e.g., cannot stack two single-round attack boosts). Effects include Health Recovery, Stamina Recovery, Attack Boosts, and Defense Boosts.

## 7. Professions
Players are limited to **1 profession per character**, forcing player interdependence. Gathering takes stamina and involves tool durability. Tools must be repaired by vendors (incurs real-world time delays).

- **Mining:** Gather minerals/gems using a Pickaxe (Ores: Copperium, Silverium, Solium, Diamondium, Obtanium, Sando).
- **Herbalism:** Gather herbs using a Lopper (Herbs: Marifana, Bolstria, Aloe, Heroes Bane, Caffinica, Nostramica).
- **Farming:** Grow crops using pots, soil, seeds, and water. Real-time fruiting cycles. (Crops: Corncobs, Prumpkins, Oonions, Taters, Chillums, Morpin).
- **Lumberjack:** Chop and plant trees in city-specific forests. Forests have a global "health" meter; if depleted, the forest cannot grow until it regains health.
    - **List of Wood:**
        - **Cedarbark:** Low rarity (1 Sol)
        - **Oakbark:** Low rarity (1 Sol)
        - **Ironbark:** Medium rarity (5 Sol)
        - **Shadowwood:** Rare (10 Sol)
        - **Whisperleaf:** Rare (12 Sol)
        - **Elderwood:** Very rare (25 Sol)
- **Blacksmithing:** Use minerals and wood to craft gear.

## 8. MMO & Social Aspects
### 8.1 Weekly Boss Fights (The "Need vs. Greed" Event)
A server-wide world boss appears weekly. All players fight the same boss simultaneously. Boss damage scales to player level to prevent 1-shotting low-level players.
- **Success:** Ad revenue/microtransaction pool is converted into Lear and distributed to participants based on their contribution (damage dealt/support provided).
- **Failure:** If all players die, no loot is awarded, and a global penalty is applied (all players age a certain amount of years, even non-participants).

### 8.2 Friends & Inspection
Players can add friends, see online status, and inspect any player to view their Sol, gear, and combat score.

## 9. Systems & Monetization
- **Account & Signup:** 1 account per user tied to a **Phone Number** (SMS verification required, VoIP numbers blocked to prevent fraud). Players choose a lasting "Family Name" for all their characters.
- **Monetization & Ads:** Browser layout includes top and bottom banner ads.
- **Ad-Block Policy:** Strict enforcement. Players cannot play if an ad-blocker is active, as ad revenue directly funds the Lear payout pool.

## 10. Technical Architecture & Stack
### 10.1 Admin Application
A React-based internal tool to manage game configurations. Exports configuration files used by the game engine including:
- City data, Mob attributes, Item/Gear stats, Shopkeeper inventories, Experience curves, Profession and Dungeon definitions.

### 10.2 Client-Side Game
Built using the latest version of **React**. We will use **PixiJS** (integrated via **@pixi/react**) as the 2D rendering engine for character movement, combat animations, and particle effects. This allows for a high-performance WebGL canvas to sit alongside a standard React/HTML UI. Mobile-friendly but optimized for desktop browser experiences.

### 10.3 Server-Side API
High-performance backend written in **Node.js**.
- **Real-time Comms:** WebRTC or WebSockets for real-time boss fight synchronization.
- **State Management:** Fast in-memory state for active boss fights handling hundreds of concurrent players. 
- **Database:** **PostgreSQL** to handle heavy transactional data (trading, inventory, progression, currency).
- **Security:** Strict server-side validation and rules-engine implementation to prevent cheating in combat, movement, and trading.