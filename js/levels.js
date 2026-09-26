// Level data. Coordinates are in the 1920x1080 logical space, measured off each painted background.
// Floors: y = the line characters' feet stand on. Objects anchor bottom-centre on their floor (+dy).
// Hide styles: sprite 'barrel' = hop in; other sprites = crouch behind; `poly` = slip behind painted
// scenery (the background is redrawn over Pip); `rect` = crouch in the shadows under furniture.
import { sfx } from './audio.js';
import { IMG, drawSprite } from './assets.js';

const has = (g, i) => g.items.includes(i);
const kitten = (floor, x, dy, sprite = 'kitten_peek', scale = 0.38) =>
  ({ id: 'kitten', type: 'pickup', kitten: true, sprite, floor, x, dy, scale, label: 'A kitten?!', msg: "Whiskers! How did you get all the way in here? Come on, you're coming with me." });

export const LEVELS = [
  // ───────────────────────────── 1 ─────────────────────────────
  {
    id: 'harbor', name: 'Harbor at Midnight', bg: 'bg_harbor',
    intro: "Pirates stole the Great Crystal from Grandpa's lighthouse — and took Grandpa too! Without the light, ships crash on the rocks. Their ship is moored at the end of the dock. Time to get aboard...",
    tip: 'A / D to walk, W / S to climb, E to hide or grab. Stay out of the lantern light!',
    ambience: 0.55,
    floors: {
      D: { y: 676, x1: 40, x2: 1890 },
      S: { y: 452, x1: 1150, x2: 1880 },
    },
    ladders: [{ id: 'rope', x: 1245, top: 'S', bottom: 'D', style: 'rope', hook: true, topExtra: 0, enabled: g => g.flags.rope }],
    start: { floor: 'D', x: 70, face: 1 },
    objects: [
      { id: 'b1', type: 'hide', sprite: 'barrel', floor: 'D', x: 330, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'b2', type: 'hide', sprite: 'barrel', floor: 'D', x: 1010, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'b3', type: 'hide', sprite: 'barrel', floor: 'D', x: 1560, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'crates', type: 'search', floor: 'D', x: 140, hit: { w: 170, h: 190 }, gives: 'ruby', treasure: true, label: 'Search the crates', act: 1.1 },
      { id: 'coin', type: 'pickup', sprite: 'coin', floor: 'D', x: 770, dy: -20, scale: 0.2, gives: 'coin', treasure: true, bob: true, glow: true, label: 'Gold doubloon!' },
      { id: 'hook', type: 'pickup', sprite: 'hook', floor: 'D', x: 1810, scale: 0.4, gives: 'hook', glow: true, label: 'Grappling hook', msg: 'A grappling hook! That could reach the deck...' },
      {
        id: 'hull', type: 'use', floor: 'D', x: 1245, hit: { w: 190, h: 220 }, requires: 'hook', consume: true, act: 1.4, pose: 'cheer',
        label: 'Throw the grappling hook', needMsg: "The deck's way too high... I need something to climb with.",
        activeIf: g => !g.flags.rope,
        onDone: g => { g.flags.rope = true; sfx.whoosh(); g.burst(1245, 452, '#fff3c0', 14); g.say('Clunk! The hook caught the railing. Up we go!'); },
      },
      kitten('D', 1440, -52, 'kitten_sleep', 0.28),
      { id: 'pearl', type: 'pickup', sprite: 'pearl', floor: 'S', x: 1530, dy: -4, scale: 0.2, gives: 'pearl', treasure: true, glow: true, label: 'A pearl!' },
      { id: 'hatch', type: 'exit', floor: 'S', x: 1820, hit: { w: 130, h: 170 }, arrow: 'down', label: 'Sneak below deck', requiresFlag: 'rope' },
    ],
    enemies: [
      { id: 'watch', type: 'deckhand', floor: 'D', x: 900, face: 1, speed: 105, range: 430,
        patrol: [{ x: 1650, wait: 2.4, look: true }, { x: 560, wait: 2.4, look: true }] },
    ],
    lights: [
      { x: 96, y: 401, r: 230 }, { x: 614, y: 468, r: 220 }, { x: 1862, y: 449, r: 220 },
      { x: 1115, y: 138, r: 280, color: '200,210,255', a: 0.18 },
    ],
    objective: g => !has(g, 'hook') && !g.flags.rope ? 'Find a way aboard the pirate ship'
      : !g.flags.rope ? 'Use the grappling hook on the ship' : 'Sneak below deck through the hatch',
    hint: g => !has(g, 'hook') && !g.flags.rope ? 'Something at the far end of the dock could reach the deck. Duck into barrels whenever the watchman turns your way.'
      : !g.flags.rope ? "Throw the hook at the ship's hull (the dark wood above the dock) while the watchman is far away."
      : 'Climb the rope and head for the glowing arrow on deck.',
  },

  // ───────────────────────────── 2 ─────────────────────────────
  {
    id: 'below', name: 'Below Deck', bg: 'bg_below',
    intro: "The crew is snoring in their hammocks, and the cook is stirring tomorrow's stew. Somewhere down here is the key to the captain's cabin...",
    tip: 'Sleepy pirates wake up now and then — cross while they snore! A loud noise can lure a guard away.',
    ambience: 0.3,
    floors: {
      U: { y: 450, x1: 110, x2: 1830 },
      L: { y: 946, x1: 120, x2: 1810 },
    },
    ladders: [
      { id: 'A', x: 250, top: 'U', bottom: 'L' },
      { id: 'B', x: 1110, top: 'U', bottom: 'L' },
      { id: 'C', x: 1768, top: 'U', bottom: 'L' },
    ],
    start: { floor: 'U', x: 150, face: 1 },
    objects: [
      { id: 'bU', type: 'hide', sprite: 'barrel', floor: 'U', x: 1010, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'bL1', type: 'hide', sprite: 'barrel', floor: 'L', x: 880, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'bL2', type: 'hide', sprite: 'barrel', floor: 'L', x: 1580, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'chest', type: 'search', floor: 'U', x: 917, hit: { w: 250, h: 130, dy: -22 }, gives: 'coin', treasure: true, label: 'Peek in the sea chest', act: 1.1 },
      { id: 'sacks', type: 'hide', floor: 'L', x: 640, hit: { w: 300, h: 200, dy: -50 }, label: 'Hide behind the sacks', backX: 640, backY: 885,
        poly: [[300, 890], [305, 790], [340, 760], [460, 762], [470, 712], [520, 690], [575, 700], [600, 725], [620, 745], [700, 742], [730, 775], [760, 790], [840, 795], [890, 835], [895, 890]] },
      { id: 'bottle', type: 'noise', sprite: 'bottle', floor: 'U', x: 310, scale: 0.3, label: 'Knock the bottle down the hatch', act: 0.5, sound: 'clatter', popText: 'CLANG!',
        noiseFloor: 'L', noiseX: 290, investigate: 5, cooldown: 8, repeat: true, msg: "Oops! ...I mean, perfect. That should get the cook's attention.",
        activeIf: g => !(g.obj('bottle').cool > 0) },
      { id: 'ropes', type: 'search', floor: 'L', x: 170, hit: { w: 240, h: 230 }, gives: 'pearl', treasure: true, label: 'Search the rope coils', act: 1.1 },
      { id: 'stew', type: 'search', floor: 'L', x: 1318, hit: { w: 180, h: 110, dy: -175 }, gives: 'ruby', treasure: true, label: 'Rummage in the stew pot', act: 1.2 },
      { id: 'key', type: 'pickup', sprite: 'key', floor: 'L', x: 1720, dy: -163, scale: 0.28, gives: 'key', glow: true, label: "The captain's key!", msg: "The captain's key! Now for his cabin..." },
      kitten('L', 1790, -330),
      { id: 'door', type: 'exit', floor: 'U', x: 1815, hit: { w: 90, h: 260 }, arrow: 'right', label: 'Head deeper into the ship', requires: 'key', needMsg: "I need the captain's key before I go any further. It must be around here somewhere." },
    ],
    enemies: [
      { id: 'cook', type: 'cook', floor: 'L', x: 1318, face: 1, speed: 92, range: 420,
        patrol: [{ x: 1318, wait: 5, pose: 'stir', range: 460, face: 1 }, { x: 660, wait: 2, look: true }] },
      { id: 'z1', type: 'sleeper', floor: 'U', x: 630, dy: -48, scale: 0.75, range: 280, sleep: 5.2, stir: 1.3, awake: 2.6, offset: 0 },
      { id: 'z2', type: 'sleeper', floor: 'U', x: 1450, dy: -48, scale: 0.75, flip: true, range: 290, sleep: 5.2, stir: 1.3, awake: 2.6, offset: 3.6 },
    ],
    lights: [
      { x: 365, y: 153, r: 220 }, { x: 950, y: 134, r: 220 }, { x: 1550, y: 153, r: 220 },
      { x: 689, y: 621, r: 200 }, { x: 1793, y: 726, r: 200 }, { x: 1325, y: 840, r: 260, color: '255,110,40', a: 0.3 },
    ],
    objective: g => !has(g, 'key') ? "Steal the captain's key from the galley" : 'Slip through the door on the upper right',
    hint: g => !has(g, 'key') ? 'The key is on the galley counter (lower right). Knock the bottle down the left hatch to lure the cook away, then use the right ladder.'
      : 'Climb the galley ladder on the far right — the door is right at the top.',
  },

  // ───────────────────────────── 3 (new) ─────────────────────────────
  {
    id: 'hold', name: 'The Cargo Hold', bg: 'bg_hold',
    intro: "Deep in the dark cargo hold, the captain hides his sea chart — without it we'll never find our way home. The crew can barely see in the dark... unless you step into the lantern light.",
    tip: 'Guards see much less in the dark. Snuff out lanterns to make shadows — but the crew relights them when they pass!',
    ambience: 0.35,
    dark: 0.66,
    floors: {
      L: { y: 862, x1: 190, x2: 1760 },
      W: { y: 458, x1: 860, x2: 1780 },
    },
    ladders: [{ id: 'lift', x: 860, top: 'W', bottom: 'L', style: 'lift', ropeTop: 34, noise: 650, enabled: g => g.flags.lift }],
    start: { floor: 'L', x: 230, face: 1 },
    objects: [
      { id: 'lamp1', type: 'use', lamp: 'l1', repeat: true, floor: 'L', x: 297, hit: { w: 90, h: 140, dy: -500 }, act: 0.6, label: 'Snuff out the lantern', verb: 'Snuff', activeIf: g => g.lamps.l1.lit },
      { id: 'lamp2', type: 'use', lamp: 'l2', repeat: true, floor: 'W', x: 932, hit: { w: 90, h: 140, dy: -130 }, act: 0.6, label: 'Snuff out the lantern', verb: 'Snuff', activeIf: g => g.lamps.l2.lit },
      { id: 'lamp3', type: 'use', lamp: 'l3', repeat: true, floor: 'W', x: 1583, hit: { w: 90, h: 140, dy: -130 }, act: 0.6, label: 'Snuff out the lantern', verb: 'Snuff', activeIf: g => g.lamps.l3.lit },
      { id: 'ropecoil', type: 'search', floor: 'L', x: 190, hit: { w: 150, h: 100, dy: -212 }, gives: 'pearl', treasure: true, label: 'Search the rope coil', act: 1.0 },
      { id: 'bL1', type: 'hide', sprite: 'barrel', floor: 'L', x: 560, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'lever', type: 'use', sprite: 'lever_up', floor: 'L', x: 760, dy: -8, scale: 0.5, act: 1.0, label: 'Pull the lift lever', verb: 'Pull',
        onDone: (g, o) => { o.sprite = 'lever_down'; g.flags.lift = true; sfx.lift(); g.makeNoise('L', 760, 700, 3); g.popText('CLUNK!', 800, 720); g.say('The old cargo lift creaks awake... that was LOUD.'); } },
      kitten('L', 850, -337),
      { id: 'bL2', type: 'hide', sprite: 'barrel', floor: 'L', x: 1180, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'chains', type: 'search', floor: 'L', x: 1360, hit: { w: 200, h: 130, dy: -100 }, gives: 'ruby', treasure: true, label: 'Rummage in the chains', act: 1.2 },
      { id: 'bWa', type: 'hide', sprite: 'barrel', floor: 'W', x: 1030, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'coin', type: 'pickup', sprite: 'coin', floor: 'W', x: 1150, dy: -14, scale: 0.2, gives: 'coin', treasure: true, bob: true, glow: true, label: 'Gold doubloon!' },
      { id: 'bW', type: 'hide', sprite: 'barrel', floor: 'W', x: 1300, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'chart', type: 'pickup', sprite: 'map_item', floor: 'W', x: 1690, dy: -6, scale: 0.32, gives: 'chart', glow: true, label: "The captain's sea chart", msg: "The sea chart! Now we can find the way home." },
      { id: 'hatch', type: 'exit', floor: 'W', x: 1772, hit: { w: 80, h: 240 }, arrow: 'up', label: 'Climb out through the hatch', requires: 'chart', needMsg: "Not without the sea chart!" },
    ],
    enemies: [
      { id: 'bosun', type: 'deckhand', floor: 'L', x: 1150, face: 1, speed: 100, range: 440, lantern: true, relights: true,
        patrol: [{ x: 1560, wait: 2.2, look: true }, { x: 300, wait: 2.2, look: true }] },
      { id: 'hawk', type: 'mate', floor: 'W', x: 1400, face: 1, speed: 88, range: 420, relights: true,
        patrol: [{ x: 1700, wait: 2.6, look: true }, { x: 945, wait: 2.6, look: true }] },
    ],
    lights: [
      { id: 'l1', floor: 'L', x: 297, y: 292, lx: 300, ly: 790, r: 280, a: 0.42 },
      { id: 'l2', floor: 'W', x: 932, y: 262, lx: 935, ly: 400, r: 250, a: 0.42 },
      { id: 'l3', floor: 'W', x: 1583, y: 262, lx: 1585, ly: 400, r: 250, a: 0.42 },
    ],
    objective: g => !has(g, 'chart') ? (g.flags.lift ? 'Ride the lift up and steal the sea chart' : 'Find a way up to the walkway') : 'Escape through the hatch',
    hint: g => !g.flags.lift ? 'Pull the lever near the crates to start the cargo lift — the noise will bring the bosun, so hide right after!'
      : !has(g, 'chart') ? 'Snuff the walkway lanterns so the first mate can barely see, then grab the chart at the far right.'
      : 'The hatch is at the top right.',
  },

  // ───────────────────────────── 4 (new) ─────────────────────────────
  {
    id: 'brig', name: 'The Brig', bg: 'bg_brig', panelAfter: 'panel2',
    intro: "Grandpa is locked in the brig! The jailer keeps the keys on his belt — and his bulldog Brutus can sniff out anyone, even someone hiding in a barrel.",
    tip: 'Brutus smells you when you get close, even when hidden. Give him something tasty. Pickpocket from BEHIND!',
    ambience: 0.25,
    floors: {
      M: { y: 880, x1: 150, x2: 1830 },
      G: { y: 432, x1: 40, x2: 790 },
    },
    ladders: [{ id: 'A', x: 420, top: 'G', bottom: 'M' }],
    start: { floor: 'G', x: 100, face: 1 },
    objects: [
      { id: 'coin', type: 'pickup', sprite: 'coin', floor: 'G', x: 250, dy: -14, scale: 0.2, gives: 'coin', treasure: true, bob: true, glow: true, label: 'Gold doubloon!' },
      { id: 'ham', type: 'pickup', sprite: 'ham', floor: 'G', x: 640, dy: -4, scale: 0.3, gives: 'ham', glow: true, label: 'A big juicy ham', msg: "A big juicy ham... I know someone who'd LOVE this." },
      { id: 'bowl', type: 'use', sprite: 'bowl', floor: 'M', x: 240, scale: 0.42, requires: 'ham', consume: true, act: 0.8, label: 'Fill the dog bowl', verb: 'Feed',
        needMsg: "Brutus's bowl is empty. If only I had some food...",
        onDone: (g, o) => { o.sprite = 'bowl_full'; g.flags.fed = true; g.feedDog('brutus', 318, 14); sfx.pick(); g.say('Here, Brutus! Dinner time!'); } },
      { id: 'table', type: 'hide', floor: 'M', x: 745, hit: { w: 190, h: 130, dy: -10 }, label: 'Hide under the table', backX: 750, backY: 795, rect: [662, 672, 838, 797] },
      { id: 'tankard', type: 'search', floor: 'M', x: 815, hit: { w: 80, h: 70, dy: -218 }, gives: 'ruby', treasure: true, label: "Check the jailer's tankard", act: 0.9 },
      { id: 'keys', type: 'pickup', follow: 'jailer', floor: 'M', x: 760, hit: { w: 90, h: 120, dy: -40 }, gives: 'keys', act: 0.7, label: "Pickpocket the jailer's keys",
        msg: "Got the keys! He didn't feel a thing." },
      { id: 'basket', type: 'search', floor: 'M', x: 995, hit: { w: 160, h: 90, dy: -90 }, gives: 'pearl', treasure: true, label: "Rummage in Brutus's basket", act: 1.0 },
      { id: 'bM1', type: 'hide', sprite: 'barrel', floor: 'M', x: 1080, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'cell1', type: 'use', floor: 'M', x: 1285, hit: { w: 260, h: 420 }, requires: 'keys', act: 1.0, label: 'Unlock this cell', verb: 'Unlock',
        needMsg: 'Locked. Something small is moving in there...',
        onDone: g => { g.flags.cell1 = true; sfx.unlock(); } },
      { id: 'cell2', type: 'use', floor: 'M', x: 1645, hit: { w: 260, h: 420 }, requires: 'keys', act: 1.2, label: "Unlock Grandpa's cell", verb: 'Unlock',
        needMsg: '"Pip?! Is that you?" — "Hang on, Grandpa! I need the jailer\'s keys!"',
        onDone: g => { g.flags.freed = true; g.freedT = 0; sfx.unlock(); sfx.win(); g.say('"Pip! My brave girl!" — "Come on Grandpa, let\'s get out of here!"', 4); } },
      { id: 'bM2', type: 'hide', sprite: 'barrel', floor: 'M', x: 1805, scale: 0.7, label: 'Hide in the barrel' },
      { ...kitten('M', 1290, 0, 'kitten_sit', 0.3), activeIf: g => g.flags.cell1, visibleIf: g => g.flags.cell1 },
      { id: 'exit', type: 'exit', floor: 'M', x: 170, hit: { w: 110, h: 260 }, arrow: 'left', label: 'Sneak out with Grandpa', requiresFlag: 'freed', needMsg: "I'm not leaving without Grandpa!" },
    ],
    enemies: [
      { id: 'jailer', type: 'jailer', floor: 'M', x: 760, face: 1, speed: 80, range: 420,
        patrol: [{ x: 760, wait: 7, pose: 'yawn', range: 0, doze: true, face: 1 }, { x: 1480, wait: 2.6, look: true }] },
      { id: 'brutus', type: 'dog', floor: 'M', x: 1150, face: -1, speed: 125, range: 280, smell: 120,
        patrol: [{ x: 330, wait: 1.8, pose: 'sniff', look: true }, { x: 1340, wait: 1.8, pose: 'sniff', look: true }] },
    ],
    lights: [
      { x: 235, y: 195, r: 200 }, { x: 967, y: 195, r: 200 }, { x: 1677, y: 195, r: 200 }, { x: 698, y: 625, r: 150 },
    ],
    init: g => { g.freedT = -1; },
    update: (g, dt) => {
      if (g.flags.fed) { const d = g.enemy('brutus'); if (d.mode !== 'eat' && d.mode !== 'investigate') g.obj('bowl').sprite = 'bowl'; }
      if (g.flags.freed) g.freedT += dt;
    },
    drawBack: (ctx, g) => {
      // who's behind the bars: the kitten in cell 1, Grandpa in cell 2
      if (!g.flags.cell1) drawSprite(ctx, 'kitten_sit', 1290, 776, 0.3, true);
      if (!g.flags.freed) drawSprite(ctx, 'grandpa_sit', 1650, 780, 0.52, true);
      for (const [key, x0, x1] of [['cell1', 1138, 1428], ['freed', 1498, 1792]]) {
        if (g.flags[key]) {
          // door swung open: interior shadow + the barred door folded against the hinge
          ctx.fillStyle = 'rgba(20,12,6,0.55)'; ctx.fillRect(x0 + 10, 338, x1 - x0 - 20, 436);
          ctx.save(); ctx.translate(x0, 0); ctx.scale(0.2, 1); ctx.drawImage(IMG.bg_brig, x0, 330, x1 - x0, 450, 0, 330, x1 - x0, 450); ctx.restore();
        } else {
          drawSprite(ctx, key === 'cell1' ? 'bars1' : 'bars2', (x0 + x1) / 2, 780, 1);
        }
      }
      if (g.flags.freed) {
        const t = g.freedT;
        if (t < 2.2) drawSprite(ctx, t < 0.6 ? 'grandpa_idle' : 'grandpa_wave', 1600, 880, 0.46, true);
        else {
          const x = Math.max(260, 1600 - (t - 2.2) * 150);
          drawSprite(ctx, x > 260 ? (Math.floor(t * 6) % 2 ? 'grandpa_walk' : 'grandpa_idle') : 'grandpa_wave', x, 880 - (x > 260 ? Math.abs(Math.sin(t * 9)) * 4 : 0), 0.46, true);
        }
      }
    },
    objective: g => !has(g, 'keys') && !g.flags.freed ? (g.flags.fed ? "Pickpocket the jailer's keys from behind" : 'Get past Brutus and steal the jailer\'s keys')
      : !g.flags.freed ? "Unlock Grandpa's cell" : 'Sneak out with Grandpa (far left)',
    hint: g => !g.flags.fed && !has(g, 'keys') ? 'Grab the ham on the upper gallery and put it in the dog bowl (lower left). Brutus will be busy eating!'
      : !has(g, 'keys') ? 'When the jailer dozes at his table facing right, sneak up behind him from the LEFT and pickpocket his keys.'
      : !g.flags.freed ? "Grandpa's cell is the one on the far right." : 'Head for the arrow on the far left.',
  },

  // ───────────────────────────── 5 ─────────────────────────────
  {
    id: 'cabin', name: "The Captain's Cabin", bg: 'bg_cabin',
    intro: "Captain Blackgull keeps the Great Crystal locked in a chest on his balcony. He's dozing at his desk... and his parrot never sleeps.",
    tip: 'The parrot squawks if it sees you. Something to cover it would help... Hide behind the curtain or under the desk.',
    ambience: 0.2,
    startItems: ['key'],
    floors: {
      M: { y: 880, x1: 130, x2: 1800 },
      B: { y: 432, x1: 50, x2: 870 },
    },
    ladders: [{ id: 'L', x: 820, top: 'B', bottom: 'M' }],
    start: { floor: 'M', x: 1770, face: -1 },
    objects: [
      { id: 'cloth', type: 'pickup', sprite: 'cloth', floor: 'M', x: 1580, scale: 0.36, gives: 'cloth', glow: true, label: 'A heavy cloth', msg: 'A heavy cloth... perfect for a nosy bird.' },
      { id: 'crates', type: 'hide', sprite: 'crates', floor: 'M', x: 1700, scale: 0.62, label: 'Hide behind the crates' },
      { id: 'curtain', type: 'hide', floor: 'M', x: 1072, hit: { w: 120, h: 360 }, label: 'Hide behind the curtain', backX: 1073, backY: 748, peekDir: -1,
        poly: [[1028, 752], [1034, 600], [1052, 450], [1066, 330], [1122, 330], [1116, 450], [1110, 600], [1120, 752]] },
      { id: 'rum', type: 'hide', sprite: 'barrel', floor: 'M', x: 700, scale: 0.7, label: 'Hide in the rum barrel' },
      { id: 'desk', type: 'hide', floor: 'M', x: 1300, hit: { w: 190, h: 120, dy: -10 }, label: 'Hide under the desk', backX: 1316, backY: 792, rect: [1238, 688, 1396, 794] },
      { id: 'crown', type: 'pickup', sprite: 'crown', floor: 'M', x: 1380, dy: -222, scale: 0.2, gives: 'crown', treasure: true, glow: true, label: 'Pinch the crown!' },
      { id: 'shelf', type: 'search', floor: 'M', x: 610, hit: { w: 220, h: 210, dy: -190 }, gives: 'ruby', treasure: true, label: 'Search the bookshelf', act: 1.1 },
      kitten('M', 250, -262, 'kitten_sleep', 0.28),
      { id: 'parrotUse', type: 'use', floor: 'M', x: 520, standX: 600, hit: { w: 150, h: 200 }, requires: 'cloth', consume: true, act: 0.7,
        label: 'Cover the parrot', verb: 'Cover', needMsg: "I can't get past that parrot without something to cover it...",
        activeIf: g => !g.enemy('polly').covered,
        onDone: g => { const p = g.enemy('polly'); p.covered = true; p.sus = 0; p.bubble = { text: '...', t: 1.5 }; sfx.hide(); g.say('Shhh... sleepy time, birdie.'); } },
      { id: 'bshelf', type: 'search', floor: 'B', x: 640, hit: { w: 220, h: 150, dy: -40 }, gives: 'coin', treasure: true, label: 'Search the upper bookshelf', act: 1.1 },
      { id: 'chest', type: 'use', sprite: 'chest', floor: 'B', x: 330, scale: 0.55, requires: 'key', consume: true, act: 1.3, label: 'Unlock the chest', verb: 'Unlock',
        needMsg: 'Locked tight.',
        onDone: (g, o) => { o.sprite = 'chest_open'; sfx.unlock(); g.collect({ gives: 'crystal', flag: 'crystal', msg: "The Great Crystal! It's glowing... Now let's get out of here!" }, o.x, g.fy('B') - 80); } },
      { id: 'exit', type: 'exit', floor: 'B', x: 80, hit: { w: 120, h: 240 }, arrow: 'left', label: 'Escape up to the rigging', requiresFlag: 'crystal', needMsg: 'Not without the crystal!' },
    ],
    enemies: [
      { id: 'cap', type: 'captain', floor: 'M', x: 1330, face: 1, speed: 88, range: 460,
        patrol: [{ x: 1330, wait: 6, pose: 'sleep', range: 0, face: 1 }, { x: 330, wait: 2.4, look: true }] },
      { id: 'polly', type: 'parrot', floor: 'M', x: 520, face: 1, range: 300, turn: 3.2, scale: 0.72 },
    ],
    lights: [
      { x: 130, y: 200, r: 170 }, { x: 403, y: 200, r: 170 }, { x: 974, y: 492, r: 170 }, { x: 1267, y: 153, r: 330 },
      { x: 1459, y: 583, r: 160 }, { x: 1838, y: 535, r: 170 }, { x: 1498, y: 287, r: 420, color: '140,170,255', a: 0.14 },
    ],
    objective: g => !g.flags.crystal ? (g.enemy('polly').covered ? 'Open the chest on the balcony' : 'Get past the parrot and reach the balcony chest') : 'Escape through the balcony door',
    hint: g => !has(g, 'cloth') && !g.enemy('polly').covered ? 'Grab the cloth near the door, then cover the parrot while it faces the other way.'
      : !g.enemy('polly').covered ? 'Walk up behind the parrot when it looks left, and cover it.'
      : !g.flags.crystal ? 'Climb the ladder to the balcony and unlock the chest with the key.' : 'Out the door on the top left!',
  },

  // ───────────────────────────── 6 (new) ─────────────────────────────
  {
    id: 'rigging', name: 'Up in the Rigging', bg: 'bg_rigging',
    intro: "To outrun the pirates we'll need full sails! Climb the rigging and untie the three sails. But Hawkeye the first mate never lets go of his spyglass... and a storm lantern swings from the crow's nest.",
    tip: "Hawkeye's spyglass sees VERY far, but only one way. Duck behind the mast when he looks toward you.",
    ambience: 0.7,
    floors: {
      Y1: { y: 668, x1: 130, x2: 1800 },
      Y2: { y: 360, x1: 380, x2: 1500 },
      N: { y: 205, x1: 812, x2: 1070 },
    },
    ladders: [
      { id: 'r1', x: 640, top: 'Y2', bottom: 'Y1', style: 'rope', topExtra: 4 },
      { id: 'r2', x: 1270, top: 'Y2', bottom: 'Y1', style: 'rope', topExtra: 4 },
      { id: 'r3', x: 1045, top: 'N', bottom: 'Y2', style: 'rope', topExtra: 4 },
    ],
    occluders: [[[776, 118], [1102, 118], [1092, 232], [786, 232]]],
    start: { floor: 'Y1', x: 170, face: 1 },
    objects: [
      { id: 'knotA', type: 'use', sprite: 'knot', floor: 'Y1', x: 400, dy: 14, scale: 0.3, act: 1.4, label: 'Untie the sail', verb: 'Untie',
        onDone: g => g.dropSail('A') },
      { id: 'mast1', type: 'hide', floor: 'Y1', x: 940, hit: { w: 140, h: 150 }, label: 'Hide behind the mast', backX: 940, backY: 668, backScale: 0.95,
        poly: [[871, 516], [1013, 516], [1013, 676], [871, 676]] },
      { id: 'knotB', type: 'use', sprite: 'knot', floor: 'Y1', x: 1500, dy: 14, scale: 0.3, act: 1.4, label: 'Untie the sail', verb: 'Untie',
        onDone: g => g.dropSail('B') },
      { id: 'coin', type: 'pickup', sprite: 'coin', floor: 'Y1', x: 1720, dy: -14, scale: 0.2, gives: 'coin', treasure: true, bob: true, glow: true, label: 'Gold doubloon!' },
      { id: 'knotC', type: 'use', sprite: 'knot', floor: 'Y2', x: 700, dy: 14, scale: 0.3, act: 1.4, label: 'Untie the sail', verb: 'Untie',
        onDone: g => g.dropSail('C') },
      { id: 'mast2', type: 'hide', floor: 'Y2', x: 940, hit: { w: 140, h: 150 }, label: 'Hide behind the mast', backX: 940, backY: 360, backScale: 0.95,
        poly: [[873, 222], [1009, 222], [1009, 368], [873, 368]] },
      { id: 'pearl', type: 'pickup', sprite: 'pearl', floor: 'Y2', x: 1455, dy: -4, scale: 0.2, gives: 'pearl', treasure: true, glow: true, label: 'A pearl!' },
      { id: 'nest', type: 'search', floor: 'N', x: 870, hit: { w: 110, h: 90, dy: -40 }, gives: 'ruby', treasure: true, label: "Search the crow's nest", act: 1.0 },
      kitten('N', 1015, -70),
      { id: 'slide', type: 'exit', floor: 'Y1', x: 1778, hit: { w: 90, h: 200 }, arrow: 'down', label: 'Slide down to the deck', requiresFlag: 'sails', needMsg: 'The sails are still tied up! Untie all three first.' },
    ],
    enemies: [
      { id: 'hawk', type: 'mate', floor: 'Y2', x: 900, face: -1, speed: 80, range: 360,
        patrol: [{ x: 500, wait: 3.2, pose: 'spy', range: 820, face: 1 }, { x: 1380, wait: 3.2, pose: 'spy', range: 820, face: -1 }] },
      { id: 'lantern', type: 'beam', floor: 'Y1', src: { x: 938, y: 150 }, x1: 260, x2: 1640, width: 170, speed: 175, pause: 1.1 },
    ],
    lights: [
      { x: 1575, y: 150, r: 320, color: '200,210,255', a: 0.2 }, { x: 938, y: 150, r: 170 },
    ],
    init: g => {
      g.sails = { A: -1, B: -1, C: -1 };
      g.dropSail = k => {
        g.sails[k] = 0; sfx.whoosh(); g.shake = 6; g.hooks.hud(g);
        const n = Object.values(g.sails).filter(v => v >= 0).length;
        if (n === 3) { g.flags.sails = true; g.say('All sails free! The wind fills them — to the deck!', 3); }
        else g.say(`Sail ${n} of 3 is loose!`, 2);
      };
    },
    update: (g, dt) => { for (const k in g.sails) if (g.sails[k] >= 0) g.sails[k] = Math.min(1, g.sails[k] + dt * 1.6); },
    drawBack: (ctx, g) => {
      // unfurled sails billowing down from the yards
      const S = { A: [150, 780, 716, 300], B: [1080, 1790, 716, 300], C: [400, 885, 410, 230] };
      for (const k in S) {
        const v = g.sails[k]; if (v < 0) continue;
        const [x0, x1, y0, h0] = S[k], h = h0 * (1 - Math.pow(1 - v, 3));
        const wind = Math.sin(g.t * 1.3 + x0) * 10;
        const grd = ctx.createLinearGradient(0, y0, 0, y0 + h);
        grd.addColorStop(0, '#efe3c6'); grd.addColorStop(1, '#cdbb95');
        ctx.fillStyle = grd; ctx.strokeStyle = '#4a3418'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
        ctx.quadraticCurveTo(x1 + 18 + wind, y0 + h * 0.5, x1 - 10, y0 + h);
        ctx.quadraticCurveTo((x0 + x1) / 2 + wind * 2, y0 + h + 40 + wind, x0 + 10, y0 + h);
        ctx.quadraticCurveTo(x0 - 18 + wind, y0 + h * 0.5, x0, y0);
        ctx.closePath(); ctx.fill();
        // body shading: darker at the edges, a soft highlight where the wind bellies it out
        const sh = ctx.createLinearGradient(x0, 0, x1, 0);
        sh.addColorStop(0, 'rgba(70,50,20,0.28)'); sh.addColorStop(0.35, 'rgba(255,255,240,0.18)'); sh.addColorStop(0.6, 'rgba(255,255,240,0.05)'); sh.addColorStop(1, 'rgba(70,50,20,0.32)');
        ctx.fillStyle = sh; ctx.fill();
        const moon = ctx.createLinearGradient(0, y0, 0, y0 + h);
        moon.addColorStop(0, 'rgba(40,40,90,0.25)'); moon.addColorStop(0.5, 'rgba(0,0,0,0)'); moon.addColorStop(1, 'rgba(40,40,90,0.3)');
        ctx.fillStyle = moon; ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(120,90,50,0.35)'; ctx.lineWidth = 3;
        for (let i = 1; i < 4; i++) { const x = x0 + (x1 - x0) * i / 4; ctx.beginPath(); ctx.moveTo(x, y0 + 4); ctx.quadraticCurveTo(x + wind, y0 + h * 0.6, x + wind * 0.5, y0 + h + 10); ctx.stroke(); }
      }
    },
    objective: g => !g.flags.sails ? `Untie the sails (${Object.values(g.sails).filter(v => v >= 0).length} / 3)` : 'Slide down to the deck (far right)',
    hint: g => g.flags.sails ? 'The rope on the far right of the lower yard takes you down.'
      : 'Two knots are on the lower yard (left and right), one on the upper yard (left). Hide behind the mast whenever Hawkeye raises his spyglass toward you.',
  },

  // ───────────────────────────── 7 ─────────────────────────────
  {
    id: 'deck', name: 'All Hands on Deck', bg: 'bg_deck',
    intro: "Sails are loose and Grandpa is waiting by the rail! Now release the anchor and take the helm — but the lookout's lantern sweeps the deck...",
    tip: 'Keep out of the lantern beam! The mast and barrels are good cover.',
    ambience: 0.6,
    startItems: ['crystal'],
    floors: {
      M: { y: 726, x1: 40, x2: 1400 },
      Q: { y: 636, x1: 1440, x2: 1890 },
    },
    ladders: [{ id: 'Q', x: 1418, top: 'Q', bottom: 'M', scale: 0.5, topExtra: 6 }],
    start: { floor: 'M', x: 380, face: 1 },
    objects: [
      { id: 'lever', type: 'use', sprite: 'lever_up', floor: 'M', x: 290, dy: -10, scale: 0.55, requires: 'knife', act: 1.6, label: 'Release the anchor', verb: 'Cut & pull',
        needMsg: 'The anchor lever is lashed tight with rope. I need something sharp.',
        onDone: (g, o) => { o.sprite = 'lever_down'; g.flags.anchor = true; sfx.chain(); g.shake = 14; g.say('The anchor chain rattles loose! Now — to the helm!'); } },
      kitten('M', 140, -150, 'kitten_sleep', 0.28),
      { id: 'knife', type: 'pickup', sprite: 'knife', floor: 'M', x: 612, dy: -140, scale: 0.26, gives: 'knife', glow: true, label: "A sailor's knife", msg: 'A knife! Sharp enough to cut rope.' },
      { id: 'bA', type: 'hide', sprite: 'barrel', floor: 'M', x: 470, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'mast', type: 'hide', floor: 'M', x: 858, hit: { w: 120, h: 420 }, label: 'Hide behind the mast', backX: 858, backY: 718,
        poly: [[818, 300], [898, 300], [898, 690], [906, 748], [810, 748], [818, 690]] },
      { id: 'crates', type: 'search', sprite: 'crates', floor: 'M', x: 1100, scale: 0.6, gives: 'ruby', treasure: true, label: 'Search the crates', act: 1.1 },
      { id: 'cannon', type: 'search', floor: 'M', x: 1205, hit: { w: 150, h: 110, dy: -40 }, gives: 'crown', treasure: true, label: 'Peek inside the cannon', act: 1 },
      { id: 'bB', type: 'hide', sprite: 'barrel', floor: 'M', x: 1330, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'coin', type: 'pickup', sprite: 'coin', floor: 'Q', x: 1855, dy: -14, scale: 0.2, gives: 'coin', treasure: true, bob: true, glow: true, label: 'Gold doubloon!' },
      { id: 'helm', type: 'exit', floor: 'Q', x: 1690, hit: { w: 170, h: 220, dy: -10 }, arrow: 'down', label: 'Take the helm!', requiresFlag: 'anchor',
        needMsg: "We're still anchored! Release the anchor lever first (far left)." },
    ],
    enemies: [
      { id: 'hand', type: 'deckhand', floor: 'M', x: 1080, face: 1, speed: 112, range: 400,
        patrol: [{ x: 1300, wait: 2.2, look: true }, { x: 640, wait: 2.2, look: true }] },
      { id: 'lookout', type: 'beam', floor: 'M', src: { x: 868, y: 118 }, x1: 540, x2: 1330, width: 160, speed: 150, pause: 1.3 },
    ],
    lights: [
      { x: 336, y: 535, r: 210 }, { x: 1426, y: 516, r: 210 }, { x: 1891, y: 497, r: 200 },
      { x: 1675, y: 124, r: 240, color: '200,210,255', a: 0.16 }, { x: 868, y: 110, r: 150 },
    ],
    drawBack: (ctx, g) => {
      // the lookout peeking over the crow's nest rim
      ctx.save(); ctx.beginPath(); ctx.rect(760, 0, 280, 84); ctx.clip();
      const im = IMG.deckhand_idle; const s = 0.4, w = im.width * s, h = im.height * s;
      const e = g.enemies.find(x => x.type === 'beam');
      ctx.translate(900, 150); if (e.dir < 0) ctx.scale(-1, 1);
      ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
      // Grandpa crouched by the quarterdeck rail, waiting
      drawSprite(ctx, 'grandpa_sit', 1590, 640, 0.34, true);
    },
    objective: g => !has(g, 'knife') && !g.flags.anchor ? 'Find something to cut the anchor lashing' : !g.flags.anchor ? 'Release the anchor lever' : 'Take the helm on the quarterdeck!',
    hint: g => !has(g, 'knife') && !g.flags.anchor ? "There's a knife lying on the first cannon. Watch the beam and the deckhand."
      : !g.flags.anchor ? 'Cut the lashing on the lever at the far left.' : 'Climb to the quarterdeck on the right and take the wheel!',
  },
];

// The sailing finale (sail.js) is the last node on the map.
export const FINALE = { id: 'sail', name: 'Race to the Lighthouse' };
export const MAP_NODES = [
  { x: 455, y: 680 }, { x: 640, y: 560 }, { x: 835, y: 622 }, { x: 1022, y: 596 },
  { x: 955, y: 410, above: true }, { x: 1150, y: 345, above: true }, { x: 1335, y: 372 }, { x: 1472, y: 262, above: true },
];
