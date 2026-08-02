# Architecture

## State machine

`title` → `playing` ⇄ `paused` → `result` → (`present` → `cosmos` | retry `playing`) → …

Multiplayer: `title` → `lobby` → `mp-playing` ⇄ `mp-paused` → `mp-result` (15s vote) → rematch / lobby pause / leave  
Host simulates via PeerJS; guests send wish input and apply state snapshots.

Owned by `src/game/Game.js` (orchestrator only).

Win path: Present to the King → star hung → Cosmos stage select.  
Lose path: Try Again (same stage).

## Modules

| Module | Role |
|--------|------|
| `Game.js` | State, loop, wiring |
| `Katamari.js` | Ball motion, growth, sticking |
| `Collectibles.js` | Spawn + pickup / bonk |
| `World.js` | Floor, lights, fog |
| `FollowCamera.js` | Third-person follow + wish→world |
| `Input.js` | Keyboard |
| `UI.js` | HUD / overlays |
| `Progress.js` | localStorage clears & stars |
| `AudioManager.js` | Playlist + SFX |
| `NetSession.js` | PeerJS room host/join |
| `Multiplayer.js` | Race + battle session |
| `rng.js` | Seeded Mulberry32 |

## Data

- `data/game.json` — accel, camera, scrape, bonk  
- `data/stages.json` — missions (timer, goal, star name, King line)  
- `data/objects.json` — pickup types  

## Constants that must stay aligned

- Display size: `diameterCm = round(radius * 20)` (1 world unit radius ≈ 10 cm radius / 20 cm diameter)  
- Pickup: `object.size < radius * tuning.pickupRatio`  
- Scoop → melt: object volume (`packing × (size/2)³`) adds into ball `r³`; radius = ∛V  
