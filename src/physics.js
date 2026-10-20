// Plain-object kinematic AABB. No three.js, no DOM.

export function aabbOf(pos, radius, halfH) {
  return {
    min: { x: pos.x - radius, y: pos.y - halfH, z: pos.z - radius },
    max: { x: pos.x + radius, y: pos.y + halfH, z: pos.z + radius },
  };
}

export function overlaps(a, b) {
  return a.max.x > b.min.x && a.min.x < b.max.x &&
         a.max.y > b.min.y && a.min.y < b.max.y &&
         a.max.z > b.min.z && a.min.z < b.max.z;
}

function overlapsXZ(a, c, pad) {
  return a.max.x > c.min.x - pad && a.min.x < c.max.x + pad &&
         a.max.z > c.min.z - pad && a.min.z < c.max.z + pad;
}

export function stepBody(body, colliders, dt, opts = {}) {
  const radius = opts.radius ?? 0.36;
  const halfH = opts.halfH ?? 0.55;
  const forgiving = opts.forgiving ?? 0.12;

  const result = { landed: false, impact: 0, blockedX: false, blockedZ: false, ceiling: false };
  if (!Number.isFinite(dt) || dt <= 0) return result;

  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const sub = dt / steps;

  for (let s = 0; s < steps; s++) {
    body.grounded = false;
    const vyBefore = body.vel.y;

    body.pos.y += body.vel.y * sub;
    let box = aabbOf(body.pos, radius, halfH);
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!overlapsXZ(box, c, forgiving)) continue;
      if (body.vel.y <= 0 && box.min.y < c.max.y) {
        body.pos.y = c.max.y + halfH + 0.001;
        if (-vyBefore > result.impact) result.impact = -vyBefore;
        body.vel.y = 0;
        body.grounded = true;
        result.landed = true;
        box = aabbOf(body.pos, radius, halfH);
      } else if (body.vel.y > 0 && box.max.y > c.min.y) {
        body.pos.y = c.min.y - halfH - 0.001;
        body.vel.y = 0;
        result.ceiling = true;
        box = aabbOf(body.pos, radius, halfH);
      }
    }

    body.pos.x += body.vel.x * sub;
    box = aabbOf(body.pos, radius, halfH);
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!overlaps(box, c)) continue;
      if (body.vel.x > 0) body.pos.x = c.min.x - radius;
      else if (body.vel.x < 0) body.pos.x = c.max.x + radius;
      else continue;
      body.vel.x = 0;
      result.blockedX = true;
      box = aabbOf(body.pos, radius, halfH);
    }

    body.pos.z += body.vel.z * sub;
    box = aabbOf(body.pos, radius, halfH);
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!overlaps(box, c)) continue;
      if (body.vel.z > 0) body.pos.z = c.min.z - radius;
      else if (body.vel.z < 0) body.pos.z = c.max.z + radius;
      else continue;
      body.vel.z = 0;
      result.blockedZ = true;
      box = aabbOf(body.pos, radius, halfH);
    }
  }

  return result;
}
