import { connect } from './cdp.mjs';
const c = await connect(9333);
console.log(await c.evaluate(`document.elementsFromPoint(640,360).map(e => e.id || e.className || e.tagName).slice(0, 10)`));
console.log(await c.evaluate(`(() => {
  const el = document.getElementById('game');
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { rect: [r.x, r.y, r.width, r.height], opacity: s.opacity, filter: s.filter, clip: s.clipPath, transform: s.transform, z: s.zIndex };
})()`));
console.log(await c.evaluate(`({ alpha: __skyrunner.renderer.getContextAttributes().alpha, premultiplied: __skyrunner.renderer.getContextAttributes().premultipliedAlpha, tone: __skyrunner.renderer.toneMapping, cs: __skyrunner.renderer.outputColorSpace })`));
c.close();
