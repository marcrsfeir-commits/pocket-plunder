// Dev-only playtest bot: plays each level with timing rules to prove it's beatable.
// Drives the simulation itself via __pp.tick, so it's fast and works even when the tab is hidden.
//   const b = await import('/tools/bot.js'); await b.run('harbor')
const G = () => window.__pp.scene;
const E = id => G().enemy(id);
const O = id => G().obj(id);
const log = [];
const say = m => log.push(m);
const yieldNow = () => new Promise(r => setTimeout(r, 0));

async function until(fn, what, simSeconds = 120) {
  let frames = 0;
  while (!fn()) {
    if (G() && G().over && G().pl.state === 'caught') throw new Error('CAUGHT while waiting for: ' + what);
    if (frames > simSeconds * 60) throw new Error('timeout: ' + what);
    window.__pp.tick(4); frames += 4;
    if (frames % 240 === 0) await yieldNow();
  }
}
const idle = () => ['idle', 'hide'].includes(G().pl.state) && !G().pl.route.length;

async function use(id) {
  const g = G(), o = O(id);
  if (!o) throw new Error('no object ' + id);
  g.goTo({ floor: o.floor, x: o.standX ?? o.x, obj: o });
  window.__pp.tick(2);
  await until(() => idle() || G().over, 'use ' + id);
  if (G().pl.state === 'caught') throw new Error('CAUGHT at ' + id);
  say(id + (G().pl.state === 'hide' ? '(hid)' : ''));
}
async function walk(floor, x) {
  G().goTo({ floor, x });
  window.__pp.tick(2);
  await until(() => idle() || G().over, 'walk ' + floor + x);
}

const PLANS = {
  harbor: async () => {
    const w = () => E('watch');
    await until(() => w().x > 1150 && w().face === 1, 'watch far right');
    await use('crates');
    await use('b1');
    await until(() => w().face === 1 && w().mode === 'walk' && w().x > 900 && w().x < 1100, 'watch heading right');
    await use('coin');
    await use('b2');
    await until(() => w().mode === 'walk' && w().face === -1 && w().x < 880, 'watch walked past, heading left');
    await use('hook');
    await use('kitten');
    await use('hull');
    await use('pearl');
    await use('hatch');
  },
  below: async () => {
    const z1 = () => E('z1'), cook = () => E('cook');
    const atStove = () => cook().mode === 'wait' && cook().pi === 0;
    await until(() => z1().phase === 'sleep' && z1().cycleT < 1.0, 'z1 asleep');
    await use('chest');
    await until(() => z1().phase === 'sleep' && z1().cycleT < 1.0 && atStove(), 'z1 asleep & cook stirring');
    await use('ropes');
    await until(() => z1().phase === 'sleep' && z1().cycleT < 1.5 && atStove(), 'z1 asleep again');
    await use('bottle');
    await until(() => z1().phase === 'sleep' && cook().x < 1000 && cook().face === -1, 'cook lured & z1 asleep');
    await use('stew');
    await use('key');
    await use('kitten');
    await use('door');
  },
  hold: async () => {
    const bos = () => E('bosun'), hawk = () => E('hawk');
    await use('lamp1');
    await use('ropecoil');
    await use('bL1');
    await until(() => bos().face === -1 && bos().x < 440, 'bosun passed heading left');
    await use('chains');
    await use('bL2');
    await until(() => bos().face === 1 && bos().x > 1350, 'bosun passed heading right');
    await use('lever');
    await use('kitten');
    await use('lamp2');
    await use('bWa');
    await until(() => hawk().mode === 'wait' && hawk().x < 960 && !hawk().looked && hawk().face === -1, 'first mate at the far left, facing away');
    await use('coin');
    await use('chart');
    await use('hatch');
  },
  brig: async () => {
    const dog = () => E('brutus'), jail = () => E('jailer');
    await use('coin');
    await use('ham');
    await until(() => dog().x > 900 && dog().face === 1 && dog().mode === 'walk', 'Brutus far right');
    await use('bowl');
    await until(() => dog().mode === 'eat', 'Brutus eating');
    await until(() => jail().mode === 'wait' && jail().pi === 0 && jail().waitT > 5.5, 'jailer dozing at table');
    await use('keys');
    await use('tankard');
    await use('cell2');
    await use('bM2');
    await until(() => jail().x < 1000 && jail().face === -1 && jail().mode === 'walk', 'jailer heading back to his table');
    await use('cell1');
    await use('kitten');
    await until(() => dog().mode === 'eat' || Math.abs(dog().x - 995) > 500, 'Brutus away from basket');
    await use('basket');
    await use('bM1');
    const jailSafe = () => jail().mode === 'wait' && jail().pi === 0 && jail().waitT > 4 || jail().mode === 'walk' && jail().face === 1 && jail().x > 1250;
    await until(() => jailSafe() && (dog().mode === 'eat' || dog().x > 1240 && dog().face === 1), 'jailer dozing/away & Brutus not by the exit');
    await use('exit');
  },
  cabin: async () => {
    const cap = () => E('cap'), polly = () => E('polly');
    await use('cloth');
    await use('crown');
    await use('desk');
    await until(() => cap().mode === 'walk' && cap().face === -1 && cap().x < 1100, 'captain walking left');
    await use('curtain');
    await until(() => cap().mode === 'walk' && cap().face === 1 && cap().x > 1150, 'captain returning to desk');
    await until(() => cap().mode === 'wait' && cap().pi === 0 && cap().waitT > 4.5, 'captain dozing');
    await until(() => polly().face === -1 && polly().turnT > 2.2, 'parrot looking left');
    await use('parrotUse');
    await use('rum');
    await until(() => cap().mode === 'wait' && cap().pi === 0 && cap().waitT > 5, 'captain dozing again');
    await use('kitten');
    await use('shelf');
    await use('bshelf');
    await use('chest');
    await use('exit');
  },
  rigging: async () => {
    const hawk = () => E('hawk'), beam = () => E('lantern');
    const beamFar = x => Math.abs(beam().bx - x) > 420;
    await until(() => beamFar(400) && beam().dir === 1, 'beam sweeping away');
    await use('knotA');
    await use('mast1');
    // knot C on the upper yard, right behind Hawk as he walks away to the right
    await until(() => hawk().mode === 'walk' && hawk().face === 1 && hawk().x > 780 && hawk().x < 950, 'Hawk walking right');
    await use('knotC');
    await use('mast1');
    // crow's nest + pearl while Hawk walks left
    await until(() => hawk().mode === 'walk' && hawk().face === -1 && hawk().x < 1010 && hawk().x > 900 && beamFar(1270), 'Hawk walking left');
    await use('nest');
    await use('kitten');
    await until(() => hawk().mode === 'walk' && hawk().face === -1 && hawk().x < 1010 && hawk().x > 900, 'Hawk walking left again');
    await use('pearl');
    await until(() => hawk().face === -1 && hawk().x < 1100 && beamFar(1270), 'safe to climb down');
    await use('mast1');
    await until(() => beam().dir === -1 && beam().bx < 620 && beam().pauseT <= 0, 'beam well past the mast, heading left');
    await use('knotB');
    await use('coin');
    await use('slide');
  },
  deck: async () => {
    const hand = () => E('hand'), beam = () => E('lookout');
    await use('kitten');
    await use('bA');
    await until(() => beam().bx > 850 && beam().dir === 1 && hand().face === 1 && hand().mode === 'walk' && hand().x > 800, 'beam & deckhand away');
    await use('knife');
    await use('lever');
    await use('bA');
    await until(() => hand().face === 1 && hand().mode === 'walk' && hand().x > 760 && hand().x < 900 && beam().bx > 700, 'deckhand heading right');
    await use('mast');
    const beamLeftward = () => beam().dir === -1 && beam().bx < 820 && beam().pauseT <= 0;
    await until(() => beamLeftward() && hand().face === -1 && hand().mode === 'walk' && hand().x < 780, 'beam sweeping left & deckhand past the mast');
    await use('crates');
    await use('bB');
    await until(() => beamLeftward() && hand().face === -1 && hand().mode === 'walk' && hand().x < 1000, 'next safe window');
    await use('cannon');
    await use('coin');
    await use('helm');
  },
};

export async function run(id) {
  log.length = 0;
  const i = window.__pp.ALL.findIndex(l => l.id === id);
  window.__pp.startLevel(i);
  window.__pp.tick(60);
  try {
    await PLANS[id]();
    await until(() => G().over, 'level end', 10);
    const g = G();
    return { id, ok: g.pl.state === 'cheer', found: g.found.length, kitten: g.kitten, seen: g.seen, time: Math.round(g.t), log: log.join(' ') };
  } catch (e) {
    const g = G();
    return { id, ok: false, err: e.message, pl: g && { x: Math.round(g.pl.x), floor: g.pl.floor, st: g.pl.state }, log: log.join(' '),
      en: g && g.enemies.map(en => `${en.id}@${Math.round(en.bx ?? en.x)} ${en.mode} f${en.face} s${en.sus.toFixed(1)}`).join(' | ') };
  }
}
