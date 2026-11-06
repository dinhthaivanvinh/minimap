// FIBA half-court dimensions, in metres. Both renderers use these same markings.
export const COURT = {
  halfWidth: 7.5,
  baseline: -6.535,
  halfLength: 14,
  hoopZ: -4.96,
  laneHalfWidth: 2.45,
  freeThrowDistance: 5.8,
  freeThrowRadius: 1.8,
  threeRadius: 6.75,
  cornerX: 6.6,
} as const;
export interface FloorPoint { x: number; z: number }
export interface CourtMark { points: FloorPoint[]; dashed?: boolean }
export const FREE_THROW_Z = COURT.baseline + COURT.freeThrowDistance;
export const HALF_COURT_Z = COURT.baseline + COURT.halfLength;
function arc(radius: number, z: number, start: number, end: number): FloorPoint[] {
  return Array.from({ length: 97 }, (_, i) => {
    const angle = start + (end - start) * i / 96;
    return { x: Math.cos(angle) * radius, z: z + Math.sin(angle) * radius };
  });
}
export function courtMarkings(): CourtMark[] {
  const { halfWidth: w, baseline: back, laneHalfWidth: lane, hoopZ, threeRadius, cornerX } = COURT;
  const cornerAngle = Math.acos(cornerX / threeRadius);
  const cornerZ = hoopZ + Math.sin(cornerAngle) * threeRadius;
  const line = (...points: [number, number][]): CourtMark => ({ points: points.map(([x, z]) => ({ x, z })) });
  return [
    line([-w,back],[w,back],[w,HALF_COURT_Z],[-w,HALF_COURT_Z],[-w,back]),
    line([-lane,back],[-lane,FREE_THROW_Z],[lane,FREE_THROW_Z],[lane,back]),
    { points: arc(COURT.freeThrowRadius, FREE_THROW_Z, 0, Math.PI) },
    { points: arc(COURT.freeThrowRadius, FREE_THROW_Z, Math.PI, Math.PI * 2), dashed: true },
    line([-cornerX,back],[-cornerX,cornerZ]),
    line([cornerX,back],[cornerX,cornerZ]),
    { points: arc(threeRadius,hoopZ,cornerAngle,Math.PI-cornerAngle) },
    { points: arc(COURT.freeThrowRadius,HALF_COURT_Z,Math.PI,Math.PI*2) },
    ...[1.75,2.6,3.5,4.35].flatMap(distance => [-1,1].map(side => line([side*lane,back+distance],[side*(lane+.22),back+distance]))),
  ];
}
// A perspective projection of that same floor for the illustrated arena.
export function projectFloor({ x, z }: FloorPoint): { x: number; y: number } {
  const depth = (z - COURT.baseline) / COURT.halfLength;
  const scale = 26 + depth * 28;
  return { x: 320 + x * scale, y: 282 + depth * 248 };
}
export function floorPath(points: FloorPoint[]): string {
  return points.map((p,i) => { const v = projectFloor(p); return `${i ? 'L' : 'M'}${v.x.toFixed(2)},${v.y.toFixed(2)}`; }).join(' ');
}
