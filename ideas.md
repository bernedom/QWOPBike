# QWOP-Bike — Ideas & Design Notes

A small browser game that hides the information about a birthday present.
The player has to build a dirt bike and then ride it across a track. Reaching the
finish line reveals the present.

Status markers: ✅ built · 🧪 built but needs tuning/playtesting · 💡 idea, not built.

---

## 1. Core concept

- **Name:** QWOP-Bike. The name nods to the famously awkward running game QWOP:
  you control the bike with four keys that each do one thing, and steering it
  well is the whole challenge.
- **Goal:** get from the start to the finish without crashing → present revealed.
- **Tone:** playful and slightly mean. It should fail you on the first few tries,
  but you should feel that you can get better. Aim for roughly **5–20 attempts**.
- **Loop:**
  1. ✅ Title screen → **Garage** (assembly mini-game) → **Race**.
  2. ✅ Crash or flip → game over → **ride again** (same bike) or **build a new bike**.
  3. ✅ You always ride **the bike you assembled most recently**, even if it's
     worse than the one before. A rebuild is a gamble.
  4. ✅ Finish → present reveal (can be reopened from the title screen later).

## 2. Controls (race) ✅

| Key | Action        | Notes                                                        |
| --- | ------------- | ------------------------------------------------------------ |
| Q   | Throttle      | Torques the rear wheel; too much throttle makes it wheelie.  |
| W   | Brake         | Locks both wheels; braking in the air does nothing useful.   |
| O   | Lean back     | Rotates the bike nose-up, on the ground and in the air.      |
| P   | Lean forward  | Rotates the bike nose-down.                                  |

- Uses physical key positions (`KeyboardEvent.code`), so it also works on
  QWERTZ/AZERTY keyboards.
- ✅ On-screen Q/W (left thumb) and O/P (right thumb) buttons for phones and tablets.
- Even a perfect bike is awkward: the throttle lifts the front, you must
  balance with your lean in the air, and the rider's weight sits high up.

## 3. Bike assembly → handling ✅ 🧪

The bike has **5 parts**. Each part gets a quality score from 0 to 1 in the
mini-game. Every part controls a different kind of "annoying":

| Part       | Good build                  | Bad build                                                        |
| ---------- | --------------------------- | ---------------------------------------------------------------- |
| Wheels     | Full grip, smooth           | Less grip + **wobble** (torque kicks synced to wheel rotation)   |
| Engine     | More torque & top speed     | Weak, slow; struggles up the big hill                            |
| Chain      | Throttle reacts quickly     | **Throttle lag** + random **sputter** (engine cuts out briefly)  |
| Suspension | Firm, well damped           | Soft and bouncy (pogo-stick landings)                            |
| Handlebar  | Precise lean, no delay      | Twitchy lean + **input delay**; below 20 % it's mounted **backwards** (O/P swapped!) |

- Overall grade S/A/B/C/D/F = average of the five part scores.
- The numbers live in `src/bike.ts` → `deriveStats()`; tune them there.
- 💡 Show the bike's flaws during the race too (e.g. a wobbling wheel sprite,
  smoke from a bad chain), not only on the summary screen.

## 4. Assembly mini-game

### v1 — "Torque wrench" ✅ 🧪
A needle sweeps across a gauge. Press **Space** (or tap) to stop it in the green
zone. Each part has a faster needle and a narrower zone. You see the result right
away: parts you fit badly show up **crooked and red** on the bike diagram.

### Alternatives / extensions 💡
Any of these could replace v1 or become one stage each:
- **One mini-game per part** (WarioWare style), e.g.:
  - *Wheels:* tighten the spoke nuts in a star pattern; get the order right.
  - *Chain:* drag the chain over the sprocket teeth before a timer runs out.
  - *Engine:* QWOP-style: hold Q/W/O/P in sequence to lift the engine into the
    frame without dropping it.
  - *Suspension:* pump air into the shock and stop at the right PSI (overshoot
    = too hard).
  - *Handlebar:* rotate the bar to align it, with mirrored mouse controls.
- **Parts bin chaos:** pick the correct part out of a messy pile (e.g. 3 nearly
  identical bolts). The wrong one = bad score.
- **IKEA manual:** follow wordless instructions; steps done in the wrong order
  give penalties.
- **Time pressure:** the whole build has a timer, so rushing costs quality.
- **Leftover screws:** a joke stat. "You have 3 screws left over…" adds a
  small random penalty.

## 5. Track ✅ 🧪

About 400 m long; a good run takes roughly 30–45 s. It's built from small pieces
in `src/race/track.ts`, so the layout is easy to change:

1. Warm-up straight + small bumps
2. Gentle hill up/down
3. **First jump** (kicker)
4. **Whoops!** (fast rhythm bumps)
5. **Big hill** with a step-down drop
6. **Tabletop** jump, then two kickers
7. **Rollercoaster** (big rolling bumps)
8. Climb + steep descent
9. **Almost there…** final kicker + bumps → **FINISH**

Ideas 💡:
- A trick-section shortcut for skilled riders.
- Personal touches: signs with inside jokes, a cameo of the present's silhouette
  near the finish, the birthday person's name written in the hills.
- A "ghost" of your best run to race against.
- Checkpoints are intentionally **not** included: starting over from the
  beginning is part of the fun (and the frustration).

## 6. Crash rules ✅

- **Head/body hits the ground** → crash (the rider is a sensor shape on the chassis).
- **Flipped** past ~120° for more than 0.35 s → crash.
- **Fell** off the world → crash.
- After a crash the wreck keeps tumbling for about a second, then you see a
  random funny line plus the distance reached.

## 7. Present reveal ✅

- Text is set in `src/config.ts` (`revealTitle`, `revealMessageB64`).
- The message is stored in **base64**, so it isn't readable when someone skims
  the JS bundle. It is **not** secure; anyone with dev tools can decode it. If
  that matters, see the ideas below.
- Encode a message: `printf '%s' "Your message" | base64 -w0`
- Ideas 💡:
  - Reveal the present piece by piece: e.g. each 100 m reached for the first
    time unlocks one word or clue, and the finish shows everything.
  - Encrypt the message with a key derived from finishing (only obfuscation, but
    harder to read).
  - Show a photo or QR code instead of text (put it in `public/`).
  - Show the stats at the end ("It took you 37 attempts and 6 bikes").

## 8. Persistence ✅

`localStorage` stores the latest bike, attempts, number of bikes built, best
distance, best time and whether the player has finished. "reset" on the title
screen clears it all.

## 9. Polish backlog 💡

- Sound: engine pitch from wheel speed, sputter sound, crash "crunch", cheering at the finish.
- Screen shake on landing or crashing; ragdoll rider on crash.
- Better bike sprite and animated rider limbs (knees bend on landing).
- A short tutorial hint the first time ("hold Q… gently!").
- Difficulty safety net: after N failed attempts, offer a "training wheels" hint
  (do we want that? see open questions).
- Leaderboard of attempts (just for the birthday person + friends?).

## 10. Open questions

- What is the present / how will it be revealed (text, image, coordinates, code)?
- How hard should it be? Who will play it, and on which device (laptop keyboard
  vs. phone)?
- Should there be a mercy mechanic after many failures, or keep it pure?
- Which assembly mini-game direction feels best (see §4)?
- Where will it be hosted (GitHub Pages, a USB stick with `dist/`, a local laptop)?

## 11. Dev notes

- `nix develop` → `pnpm install` → `pnpm dev`
- `pnpm test`: the physics tests include a simple bot that must finish the track
  on a perfect bike. It works as a regression check when tuning the track/physics.
- Dev-only URL shortcuts: `?screen=race&quality=0.5`, `?screen=assembly`,
  `?screen=reveal`.
- `pnpm build` → static files in `dist/` (relative paths, so they can be hosted anywhere).
- Physics: planck.js (Box2D port), fixed 60 Hz timestep. The simulation
  (`src/race/sim.ts`) has no DOM code, so it can run in tests.
