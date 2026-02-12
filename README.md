# Frontier Kingdom: Living World (Vertical Slice)

Mobile-first offline top-down 2D sandbox simulation: procedural open world, chunk streaming, NPC schedules, consequences + law, and stamina melee combat — all rendered procedurally via Canvas2D (no external libraries, images, or fonts).

## Run (offline)

### Option A (recommended): static server (mobile friendly)
- On your computer:

```bash
python3 -m http.server 8000
```

- On your phone (same Wi‑Fi): open `http://<your-computer-ip>:8000/`

### Option B: open directly
- Open `index.html` directly in a browser.
- Note: some mobile browsers are stricter with local file access; if anything looks blank, use Option A.

## Play (touch-only)
- **Move**: touch + drag on the left half of the screen (virtual joystick).
- **Attack**: tap/hold **Attack**
- **Block**: hold **Block**
- **Dodge**: tap **Dodge**
- **Interact**: tap **Interact** near NPCs/props (talk, jobs, doors, etc).
- **Menu**: New Game / Continue, Low Power Mode toggle.
- **Help**: in-game controls and tips.
- **Debug**: FPS + entity/pathing stats overlay.

## Vertical slice content
- **Start**: a nobody in a farm hamlet, simple clothes and a dull knife.
- **Activities**:
  - Chopping wood job
  - Courier delivery
  - Training-yard sparring
- **Enemies**: bandits and rebel scouts.
- **Law**: witnesses report crime; guards investigate and arrest; restricted zones after dark.
- **World**: walled town, farms, woodland, river crossing, fort, shrine, bandit trails.

## Technical notes
- No build step, no CDNs, no assets.
- Deterministic world generation from a seed.
- Fixed timestep simulation, pooling for transient effects, and chunk streaming for performance.