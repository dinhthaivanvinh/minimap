// Shared street traffic, daylight-driven headlights, and pedestrian escape routes for both maps.
import type { Rect } from './layout.ts';
import type { Point } from './wander.ts';

export const CAR_SHAPES = ['compact', 'sedan', 'van', 'pickup'] as const;
export const CAR_COLORS = ['#ff8fb3', '#8fc9ff', '#ffe27a', '#9fe89a', '#b7a6ff', '#ffad75'] as const;
export type CarShape = (typeof CAR_SHAPES)[number];
export const MAX_CARS = 3;
export const PAVEMENT_SHARE = 0.3;

export interface Road {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  curb: number;
  middle: number;
  lanes: [number, number];
  carWidth: number;
  carScale: number;
}
export interface Car extends Point {
  id: number;
  direction: 1 | -1;
  shape: CarShape;
  color: string;
  length: number;
  width: number;
  speed: number;
}
export interface Traffic {
  cars: Car[];
  time: number;
  nextSpawn: [number, number];
  nextId: number;
}
export interface Pedestrian extends Point {
  radius: number;
}
export interface TrafficDodge {
  from: Point;
  to: Point;
}

/** Keep the pre-dodge position until the pedestrian has stepped back, even without wandering. */
export function stepTrafficDodge(
  person: Pedestrian,
  dodge: TrafficDodge | null,
  road: Road,
  cars: Car[],
  seconds: number,
): { position: Point; dodge: TrafficDodge | null } | null {
  const from = dodge?.from ?? { x: person.x, z: person.z };
  const escape = trafficEscape({ ...from, radius: person.radius }, road, cars);
  if (!escape && !dodge) return null;
  const position = stepAside(person, escape ?? from, seconds);
  const returning = Math.hypot(position.x - from.x, position.z - from.z) > 0.01;
  return { position, dodge: escape ? { from, to: escape } : returning ? dodge : null };
}

export function streetRoad(rect: Rect, carScale = 1): Road {
  const curb = rect.y + rect.h * PAVEMENT_SHARE;
  const depth = rect.h * (1 - PAVEMENT_SHARE);
  return {
    minX: rect.x,
    maxX: rect.x + rect.w,
    minZ: rect.y,
    maxZ: rect.y + rect.h,
    curb,
    middle: curb + depth / 2,
    // Facing east, right is south (+z); facing west, right is north (-z).
    lanes: [curb + depth * 0.75, curb + depth * 0.25],
    carWidth: Math.min(2.2, depth * 0.22) * carScale,
    carScale,
  };
}

export function headlightLevel(daylight: number): number {
  return Math.max(0, Math.min(1, (0.6 - daylight) / 0.45));
}

export function createTraffic(): Traffic {
  return { cars: [], time: 0, nextSpawn: [0, 6], nextId: 0 };
}

function makeCar(road: Road, lane: number, id: number, random: () => number): Car {
  const shape = CAR_SHAPES[Math.min(CAR_SHAPES.length - 1, Math.floor(random() * CAR_SHAPES.length))]!;
  const color = CAR_COLORS[Math.min(CAR_COLORS.length - 1, Math.floor(random() * CAR_COLORS.length))]!;
  const length = { compact: 5.2, sedan: 6.6, van: 7.2, pickup: 7 }[shape] * road.carScale;
  const direction = lane === 0 ? 1 : -1;
  return {
    id,
    shape,
    color,
    length,
    width: road.carWidth,
    direction,
    // Start nose-first at the entry edge, with the body still outside the street.
    x: direction === 1 ? road.minX - length / 2 : road.maxX + length / 2,
    z: road.lanes[lane]!,
    speed: 4.5 + random() * 2,
  };
}

/** Bounded frame steps avoid a burst of missed spawns after a background tab resumes. */
export function stepTraffic(
  previous: Traffic,
  road: Road,
  seconds: number,
  people: Pedestrian[],
  random = Math.random,
): Traffic {
  const dt = Math.max(0, Math.min(0.1, seconds));
  const time = previous.time + dt;
  const cars = previous.cars.map((car) => ({ ...car }));
  const nextSpawn: [number, number] = [...previous.nextSpawn];
  let nextId = previous.nextId;
  for (const lane of [0, 1]) {
    const direction = lane === 0 ? 1 : -1;
    // Leaders move first, so a following car can use their new position safely.
    const queue = cars.filter((car) => car.direction === direction).sort((a, b) => direction * (b.x - a.x));
    let leader: Car | undefined;
    for (const car of queue) {
      let advance = car.speed * dt;
      if (leader)
        advance = Math.min(advance, direction * (leader.x - car.x) - (leader.length + car.length) / 2 - 2);
      for (const person of people) {
        if (Math.abs(person.z - car.z) > car.width / 2 + person.radius + 0.25) continue;
        const ahead = direction * (person.x - car.x);
        if (ahead < 0) continue;
        // Yield until the pedestrian has finished stepping aside.
        advance = Math.min(advance, ahead - car.length / 2 - person.radius - 1);
      }
      car.x += direction * Math.max(0, advance);
      leader = car;
    }
    if (time >= nextSpawn[lane]!) {
      const entering = makeCar(road, lane, nextId, random);
      const clear =
        queue.every((car) => direction * (car.x - entering.x) > (car.length + entering.length) / 2 + 3) &&
        people.every(
          (person) =>
            Math.abs(person.z - entering.z) > entering.width / 2 + person.radius + 0.25 ||
            Math.abs(person.x - entering.x) > entering.length / 2 + person.radius + 1,
        );
      if (cars.length < MAX_CARS && clear) {
        cars.push(entering);
        nextId++;
        nextSpawn[lane] = time + 10 + random() * 8;
      } else nextSpawn[lane] = time + 1;
    }
  }
  return {
    cars: cars.filter((car) =>
      car.direction === 1 ? car.x - car.length / 2 <= road.maxX + 1 : car.x + car.length / 2 >= road.minX - 1,
    ),
    time,
    nextSpawn,
    nextId,
  };
}

/** A quiet parked pair for reduced motion, with the same shapes, lanes and lights. */
export function parkedTraffic(road: Road): Car[] {
  return [0, 1].map((lane) => ({
    ...makeCar(road, lane, lane, () => (lane ? 0.7 : 0.3)),
    x: road.minX + (road.maxX - road.minX) * (lane ? 0.22 : 0.8),
    speed: 0,
  }));
}

/** Look ahead before a car reaches someone; escape sideways rather than racing it. */
export function trafficEscape(person: Pedestrian, road: Road, cars: Car[]): Point | null {
  const margin = person.radius + 0.5;
  const approaching = cars.some((car) => {
    const ahead = car.x + car.direction * car.speed * 2;
    return (
      person.x >= Math.min(car.x, ahead) - car.length / 2 - margin &&
      person.x <= Math.max(car.x, ahead) + car.length / 2 + margin &&
      Math.abs(person.z - car.z) < car.width / 2 + margin
    );
  });
  if (!approaching) return null;
  // Prefer the nearest safe strip: pavement, lane divider, or bottom verge. A
  // narrow strip is excluded when this person's body would still touch traffic.
  const candidates = [
    Math.max(road.minZ + person.radius, road.curb - person.radius - 0.25),
    road.middle,
    road.maxZ - person.radius,
  ].filter((z) => road.lanes.every((lane) => Math.abs(z - lane) >= road.carWidth / 2 + margin));
  const z = candidates.sort((a, b) => Math.abs(a - person.z) - Math.abs(b - person.z))[0] ?? road.minZ;
  return { x: person.x, z };
}

/** Move gently to an escape point; cars yield if someone needs longer to clear. */
export function stepAside(from: Point, to: Point, seconds: number): Point {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const step = Math.min(1, (Math.max(0, seconds) * 8) / (distance || 1));
  return { x: from.x + (to.x - from.x) * step, z: from.z + (to.z - from.z) * step };
}
