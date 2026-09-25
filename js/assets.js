// Image preloader. Every sprite is addressed by its file stem (e.g. "pip_idle").
const NAMES = [
  'bg_harbor.jpg', 'bg_below.jpg', 'bg_cabin.jpg', 'bg_deck.jpg', 'bg_sea.jpg', 'map.jpg', 'logo.png',
  'pip_idle', 'pip_walk1', 'pip_walk2', 'pip_sneak', 'pip_climb', 'pip_cheer',
  'deckhand_idle', 'deckhand_walk1', 'deckhand_walk2', 'deckhand_alert', 'deckhand_yawn',
  'cook_idle', 'cook_walk1', 'cook_walk2', 'cook_alert', 'cook_stir',
  'captain_idle', 'captain_walk1', 'captain_walk2', 'captain_alert', 'captain_sleep',
  'barrel', 'crates', 'ladder', 'hammock_sleep', 'hammock', 'chest', 'chest_open', 'lever_up', 'lever_down',
  'bell', 'cage', 'parrot',
  'key', 'crystal', 'coin', 'ruby', 'pearl', 'bottle', 'cloth', 'hook', 'knife', 'crown', 'map_item', 'lantern',
  'ship', 'rowboat', 'cannonball', 'rock', 'lighthouse_dark', 'lighthouse_lit',
];

export const IMG = {};

export function loadAll(onProgress) {
  let done = 0;
  return Promise.all(NAMES.map(n => new Promise(res => {
    const file = n.includes('.') ? n : n + '.png';
    const key = n.replace(/\.(png|jpg)$/, '');
    const im = new Image();
    im.onload = im.onerror = () => { IMG[key] = im; done++; onProgress && onProgress(done / NAMES.length); res(); };
    im.src = 'assets/img/' + file;
  })));
}

/** Draw a sprite anchored at its bottom-centre. */
export function drawSprite(ctx, name, x, y, scale = 1, flip = false, alpha = 1, sx = 1, sy = 1, rot = 0) {
  const im = IMG[name];
  if (!im || !im.width) return;
  const w = im.width * scale, h = im.height * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale((flip ? -1 : 1) * sx, sy);
  ctx.drawImage(im, -w / 2, -h, w, h);
  ctx.restore();
}

export function spriteSize(name, scale = 1) {
  const im = IMG[name];
  return im ? { w: im.width * scale, h: im.height * scale } : { w: 0, h: 0 };
}
