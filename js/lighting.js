import { isWallAtWorld } from "./map.js";

export function castLanternCone(level, originX, originY, angle, fov, maxDist, rayCount = 46) {
  const points = [{ x: originX, y: originY }];
  const startAngle = angle - fov / 2;

  for (let i = 0; i <= rayCount; i++) {
    const a = startAngle + (fov * i) / rayCount;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    let dist = 0;
    const step = 6;
    let hitX = originX + cos * maxDist;
    let hitY = originY + sin * maxDist;

    while (dist < maxDist) {
      dist += step;
      const px = originX + cos * dist;
      const py = originY + sin * dist;
      if (isWallAtWorld(level, px, py, true)) {
        // Binary refine edge
        let lo = dist - step;
        let hi = dist;
        for (let r = 0; r < 4; r++) {
          const mid = (lo + hi) * 0.5;
          if (isWallAtWorld(level, originX + cos * mid, originY + sin * mid, true)) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        hitX = originX + cos * lo;
        hitY = originY + sin * lo;
        break;
      }
    }
    points.push({ x: hitX, y: hitY });
  }
  return points;
}
