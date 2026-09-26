# Pocket Plunder

A tiny thief. A pirate ship. A lighthouse gone dark.

A 2D stealth adventure inspired by the iPad classics of the early 2010s. Sneak aboard a pirate ship, rescue Grandpa from the brig, steal back the lighthouse's Great Crystal, and sail the ship home.

**Play:** https://marcrsfeir-commits.github.io/pocket-plunder/

- 7 stealth chapters and a sailing finale
- Hop into barrels, slip behind curtains and masts, snuff lanterns to hide in the dark, pickpocket the jailer, distract the ship's dog
- 3 stars per chapter, plus a secret kitten hidden in each level
- Unlock 4 outfits for Pip with stars and kittens

## Controls

| Key | Action |
|---|---|
| A / D | Walk |
| W / S | Climb ladders, ride lifts, steer the ship in the finale |
| E / Space | Hide, grab, search, use |
| H | Hint |
| Esc | Pause |

On phones and tablets, on-screen buttons appear automatically.

## Run locally

```
node server.js
```

Then open http://localhost:8795. There's no build step and there are no dependencies. It's plain HTML5 canvas and ES modules, and all sound is synthesized with WebAudio.
