// Dev-only playtest bot: plays each level with timing rules to prove it's beatable.
// Load in the browser console:  const b = await import('/tools/bot.js'); await b.run(0)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const G = () => window.__pp.scene;
const E = id => G().enemies.find(e => e.id === id);
const O = id => G().objects.find(o => o.id === id);
const log = [];
const say = m => { log.push(m); console.log('[bot]', m); };

async function until(fn, what, timeout = 60000) {
  const t0 = performance.now();
  while (!fn()) {
    if (G() && G().over && G().pl.state === 'caught') throw new Error('CAUGHT while waiting for: ' + what);
    if (performance.now() - t0 > timeout) throw new Error('timeout: ' + what);
    await sleep(20);
  }
}
const idle = () => ['idle', 'hide'].includes(G().pl.state) && !G().pl.route.length;

async function use(id) {
  const g = G(), o = O(id);
  const x = o.standX ?? o.x;
  g.goTo({ floor: o.floor, x, obj: o });
  await sleep(40);
  await until(() => idle() || G().over, 'use ' + id);
  if (G().pl.state === 'caught') throw new Error('CAUGHT at ' + id);
  say('used ' + id + (G().pl.state === 'hide' ? ' (hiding)' : ''));
}
async function walk(floor, x) {
  if (G().pl.state === 'hide') G().unhide();
  G().goTo({ floor, x });
  await sleep(40);
  await until(() => idle() || G().over, 'walk ' + floor + x);
}

const PLANS = [
  // 1 harbor
  async () => {
    const w = () => E('watch');
    await until(() => w().x > 1150 && w().face === 1, 'watch far right');
    await use('crates');
    await use('b1');
    await until(() => w().face === 1 && w().mode === 'walk' && w().x > 900 && w().x < 1100, 'watch heading right');
    await use('coin');
    await use('b2');
    await until(() => w().mode === 'walk' && w().face === -1 && w().x < 880, 'watch walked past, heading left');
    await use('hook');
    await use('hull');
    await use('pearl');
    await use('hatch');
  },
  // 2 below deck
  async () => {
    const z1 = () => E('z1'), z2 = () => E('z2'), cook = () => E('cook');
    const atStove = () => cook().mode === 'wait' && cook().pi === 0;
    await until(() => z1().phase === 'sleep' && z1().cycleT < 1.0, 'z1 asleep');
    await use('chest');                         // coin, under the snoring hammock
    await until(() => z1().phase === 'sleep' && z1().cycleT < 1.0 && atStove(), 'z1 asleep & cook stirring');
    await use('ropes');                         // down ladder A → pearl
    await until(() => z1().phase === 'sleep' && z1().cycleT < 1.5 && atStove(), 'z1 asleep again');
    await use('bottle');                        // CLANG — cook comes to look
    await until(() => z1().phase === 'sleep' && cook().x < 1000 && cook().face === -1, 'cook lured & z1 asleep');
    await use('stew');                          // right ladder, behind the cook
    await use('key');
    await use('door');                          // galley ladder straight up to the door
  },
  // 3 cabin
  async () => {
    const cap = () => E('cap'), polly = () => E('polly');
    await use('cloth');
    await use('crown');                         // snatched from under his dozing nose
    await use('desk');
    await until(() => cap().mode === 'walk' && cap().face === -1 && cap().x < 1100, 'captain walking left');
    await use('curtain');
    await until(() => cap().mode === 'walk' && cap().face === 1 && cap().x > 1150, 'captain returning to desk');
    await until(() => cap().mode === 'wait' && cap().pi === 0 && cap().waitT > 4.5, 'captain dozing');
    await until(() => polly().face === -1 && polly().turnT > 2.2, 'parrot looking left');
    await use('parrotUse');
    await use('post');
    await until(() => cap().mode === 'wait' && cap().pi === 0 && cap().waitT > 3.5, 'captain dozing again');
    await use('shelf');
    await use('bshelf');
    await use('chest');
    await use('exit');
  },
  // 4 deck
  async () => {
    const hand = () => E('hand'), beam = () => E('lookout');
    await use('bA');
    await until(() => beam().bx > 850 && beam().dir === 1 && hand().face === 1 && hand().mode === 'walk' && hand().x > 800, 'beam & deckhand away');
    await use('knife');
    await use('lever');
    await use('bA');
    // cross the deck behind the deckhand as he heads right, using the mast as cover from the beam
    await until(() => hand().face === 1 && hand().mode === 'walk' && hand().x > 760 && hand().x < 900 && beam().bx > 700, 'deckhand heading right');
    await use('mast');
    const beamLeftward = () => beam().dir === -1 && beam().bx < 820 && beam().pauseT <= 0;
    await until(() => beamLeftward() && hand().face === -1 && hand().mode === 'walk' && hand().x < 1000, 'beam sweeping left & deckhand heading left');
    await use('crates');
    await use('bB');
    await until(() => beamLeftward() && hand().face === -1 && hand().mode === 'walk' && hand().x < 1000, 'next safe window');
    await use('cannon');
    await use('coin');
    await use('helm');
  },
];

export async function run(i, speed = 3) {
  log.length = 0;
  window.__pp.speed = speed;
  await window.__pp.startLevel(i);
  await sleep(900);
  try {
    await PLANS[i]();
    await until(() => G().over, 'level end', 20000);
    const g = G();
    return { ok: true, found: g.found, seen: g.seen, log: [...log] };
  } catch (e) {
    return { ok: false, err: e.message, pl: G() && { x: Math.round(G().pl.x), floor: G().pl.floor, st: G().pl.state }, log: [...log] };
  } finally { window.__pp.speed = 1; }
}
