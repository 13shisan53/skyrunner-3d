import { connect } from './cdp.mjs';
const c = await connect(9333);
console.log(await c.evaluate(`(() => {
  const over = document.getElementById('over');
  const panel = over.querySelector('.panel');
  const hud = document.getElementById('hud');
  const menu = document.getElementById('menu');
  const cs = getComputedStyle(over);
  const ps = getComputedStyle(panel);
  return {
    overClass: over.className, overDisplay: cs.display, overOpacity: cs.opacity,
    overRect: [over.getBoundingClientRect().x, over.getBoundingClientRect().y, over.getBoundingClientRect().width, over.getBoundingClientRect().height],
    panelRect: [panel.getBoundingClientRect().x, panel.getBoundingClientRect().y, panel.getBoundingClientRect().width, panel.getBoundingClientRect().height],
    panelBg: ps.background, panelDisplay: ps.display, panelOpacity: ps.opacity,
    hudClass: hud.className, menuClass: menu.className,
    mode: __skyrunner.state.mode,
  };
})()`));
c.close();
