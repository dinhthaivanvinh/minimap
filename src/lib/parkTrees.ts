// Stable random scenery shared by the two maps; foliage stays behind the park activities.
import { parkActivities, type Rect } from './layout.ts';
export function parkTrees(park: Rect) {
  let seed = 731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const count = 3;
  const trees = Array.from({ length: count }, (_, i) => {
    const size = Math.min(7, (park.w / count) * 0.85) * (0.82 + random() * 0.18);
    const x = park.x + ((i + 0.25 + random() * 0.5) / count) * park.w;
    return {
      x: Math.max(park.x + size / 2, Math.min(park.x + park.w - size / 2, x)),
      y: park.y + park.h * (0.18 + random() * 0.16),
      size,
    };
  });
  const activities = parkActivities({ park })!;
  const gaps = [
    [activities.board.x + activities.board.w, activities.arcade.x],
    [activities.arcade.x + activities.arcade.w, activities.picker.x],
  ];
  for (const [left, right] of gaps) {
    const gap = right! - left!;
    if (gap < 4) continue;
    const size = Math.min(6, gap * 0.7, park.h * 0.4);
    trees.push({ x: (left! + right!) / 2, y: park.y + park.h * (0.72 + random() * 0.16), size });
    break;
  }
  return trees;
}
