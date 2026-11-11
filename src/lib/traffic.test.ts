// Traffic tests cover lane direction, bounded spawns, yielding, escape clearance, and daylight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from './layout.ts';
import type { TeamUser } from '../../shared/types.ts';
import {
  CAR_COLORS,
  CAR_SHAPES,
  createTraffic,
  headlightLevel,
  parkedTraffic,
  stepAside,
  stepTraffic,
  stepTrafficDodge,
  streetRoad,
  trafficEscape,
  type Car,
} from './traffic.ts';

const rect = { x: 2, y: 30, w: 96, h: 12 };
const road = streetRoad(rect);
function seeded() {
  let n = 49;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 2 ** 32;
  };
}
const carAt = (x: number, direction: 1 | -1 = 1): Car => ({
  id: 0,
  shape: 'sedan',
  color: CAR_COLORS[0],
  length: 6.6,
  width: road.carWidth,
  direction,
  speed: 6,
  x,
  z: road.lanes[direction === 1 ? 0 : 1],
});

test('right-side lanes put eastbound cars south and westbound cars north of the divider', () => {
  assert.ok(road.lanes[0] > road.middle);
  assert.ok(road.lanes[1] < road.middle);
  for (const car of parkedTraffic(road)) {
    assert.equal(car.z, road.lanes[car.direction === 1 ? 0 : 1]);
    assert.ok(car.z - car.width / 2 > road.curb);
    assert.ok(car.z + car.width / 2 < road.maxZ);
  }
});

test('wider 3D footprints keep front-to-back length unchanged', () => {
  const wider = { ...road, carWidth: road.carWidth * 1.5 };
  const normal = parkedTraffic(road);
  parkedTraffic(wider).forEach((car, index) => {
    assert.equal(car.length, normal[index]!.length);
    assert.equal(car.width, normal[index]!.width * 1.5);
    assert.equal(car.x, normal[index]!.x);
    assert.equal(car.z, normal[index]!.z);
  });
});

test('an idle pedestrian returns to their pre-dodge position once traffic clears', () => {
  const home = { x: 40, z: road.lanes[0], radius: 1.5 };
  let person = { ...home };
  let dodge: import('./traffic.ts').TrafficDodge | null = null;
  for (let i = 0; i < 30; i++) {
    const result: NonNullable<ReturnType<typeof stepTrafficDodge>> = stepTrafficDodge(
      person,
      dodge,
      road,
      [carAt(30)],
      0.05,
    )!;
    dodge = result.dodge;
    person = { ...result.position, radius: home.radius };
  }
  assert.notEqual(person.z, home.z);
  for (let i = 0; i < 40; i++) {
    const result: ReturnType<typeof stepTrafficDodge> = stepTrafficDodge(person, dodge, road, [], 0.05);
    if (!result) break;
    dodge = result.dodge;
    person = { ...result.position, radius: home.radius };
  }
  assert.deepEqual(person, home);
  assert.equal(dodge, null);
  assert.equal(stepTrafficDodge(person, dodge, road, [], 0.05), null);
});

test('new traffic interrupts the return step without losing the original position', () => {
  const home = { x: 40, z: road.lanes[0], radius: 1.5 };
  const away = stepTrafficDodge(home, null, road, [carAt(30)], 0.1)!;
  const returning = stepTrafficDodge({ ...away.position, radius: home.radius }, away.dodge, road, [], 0.01)!;
  const interrupted = stepTrafficDodge(
    { ...returning.position, radius: home.radius },
    returning.dodge,
    road,
    [carAt(29)],
    0.1,
  )!;
  assert.deepEqual(interrupted.dodge!.from, { x: home.x, z: home.z });
  assert.ok(Math.abs(interrupted.position.z - home.z) > Math.abs(returning.position.z - home.z));
});

test('larger 2D cars keep their lane positions and scale their traffic footprints', () => {
  const larger = streetRoad(rect, 1.5);
  assert.deepEqual(larger.lanes, road.lanes);
  const normal = parkedTraffic(road);
  const cars = parkedTraffic(larger);
  cars.forEach((car, index) => {
    assert.equal(car.length, normal[index]!.length * 1.5);
    assert.equal(car.width, normal[index]!.width * 1.5);
    assert.ok(car.z - car.width / 2 > larger.curb);
    assert.ok(car.z + car.width / 2 < larger.maxZ);
    const escape = trafficEscape({ x: car.x, z: car.z, radius: 1.5 }, larger, [car])!;
    assert.ok(larger.lanes.every((lane) => Math.abs(escape.z - lane) >= car.width / 2 + 2));
  });
});

test('random traffic stays capped, spaced, varied and removes cars after they leave', () => {
  const random = seeded();
  let traffic = createTraffic();
  const seen = new Set<number>();
  const combinations = new Set<string>();
  let departed = false;
  for (let frame = 0; frame < 2400; frame++) {
    const previous = structuredClone(traffic);
    const next = stepTraffic(traffic, road, 0.1, [], random);
    assert.deepEqual(traffic, previous, 'the previous snapshot stays intact');
    departed ||= traffic.cars.some((car) => !next.cars.some((other) => other.id === car.id));
    traffic = next;
    assert.ok(traffic.cars.length <= 3, 'at most three cars share the street');
    for (const car of traffic.cars) {
      seen.add(car.id);
      combinations.add(`${car.shape}:${car.color}`);
      assert.ok(CAR_SHAPES.includes(car.shape));
      assert.ok((CAR_COLORS as readonly string[]).includes(car.color));
      assert.equal(car.z, road.lanes[car.direction === 1 ? 0 : 1]);
      const before = previous.cars.find((other) => other.id === car.id);
      if (before) assert.ok(car.direction * (car.x - before.x) >= 0);
      for (const other of traffic.cars)
        if (other.id !== car.id && other.direction === car.direction)
          assert.ok(Math.abs(other.x - car.x) >= (car.length + other.length) / 2 + 2 - 1e-6);
    }
  }
  assert.ok(seen.size > 20 && seen.size < 45, 'traffic keeps flowing at a quieter pace');
  assert.ok(combinations.size > 10);
  assert.ok(departed);
});

test('cars enter nose-first at the street edges for both renderer sizes and road bounds', () => {
  for (const bounds of [rect, { x: -54, y: 0, w: 108, h: 12 }]) {
    for (const scale of [1, 1.5])
      for (const roll of [0, 0.3, 0.6, 0.9]) {
        const r = streetRoad(bounds, scale);
        const traffic = stepTraffic({ ...createTraffic(), nextSpawn: [0, 0] }, r, 0.1, [], () => roll);
        assert.equal(traffic.cars.length, 2);
        for (const car of traffic.cars) {
          const nose = car.x + (car.direction * car.length) / 2;
          assert.ok(Math.abs(nose - (car.direction === 1 ? r.minX : r.maxX)) < 1e-8);
          assert.ok(car.direction === 1 ? car.x < r.minX : car.x > r.maxX);
        }
      }
  }
});

test('quieter traffic staggers the first arrivals and leaves 10–18 seconds between lane spawns', () => {
  for (const roll of [0, 0.99]) {
    let traffic = createTraffic();
    for (let i = 0; i < 59; i++) traffic = stepTraffic(traffic, road, 0.1, [], () => roll);
    assert.equal(traffic.nextId, 1, 'the opposing lane waits six seconds');
    assert.ok(traffic.nextSpawn[0] >= 10 && traffic.nextSpawn[0] < 18.2);
    for (let i = 0; i < 3; i++) traffic = stepTraffic(traffic, road, 0.1, [], () => roll);
    assert.equal(traffic.nextId, 2);
    assert.ok(traffic.nextSpawn[1] - traffic.time >= 9.8 && traffic.nextSpawn[1] - traffic.time < 18);
  }
});

test('entry waits for a pedestrian at the edge instead of spawning through their body', () => {
  const person = { x: road.minX + 0.5, z: road.lanes[0], radius: 1.5 };
  let traffic = stepTraffic(createTraffic(), road, 0.1, [person], seeded());
  assert.equal(traffic.cars.length, 0);
  for (let i = 0; i < 15; i++) traffic = stepTraffic(traffic, road, 0.1, [], seeded());
  assert.equal(traffic.cars.length, 1);
});

test('cars yield to a slow pedestrian, queue safely, and resume once the lane is clear', () => {
  const person = { x: 40, z: road.lanes[0], radius: 1.8 };
  let traffic = { ...createTraffic(), cars: [carAt(22), { ...carAt(8), id: 1 }], nextId: 2 };
  for (let i = 0; i < 300; i++) {
    traffic = stepTraffic(traffic, road, 0.1, [person], seeded());
    for (const car of traffic.cars.filter((car) => car.direction === 1))
      assert.ok(car.x + car.length / 2 <= person.x - person.radius - 1 + 1e-6);
  }
  const stopped = traffic.cars.find((car) => car.id === 0)!;
  const resumed = stepTraffic(traffic, road, 0.1, [], seeded()).cars.find((car) => car.id === 0)!;
  assert.ok(resumed.x > stopped.x);
});

test('pedestrians react ahead of approaching cars and do not dodge distant traffic', () => {
  const car = carAt(20);
  const person = { x: 34, z: car.z, radius: 1.5 };
  const escape = trafficEscape(person, road, [car]);
  assert.ok(escape);
  assert.equal(escape.x, person.x);
  assert.ok(road.lanes.every((lane) => Math.abs(escape.z - lane) >= road.carWidth / 2 + person.radius + 0.5));
  assert.equal(trafficEscape({ ...person, x: 80 }, road, [car]), null);
  assert.equal(trafficEscape({ ...person, x: 3 }, road, [car]), null);
  const west = carAt(70, -1);
  assert.ok(trafficEscape({ x: 57, z: west.z, radius: 1 }, road, [west]));
});

test('sidestepping pedestrians and yielding cars clear each other in both lanes', () => {
  for (const direction of [1, -1] as const) {
    let traffic = {
      ...createTraffic(),
      cars: [carAt(direction === 1 ? 18 : 65, direction)],
      nextSpawn: [999, 999] as [number, number],
    };
    const start = { x: direction === 1 ? 34 : 49, z: road.lanes[direction === 1 ? 0 : 1], radius: 1.8 };
    let person = { ...start };
    let dodged = false;
    let passed = false;
    for (let i = 0; i < 250; i++) {
      const escape = trafficEscape(start, road, traffic.cars);
      if (escape) {
        person = { ...stepAside(person, escape, 0.05), radius: start.radius };
        dodged = true;
      }
      traffic = stepTraffic(traffic, road, 0.05, [person]);
      for (const car of traffic.cars) {
        assert.ok(
          Math.abs(car.x - person.x) >= car.length / 2 + person.radius ||
            Math.abs(car.z - person.z) >= car.width / 2 + person.radius,
        );
        passed ||= direction * (car.x - person.x) > car.length;
      }
    }
    assert.ok(dodged);
    assert.ok(passed);
  }
});

test('escape strips fit small, crowded and portrait layouts', () => {
  for (const portrait of [false, true])
    for (const count of [1, 12, 80]) {
      const users = Array.from({ length: count }, (_, i): TeamUser => ({
        username: `member${i}`,
        nickname: 'Member',
        place: 'out',
        status: '',
        claimed: false,
        look: null,
        updatedAt: null,
      }));
      const layout = computeLayout([], users, { portrait });
      const zone = layout.zones.find((zone) => zone.kind === 'street')!;
      for (const widthScale of [1, 1.5]) {
        const base = streetRoad(zone);
        const r = { ...base, carWidth: base.carWidth * widthScale };
        for (const seat of layout.seats.values()) {
          const radius = 1.35 * Math.max(0.9, Math.min(seat.cell / 7, 1.5));
          for (const lane of r.lanes) {
            const car = { ...carAt(seat.x), z: lane, width: r.carWidth };
            const escape = trafficEscape({ x: seat.x, z: lane, radius }, r, [car])!;
            assert.ok(escape.z >= r.minZ && escape.z <= r.maxZ);
            assert.ok(r.lanes.every((z) => Math.abs(escape.z - z) >= r.carWidth / 2 + radius + 0.5));
          }
        }
      }
    }
});

test('background pauses cannot create catch-up traffic and static traffic never moves', () => {
  const next = stepTraffic(createTraffic(), road, 3600, [], seeded());
  assert.equal(next.time, 0.1);
  assert.equal(next.cars.length, 1);
  assert.deepEqual(parkedTraffic(road), parkedTraffic(road));
  assert.ok(parkedTraffic(road).every((car) => car.speed === 0));
  assert.deepEqual(stepAside({ x: 2, z: 2 }, { x: 2, z: 2 }, 0.1), { x: 2, z: 2 });
});

test('a crowded street keeps pedestrian bodies clear while traffic continues to leave', () => {
  const users = Array.from({ length: 80 }, (_, i): TeamUser => ({
    username: `member${i}`,
    nickname: 'Member',
    place: 'out',
    status: '',
    claimed: false,
    look: null,
    updatedAt: null,
  }));
  const layout = computeLayout([], users);
  for (const carScale of [1, 1.5]) {
    const r = streetRoad(
      layout.zones.find((zone) => zone.kind === 'street')!,
      carScale,
    );
    const homes = [...layout.seats.values()].map((seat) => ({
      x: seat.x,
      z: seat.y,
      radius: Math.min(1.5, seat.cell * 0.16),
    }));
    let people = structuredClone(homes);
    let traffic = createTraffic();
    const random = seeded();
    let departed = false;
    for (let frame = 0; frame < 1200; frame++) {
      people = people.map((person, index) => ({
        ...stepAside(person, trafficEscape(homes[index]!, r, traffic.cars) ?? homes[index]!, 0.05),
        radius: person.radius,
      }));
      const next = stepTraffic(traffic, r, 0.05, people, random);
      departed ||= traffic.cars.some((car) => !next.cars.some((other) => other.id === car.id));
      traffic = next;
      for (const car of traffic.cars)
        for (const person of people)
          assert.ok(
            Math.abs(car.x - person.x) >= car.length / 2 + person.radius - 1e-6 ||
              Math.abs(car.z - person.z) >= car.width / 2 + person.radius - 1e-6,
          );
    }
    assert.ok(departed, 'pedestrian avoidance must not gridlock the street');
  }
});

test('headlights are off in daylight and fade on at dusk until fully lit at night', () => {
  assert.equal(headlightLevel(1), 0);
  assert.equal(headlightLevel(0.6), 0);
  assert.ok(headlightLevel(0.4) > 0 && headlightLevel(0.4) < 1);
  assert.ok(headlightLevel(0.2) > headlightLevel(0.4));
  assert.equal(headlightLevel(0), 1);
});
