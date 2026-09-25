// Level data. Coordinates are in the 1920x1080 logical space, measured off each painted background.
// Floors: y = the line characters' feet stand on. Objects anchor bottom-centre on their floor (+dy).
import { sfx } from './audio.js';
import { IMG } from './assets.js';

const has = (g, i) => g.items.includes(i);

export const LEVELS = [
  // ───────────────────────────── 1 ─────────────────────────────
  {
    id: 'harbor', name: 'Harbor at Midnight', bg: 'bg_harbor',
    intro: "The pirates stole the Great Crystal from the lighthouse — and without its light, ships crash on the rocks. Their ship is moored at the end of the dock. Time to get aboard...",
    tip: 'A / D to walk, W / S to climb, E to hide or grab. Stay out of the lantern light!',
    ambience: 0.55,
    floors: {
      D: { y: 676, x1: 40, x2: 1890 },
      S: { y: 452, x1: 1150, x2: 1880 },
    },
    ladders: [{ id: 'rope', x: 1245, top: 'S', bottom: 'D', style: 'rope', topExtra: 0, enabled: g => g.flags.rope }],
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
      : !g.flags.rope ? 'Throw the hook at the ship\'s hull (the dark wood above the dock) while the watchman is far away.'
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
      { id: 'sacks', type: 'hide', floor: 'L', x: 600, hit: { w: 420, h: 230 }, label: 'Hide behind the sacks' },
      { id: 'bottle', type: 'noise', sprite: 'bottle', floor: 'U', x: 310, scale: 0.3, label: 'Knock the bottle down the hatch', act: 0.5, sound: 'clatter', popText: 'CLANG!',
        noiseFloor: 'L', noiseX: 290, investigate: 5, cooldown: 8, repeat: true, msg: 'Oops! ...I mean, perfect. That should get the cook\'s attention.',
        activeIf: g => !(g.objects.find(o => o.id === 'bottle').cool > 0) },
      { id: 'ropes', type: 'search', floor: 'L', x: 170, hit: { w: 240, h: 230 }, gives: 'pearl', treasure: true, label: 'Search the rope coils', act: 1.1 },
      { id: 'stew', type: 'search', floor: 'L', x: 1318, hit: { w: 180, h: 110, dy: -175 }, gives: 'ruby', treasure: true, label: 'Rummage in the stew pot', act: 1.2 },
      { id: 'key', type: 'pickup', sprite: 'key', floor: 'L', x: 1720, dy: -163, scale: 0.28, gives: 'key', glow: true, label: "The captain's key!", msg: "The captain's key! Now for his cabin..." },
      { id: 'door', type: 'exit', floor: 'U', x: 1815, hit: { w: 90, h: 260 }, arrow: 'right', label: "Slip into the captain's cabin", requires: 'key', needMsg: "It's the captain's cabin — locked. His key must be around here somewhere." },
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
    objective: g => !has(g, 'key') ? "Steal the captain's key from the galley" : "Slip through the door to the captain's cabin",
    hint: g => !has(g, 'key') ? 'The key is on the galley counter (lower right). Knock the bottle down the left hatch to lure the cook away, then use the right ladder.'
      : 'Head back up and go through the door on the upper right. Wait for the hammock snorers to fall asleep.',
  },

  // ───────────────────────────── 3 ─────────────────────────────
  {
    id: 'cabin', name: "The Captain's Cabin", bg: 'bg_cabin',
    intro: "Captain Blackgull keeps his greatest prize locked in a chest on his balcony. He's dozing at his desk... and his parrot never sleeps.",
    tip: "The parrot squawks if it sees you. Something to cover it would help... Hide behind curtains and under the desk.",
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
      { id: 'curtain', type: 'hide', floor: 'M', x: 1062, hit: { w: 130, h: 360 }, label: 'Hide behind the curtain' },
      { id: 'post', type: 'hide', floor: 'M', x: 738, hit: { w: 80, h: 400 }, label: 'Hide behind the post' },
      { id: 'desk', type: 'hide', floor: 'M', x: 1300, hit: { w: 190, h: 120, dy: -10 }, label: 'Hide under the desk' },
      { id: 'crown', type: 'pickup', sprite: 'crown', floor: 'M', x: 1380, dy: -222, scale: 0.2, gives: 'crown', treasure: true, glow: true, label: 'Pinch the crown!' },
      { id: 'shelf', type: 'search', floor: 'M', x: 610, hit: { w: 220, h: 210, dy: -190 }, gives: 'ruby', treasure: true, label: 'Search the bookshelf', act: 1.1 },
      { id: 'parrotUse', type: 'use', floor: 'M', x: 520, standX: 600, hit: { w: 150, h: 200 }, requires: 'cloth', consume: true, act: 0.7,
        label: 'Cover the parrot', needMsg: "I can't get past that parrot without something to cover it...",
        activeIf: g => !g.enemies.find(e => e.type === 'parrot').covered,
        onDone: g => { const p = g.enemies.find(e => e.type === 'parrot'); p.covered = true; p.sus = 0; p.bubble = { text: '...', t: 1.5 }; sfx.hide(); g.say('Shhh... sleepy time, birdie.'); } },
      { id: 'bshelf', type: 'search', floor: 'B', x: 640, hit: { w: 220, h: 150, dy: -40 }, gives: 'coin', treasure: true, label: 'Search the upper bookshelf', act: 1.1 },
      { id: 'chest', type: 'use', sprite: 'chest', floor: 'B', x: 330, scale: 0.55, requires: 'key', consume: true, act: 1.3, label: 'Unlock the chest',
        needMsg: 'Locked tight.',
        onDone: (g, o) => { o.sprite = 'chest_open'; sfx.unlock(); g.collect({ gives: 'crystal', flag: 'crystal', msg: 'The Great Crystal! It\'s glowing... Now let\'s get out of here!' }, o.x, g.fy('B') - 80); } },
      { id: 'exit', type: 'exit', floor: 'B', x: 80, hit: { w: 120, h: 240 }, arrow: 'left', label: 'Escape to the top deck', requiresFlag: 'crystal', needMsg: 'Not without the crystal!' },
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
    objective: g => !g.flags.crystal ? (g.enemies.find(e => e.type === 'parrot').covered ? 'Open the chest on the balcony' : 'Get past the parrot and reach the balcony chest') : 'Escape through the balcony door',
    hint: g => !has(g, 'cloth') && !g.enemies.find(e => e.type === 'parrot').covered ? 'Grab the cloth near the door, then cover the parrot while it faces the other way.'
      : !g.enemies.find(e => e.type === 'parrot').covered ? 'Walk up behind the parrot when it looks left, and cover it.'
      : !g.flags.crystal ? 'Climb the ladder to the balcony and unlock the chest with the key.' : 'Out the door on the top left!',
  },

  // ───────────────────────────── 4 ─────────────────────────────
  {
    id: 'deck', name: 'All Hands on Deck', bg: 'bg_deck',
    intro: "Crystal in hand! The only way home is to steal the whole ship. Release the anchor, then take the helm — but the lookout's lantern sweeps the deck...",
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
      { id: 'lever', type: 'use', sprite: 'lever_up', floor: 'M', x: 290, dy: -10, scale: 0.55, requires: 'knife', act: 1.6, label: 'Release the anchor',
        needMsg: "The anchor lever is lashed tight with rope. I need something sharp.",
        onDone: (g, o) => { o.sprite = 'lever_down'; g.flags.anchor = true; sfx.chain(); g.shake = 14; g.say('The anchor chain rattles loose! Now — to the helm!'); } },
      { id: 'knife', type: 'pickup', sprite: 'knife', floor: 'M', x: 612, dy: -140, scale: 0.26, gives: 'knife', glow: true, label: "A sailor's knife", msg: 'A knife! Sharp enough to cut rope.' },
      { id: 'bA', type: 'hide', sprite: 'barrel', floor: 'M', x: 470, scale: 0.7, label: 'Hide in the barrel' },
      { id: 'mast', type: 'hide', floor: 'M', x: 850, hit: { w: 120, h: 420 }, label: 'Hide behind the mast' },
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
    },
    objective: g => !has(g, 'knife') && !g.flags.anchor ? 'Find something to cut the anchor lashing' : !g.flags.anchor ? 'Release the anchor lever' : 'Take the helm on the quarterdeck!',
    hint: g => !has(g, 'knife') && !g.flags.anchor ? 'There\'s a knife lying on the first cannon. Watch the beam and the deckhand.'
      : !g.flags.anchor ? 'Cut the lashing on the lever at the far left.' : 'Climb to the quarterdeck on the right and take the wheel!',
  },
];

// Level 5 is the sailing finale (sail.js); it shares the map/progress system.
export const FINALE = { id: 'sail', name: 'Race to the Lighthouse' };
export const MAP_NODES = [
  { x: 470, y: 668 }, { x: 745, y: 585 }, { x: 985, y: 545 }, { x: 1165, y: 372 }, { x: 1445, y: 292 },
];
