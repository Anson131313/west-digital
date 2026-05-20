# 🌍 World Front

A browser-based territory strategy game with real geographic maps, flood-fill expansion, economy management, military conquest, and nuclear warfare.

## How to Play

Open `index.html` in a modern browser (Chrome/Edge/Firefox). Requires an internet connection to load the world map data from CDN on first load.

---

## Phase 1 — Territory Expansion

1. **Choose your map** — Pick from World, North America, South America, Europe, Africa, Asia, Australia/Oceania, or Antarctica.
2. **Set difficulty & economy speed** — Easy/Medium/Hard affects how aggressively bots play. Slow/Fast controls economy tick rate.
3. **Enter your name and pick a color** — These identify your empire on the map.
4. **Click on land** to place your empire's starting position.
5. Watch the map **flood-fill** as all factions expand outward from their capitals simultaneously. Borders form naturally where territories meet.

---

## Phase 2 — War & Diplomacy

Once territory is claimed, the economic and military phase begins.

### HUD Stats
- 💰 **Money** — Earns each economy tick. Spend on buildings.
- ⚔️ **Troops** — Earns each tick from barracks. Used in combat.
- 🗺️ **Territory %** — Your share of the map.
- 📈 **Income/tick** — How much money you earn per tick.

### Controls
- **Click your territory** → Opens the Build Menu
- **Click enemy territory** → Opens the Attack / Diplomacy panel

### Build Menu (click your territory)

| Building | Cost | Effect |
|---|---|---|
| 🏙️ City | $500 | +$50/tick income |
| ⚔️ Barracks | $800 | +5 troops/tick |
| 🏭 Factory | $1,200 | +$100/tick income |
| ⚓ Port | $1,000 | +$25/tick income + naval units |
| 🚢 Battleship | $2,000 | +20 troops instantly |
| 🚀 Missile Silo | $5,000 | Enables nuclear weapons |
| ☢️ Atomic Bomb | $15,000 | Destroys 15% of target territory |
| 💥 Hydrogen Bomb | $30,000 | Destroys 25% of target territory |
| 🛸 MIRV | $80,000 | Destroys 40% of target territory |

> ⚠️ Nuclear weapons require a Missile Silo first!

### Combat
- Click enemy territory to open the **troop slider**
- Drag the slider to choose what % of your troops to send (0–100%)
- The troop count updates live: "Sending X of Y troops"
- **Outnumber your enemy** for fast conquest — being outgunned means slow or failed attacks
- Troops visually flood into enemy territory pixel by pixel

### Diplomacy
- **Offer Alliance** — allies can't be auto-attacked, appear in your HUD
- **Betray allies** — you can still attack allies, but it breaks the alliance immediately and they'll be hostile forever
- On **Hard difficulty**, bots may betray YOU if it benefits them

### Win Conditions
- Eliminate all other factions, OR
- Control 51%+ of the map's land area

---

## Difficulty Effects

| | Easy | Medium | Hard |
|---|---|---|---|
| Bot aggression | Low | Moderate | High |
| Bot builds | Rarely | Occasional | Strategic priority |
| Nuclear use | Never | Rare | Yes, against dominant factions |
| Alliance betrayal | Never | Rare | Possible |
| Target player | No | Rarely | Yes, specifically |

---

## Map Regions

| Map | Special Bots |
|---|---|
| North America | USA splits into 4 factions; Canada splits into 3 |
| South America | Brazil splits into 3 factions |
| Asia | Russia splits into 3; China splits into 3 |
| Africa | Historical empires: Mali, Songhai, Zulu, Kongo, Nubian Kingdom |
| Australia/Oceania | Australia splits into 3; includes Aboriginal territories |
| World | All factions active (~83 entities) |

---

## Technical Notes

- Uses **TopoJSON / world-atlas** for real country outlines (loaded from CDN)
- Territory is pixel-based — ~540,000 pixel array for smooth borders
- Flood fill uses BFS with per-entity frontier queues
- Combat is animated pixel-by-pixel with troop ratio affecting speed
- Runs entirely in the browser — no server needed

---

Built for **dumbaigames** · World Front v1.0
