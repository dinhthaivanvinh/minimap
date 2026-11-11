// Lightweight street cars and pedestrian sidesteps; one frame loop never re-renders the whole map.
import { useEffect, useRef, type RefObject } from 'react';
import type { Rect } from '../lib/layout.ts';
import {
  createTraffic,
  headlightLevel,
  parkedTraffic,
  stepAside,
  stepTraffic,
  streetRoad,
  trafficEscape,
  type Car,
} from '../lib/traffic.ts';
import type { Point } from '../lib/wander.ts';

function carArt(car: Car): string {
  const lightId = `traffic-light-${car.id}`;
  const tall = car.shape === 'van';
  const pickup = car.shape === 'pickup';
  const compact = car.shape === 'compact';
  const roof = pickup
    ? 'M42 24 49 9h20l9 15Z'
    : compact
      ? 'M20 24 29 11h28l13 13Z'
      : `M16 24 24 ${tall ? 3 : 10}h38l12 ${tall ? 21 : 14}Z`;
  return `<svg viewBox="0 -4 150 62" width="100%" height="100%" preserveAspectRatio="none" overflow="visible">
    <defs>
      <radialGradient id="${lightId}-front"><stop stop-color="#fff4c8" stop-opacity=".95"/><stop offset=".3" stop-color="#ffe27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/></radialGradient>
      <radialGradient id="${lightId}-rear"><stop stop-color="#ffb0a7" stop-opacity=".9"/><stop offset=".25" stop-color="#ff657c" stop-opacity=".6"/><stop offset="1" stop-color="#ff657c" stop-opacity="0"/></radialGradient>
      <linearGradient id="${lightId}-beam"><stop stop-color="#fff0b5" stop-opacity=".5"/><stop offset=".55" stop-color="#ffeab1" stop-opacity=".2"/><stop offset="1" stop-color="#ffeab1" stop-opacity="0"/></linearGradient>
      <filter id="${lightId}-soft" x="-25%" y="-50%" width="150%" height="200%"><feGaussianBlur stdDeviation="1.5"/></filter>
    </defs>
    <g class="headlights car-lights" fill="url(#${lightId}-beam)" filter="url(#${lightId}-soft)"><path d="M82 23 143 8v39L82 31Z"/><path d="M82 27 131 17v24L82 35Z" opacity=".45"/></g>
    <g stroke="#2a2657" stroke-width="3" stroke-linejoin="round">
      <path d="${roof}" fill="${car.color}"/>
      <path d="${pickup ? 'M51 12h15l7 12H46Z' : tall ? 'M28 7h30l8 17H20Z' : 'M31 13h23l12 11H25Z'}" fill="#dfefff"/>
      <path d="M5 24h74q7 0 7 7v10H4V31q0-7 1-7Z" fill="${car.color}"/>
      ${pickup ? '<path d="M9 25h27v8H9Z" fill="#2a2657" opacity=".3"/>' : ''}
      <path d="M47 13v11" fill="none"/>
      <circle cx="22" cy="41" r="8" fill="#2a2657"/><circle cx="67" cy="41" r="8" fill="#2a2657"/>
      <circle cx="22" cy="41" r="3" fill="#dfe3ff"/><circle cx="67" cy="41" r="3" fill="#dfe3ff"/>
      <path d="M81 28v7" stroke="#ffeab1" stroke-width="5"/><path d="M6 29v6" stroke="#ff657c"/>
    </g>
    <g class="car-lights">
      <ellipse cx="83" cy="31" rx="17" ry="19" fill="url(#${lightId}-front)"/>
      <ellipse cx="5" cy="32" rx="12" ry="15" fill="url(#${lightId}-rear)"/>
    </g></svg>`;
}

interface Props {
  street: Rect;
  scale: number;
  plan: RefObject<HTMLDivElement | null>;
  daylight: number;
  reduced: boolean;
}

export function Traffic2D({ street, scale, plan, daylight, reduced }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const lights = useRef(headlightLevel(daylight));
  lights.current = headlightLevel(daylight);
  const { x, y, w, h } = street;
  useEffect(() => {
    const root = layer.current!;
    // Larger flat icons fill the road while matching their collision footprints.
    const road = streetRoad({ x, y, w, h }, 1.5);
    let traffic = createTraffic();
    const nodes = new Map<number, HTMLElement>();
    const walkers = new Map<HTMLElement, Point>();
    let raf = 0;
    let last = 0;
    let lastDraw = 0;
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (now - lastDraw < 1000 / 30) return;
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = lastDraw = now;
      const people = [...(plan.current?.querySelectorAll<HTMLElement>('[data-street-person]') ?? [])];
      const seen = new Set(people);
      for (const node of walkers.keys()) if (!seen.has(node)) walkers.delete(node);
      const positions = people
        .map((node) => {
          const home = { x: Number(node.dataset.streetX), z: Number(node.dataset.streetZ) };
          const radius = Number(node.dataset.streetRadius);
          if (reduced) {
            walkers.delete(node);
            node.style.removeProperty('--street-x');
            node.style.removeProperty('--street-z');
            delete node.dataset.dodging;
            return null;
          }
          // Freeze the offset at pickup so the character stays under the pointer.
          if (node.dataset.streetHeld === 'true') return null;
          // A press below the drag threshold is still a pedestrian for cars to yield to.
          if (node.dataset.streetPressed === 'true') return { ...(walkers.get(node) ?? home), radius };
          const desired = {
            x: home.x + Math.sin(traffic.time * 0.6 + home.x) * Math.min(1, w * 0.01),
            z: home.z,
          };
          const escape = trafficEscape({ ...desired, radius }, road, traffic.cars);
          const position = stepAside(walkers.get(node) ?? home, escape ?? desired, dt);
          walkers.set(node, position);
          node.style.setProperty('--street-x', `${(position.x - home.x) * scale}px`);
          node.style.setProperty('--street-z', `${(position.z - home.z) * scale}px`);
          node.dataset.dodging = String(Boolean(escape));
          return { ...position, radius };
        })
        .filter((person) => person !== null);
      if (!reduced) traffic = stepTraffic(traffic, road, dt, positions);
      const cars = reduced ? parkedTraffic(road) : traffic.cars;
      const ids = new Set(cars.map((car) => car.id));
      for (const [id, node] of nodes)
        if (!ids.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      for (const car of cars) {
        let node = nodes.get(car.id);
        if (!node) {
          node = document.createElement('div');
          node.dataset.trafficCar = car.shape;
          node.dataset.direction = String(car.direction);
          node.dataset.color = car.color;
          node.innerHTML = carArt(car);
          node.style.cssText = 'position:absolute;pointer-events:none;transform-origin:0 0;';
          root.appendChild(node);
          nodes.set(car.id, node);
        }
        // The drawing includes empty space in front for its headlight beam.
        node.style.width = `${(car.length * scale * 150) / 90}px`;
        node.style.height = `${car.width * scale * 1.8}px`;
        node.style.left = `${(car.x - x - (car.direction * car.length) / 2) * scale}px`;
        node.style.top = `${(car.z - y) * scale}px`;
        node.style.transform = `translateY(-65%) scaleX(${car.direction})`;
        node.querySelectorAll<SVGElement>('.car-lights').forEach((glow) => {
          glow.style.opacity = String(lights.current);
        });
      }
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      root.replaceChildren();
      for (const node of walkers.keys()) {
        node.style.removeProperty('--street-x');
        node.style.removeProperty('--street-z');
        delete node.dataset.dodging;
      }
    };
  }, [x, y, w, h, scale, reduced, plan]);
  return (
    <div
      ref={layer}
      data-street-traffic
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: x * scale,
        top: y * scale,
        width: w * scale,
        height: h * scale,
        overflow: 'hidden',
        borderRadius: 16,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}
