// The 3D scene: same rooms and seats as 2D, drawn with three.js. React owns the
// page around it (Map3D.tsx) and renders each person's badge into the label
// elements this scene hands back.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Accessory, Stroke } from '../../shared/look.ts';
import type { TeamState, TeamUser } from '../../shared/types.ts';
import {
  BODY_CENTER_Y,
  BODY_RADIUS,
  BODY_SCALE_Y,
  BODY_SCALE_Z,
  DRAWING_SCALE,
  pointPairs,
  surfacePoint,
} from '../lib/drawing.ts';
import { computeLayout, type MapLayout, type Zone, type ZoneKind } from '../lib/layout.ts';
import { lookFor } from '../lib/look.ts';
import { MUSTACHE_SMILE_DROP, wornStrokes } from '../lib/wornItems.ts';

export interface CameraPreset {
  id: string;
  name: string;
}

export interface CameraState {
  presets: CameraPreset[];
  active: string | null;
}

export interface ZoneLabelSlot {
  id: string;
  name: string;
  count: number;
  element: HTMLElement;
}

export interface SceneLabels {
  people: ReadonlyMap<string, HTMLElement>;
  zones: ZoneLabelSlot[];
}

export interface Scene3D {
  /** Applies new data, and returns the elements React should render labels into. */
  update(state: TeamState, isDimmed: (user: TeamUser) => boolean): SceneLabels;
  applyPreset(id: string): void;
  focus(username: string): void;
  destroy(): void;
}

interface SceneOptions {
  onPick: (username: string, label: HTMLElement) => void;
  onCamera: (camera: CameraState) => void;
}

type Vec3 = [number, number, number];

interface PresetView extends CameraPreset {
  target: Vec3;
  w: number;
  h: number;
  direction: Vec3;
  tilt: number;
}

interface Character {
  username: string;
  group: THREE.Group;
  inner: THREE.Group;
  bodyMaterial: THREE.Material;
  designKey: string;
  label: CSS2DObject;
  labelElement: HTMLElement;
  phase: number;
  target: THREE.Vector3;
  placed: boolean;
  opacity: number;
  targetOpacity: number;
  scale: number;
  cell: number;
  labelScale: number;
  strolling: boolean;
}

interface Tween {
  fromTarget: THREE.Vector3;
  fromPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
  toPosition: THREE.Vector3;
  startedAt: number;
}

interface MeshOptions {
  x?: number;
  y?: number;
  z?: number;
  shadow?: boolean;
}

interface Point {
  x: number;
  z: number;
}

const FRAME_MS = 1000 / 30; // 30 fps is plenty, and kinder to an always-on TV.
const WALK_SPEED = 16;
const STROLL_SPEED = 0.45;
const WALL_H = 5;
const INK = 0x2a2657;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Shared materials and helpers ---------------------------------------

function toonRamp() {
  const texture = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function checkerTexture(a: string, b: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillRect(32, 32, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScene3D(root: HTMLElement, { onPick, onCamera }: SceneOptions): Scene3D {
  const ramp = toonRamp();
  const materials = new Map<number, THREE.MeshToonMaterial>();
  const mat = (color: number): THREE.MeshToonMaterial => {
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
      materials.set(color, material);
    }
    return material;
  };

  function mesh(geometry: THREE.BufferGeometry, color: number | THREE.Material, { x = 0, y = 0, z = 0, shadow = true }: MeshOptions = {}) {
    const m = new THREE.Mesh(geometry, typeof color === 'object' ? color : mat(color));
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }

  // ---- Scene ------------------------------------------------------------

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 600);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.append(renderer.domElement);

  const labels = new CSS2DRenderer();
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  root.append(labels.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc2ff, 1.9));
  const sun = new THREE.DirectionalLight(0xfff4dc, 1.35);
  sun.position.set(-34, 80, 44);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 60, bottom: -60, near: 1, far: 220 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 16;
  controls.maxDistance = 230;
  controls.screenSpacePanning = false;

  const world = new THREE.Group();
  scene.add(world);
  const desks = new THREE.Group();
  scene.add(desks);

  const characters = new Map<string, Character>();
  const zoneLabels = new Map<string, HTMLElement>();
  let labelElements: ReadonlyMap<string, HTMLElement> = new Map();
  let layout: MapLayout = computeLayout([], []);
  let center: Point = { x: 0, z: 0 };
  let buildKey = '';
  let deskKey = '';
  let presets: PresetView[] = [];
  let activePreset: string | null = 'overview';

  const toWorld = (x: number, y: number): Point => ({ x: x - center.x, z: y - center.z });

  // ---- Building the rooms -----------------------------------------------

  function addPlant(parent: THREE.Group, x: number, z: number) {
    parent.add(mesh(new THREE.CylinderGeometry(0.9, 0.65, 1.3, 10), 0xff9c7a, { x, y: 1.65, z }));
    const leaf = new THREE.ConeGeometry(1.2, 2.9, 7);
    parent.add(mesh(leaf, 0x63c96c, { x, y: 3.7, z }));
    parent.add(mesh(new THREE.ConeGeometry(0.9, 2.2, 7), 0x7ad67f, { x, y: 5, z }));
  }

  function addTree(parent: THREE.Group, x: number, z: number) {
    parent.add(mesh(new THREE.CylinderGeometry(0.55, 0.75, 3, 8), 0xc99467, { x, y: 2.5, z }));
    parent.add(mesh(new THREE.IcosahedronGeometry(2.5, 1), 0x63c96c, { x, y: 5.6, z }));
    parent.add(mesh(new THREE.IcosahedronGeometry(1.7, 1), 0x7ad67f, { x: x + 1, y: 7, z: z + 0.4 }));
  }

  function addOffice(group: THREE.Group, z: Zone, c: Point) {
    const tiles = checkerTexture('#e6deff', '#f4f0ff');
    tiles.repeat.set(z.w / 5, z.h / 5);
    const floor = new THREE.MeshToonMaterial({ map: tiles, gradientMap: ramp });
    group.add(mesh(new THREE.BoxGeometry(z.w, 1, z.h), floor, { ...c, y: 0.5, shadow: false }));

    // Back and left walls only, cut away so the room stays visible.
    const backWall = mesh(new THREE.BoxGeometry(z.w, WALL_H, 0.7), 0xfff4fa, { x: c.x, y: 1 + WALL_H / 2, z: c.z - z.h / 2 + 0.35 });
    const sideWall = mesh(new THREE.BoxGeometry(0.7, WALL_H, z.h), 0xf8ebff, { x: c.x - z.w / 2 + 0.35, y: 1 + WALL_H / 2, z: c.z });
    group.add(backWall, sideWall);

    // Windows along the back wall.
    const windows = Math.max(1, Math.floor(z.w / 11));
    for (let i = 0; i < windows; i++) {
      const wx = c.x - z.w / 2 + ((i + 0.5) * z.w) / windows;
      group.add(mesh(new THREE.BoxGeometry(5, 2.6, 0.2), 0x8fddf5, { x: wx, y: 3.9, z: c.z - z.h / 2 + 0.75, shadow: false }));
    }
    addPlant(group, c.x + z.w / 2 - 2.2, c.z - z.h / 2 + 2.4);
    addPlant(group, c.x - z.w / 2 + 2.4, c.z + z.h / 2 - 2.4);
  }

  function addWfh(group: THREE.Group, z: Zone, c: Point) {
    group.add(mesh(new THREE.BoxGeometry(z.w, 1, z.h), 0xa4e8c0, { ...c, y: 0.5, shadow: false }));
    const hx = c.x + z.w / 2 - 7;
    const hz = c.z - z.h / 2 + 6;
    group.add(mesh(new THREE.BoxGeometry(8, 4.6, 7), 0xfff4d6, { x: hx, y: 3.3, z: hz }));
    const roof = mesh(new THREE.ConeGeometry(6.8, 3.8, 4), 0xff8fb3, { x: hx, y: 7.5, z: hz });
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    group.add(mesh(new THREE.BoxGeometry(1.8, 3, 0.2), 0xb7a6ff, { x: hx, y: 2.5, z: hz + 3.55, shadow: false }));
    addTree(group, c.x - z.w / 2 + 3, c.z + z.h / 2 - 3);
  }

  function addOff(group: THREE.Group, z: Zone, c: Point) {
    const sandW = z.w * 0.64;
    group.add(mesh(new THREE.BoxGeometry(sandW, 1, z.h), 0xffe9b8, { x: c.x - z.w / 2 + sandW / 2, y: 0.5, z: c.z, shadow: false }));
    const waterW = z.w - sandW;
    group.add(mesh(new THREE.BoxGeometry(waterW, 0.8, z.h), 0x8fddf5, { x: c.x + z.w / 2 - waterW / 2, y: 0.4, z: c.z, shadow: false }));
    // Kept low and to one side, so it doesn't block the view of the street behind it.
    const px = c.x - z.w / 2 + sandW * 0.94;
    const pz = c.z - z.h / 2 + 3;
    group.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.4, 6), 0xffffff, { x: px, y: 2.7, z: pz }));
    group.add(mesh(new THREE.ConeGeometry(3, 1.3, 10), 0xff8fb3, { x: px, y: 4.8, z: pz }));
  }

  function addLobby(group: THREE.Group, z: Zone, c: Point) {
    group.add(mesh(new THREE.BoxGeometry(z.w, 1, z.h), 0xffe0ec, { ...c, y: 0.5, shadow: false }));
    group.add(mesh(new THREE.BoxGeometry(9, 0.2, 3.6), 0xffe27a, { x: c.x + z.w / 2 - 7, y: 1.1, z: c.z + z.h / 2 - 3, shadow: false }));
  }

  function addLampPost(group: THREE.Group, x: number, z: number) {
    group.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 6, 8), INK, { x, y: 4, z }));
    group.add(mesh(new THREE.SphereGeometry(0.6, 12, 8), 0xffe27a, { x, y: 7.2, z }));
  }

  function addCar(group: THREE.Group, x: number, z: number) {
    group.add(mesh(new THREE.BoxGeometry(7.5, 1.5, 3.2), 0xff8fb3, { x, y: 2, z }));
    group.add(mesh(new THREE.BoxGeometry(4, 1.3, 2.8), 0xdfe3ff, { x: x - 0.3, y: 3.3, z }));
    for (const wheelX of [x - 2.4, x + 2.4]) {
      for (const wheelZ of [z - 1.65, z + 1.65]) {
        const wheel = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 14), INK, { x: wheelX, y: 1.5, z: wheelZ });
        wheel.rotation.x = Math.PI / 2;
        group.add(wheel);
      }
    }
  }

  // Runs off both sides of the island: a pavement, then the road and its markings.
  function addStreet(group: THREE.Group, z: Zone, c: Point) {
    const width = layout.width + 8;
    const pavement = z.h * 0.3;
    const roadDepth = z.h - pavement;
    const pavementZ = c.z - z.h / 2 + pavement / 2;
    const roadZ = c.z + pavement / 2;
    group.add(mesh(new THREE.BoxGeometry(width, 1, roadDepth), 0x8d8ba5, { y: 0.5, z: roadZ, shadow: false }));
    group.add(mesh(new THREE.BoxGeometry(width, 1.15, pavement), 0xefe9f7, { y: 0.575, z: pavementZ, shadow: false }));

    const paint = 0xffffff;
    for (let x = -width / 2 + 3; x < width / 2; x += 7) {
      group.add(mesh(new THREE.BoxGeometry(3.5, 0.05, 0.3), paint, { x, y: 1.03, z: roadZ, shadow: false }));
    }
    const crosswalkX = -2;
    for (let i = 0; i < 5; i++) {
      const stripeZ = roadZ - roadDepth / 2 + 1 + (i * (roadDepth - 1.5)) / 4;
      group.add(mesh(new THREE.BoxGeometry(4, 0.06, 0.7), paint, { x: crosswalkX, y: 1.04, z: stripeZ, shadow: false }));
    }

    addLampPost(group, -width * 0.32, pavementZ);
    addLampPost(group, width * 0.24, pavementZ);
    addCar(group, width * 0.4, roadZ + 1);
  }

  const BUILDERS: Record<ZoneKind, (group: THREE.Group, z: Zone, c: Point) => void> = { office: addOffice, wfh: addWfh, off: addOff, lobby: addLobby, street: addStreet };

  function zoneCenter(z: Zone): Point {
    return toWorld(z.x + z.w / 2, z.y + z.h / 2);
  }

  function buildWorld() {
    disposeGroup(world);
    zoneLabels.clear();
    center = { x: layout.width / 2, z: layout.height / 2 };

    // A rounded grass island under everything.
    const shape = new THREE.Shape();
    const w = layout.width + 8;
    const h = layout.height + 8;
    const r = 7;
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    shape.lineTo(w / 2, h / 2 - r);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    shape.lineTo(-w / 2, -h / 2 + r);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const island = mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false }), 0xbdf0d2, { y: 0, shadow: false });
    island.rotation.x = Math.PI / 2;
    world.add(island);

    if (layout.park) {
      const { x, y, w, h } = layout.park;
      const middle = toWorld(x + w / 2, y + h / 2);
      addTree(world, middle.x - w * 0.3, middle.z);
      addTree(world, middle.x + w * 0.05, middle.z - h * 0.15);
      addTree(world, middle.x + w * 0.32, middle.z + h * 0.1);
    }

    for (const z of layout.zones) {
      const c = zoneCenter(z);
      BUILDERS[z.kind](world, z, c);

      const label = document.createElement('div');
      const object = new CSS2DObject(label);
      object.position.set(c.x - z.w / 2 + 2, z.kind === 'office' ? WALL_H + 2.5 : 3, c.z - z.h / 2 + 0.5);
      object.center.set(0, 0.5);
      world.add(object);
      zoneLabels.set(z.id, label);
    }

    buildPresets();
  }

  function buildDesks() {
    disposeGroup(desks);
    for (const seat of layout.seats.values()) {
      if (seat.zone.kind !== 'office') continue;
      const { x, z } = toWorld(seat.x, seat.y);
      const size = deskSize(seat.cell);
      // Low and in front of the body, with the laptop to one side, so the face stays visible.
      desks.add(mesh(new THREE.BoxGeometry(3.4 * size, 0.25 * size, 1.4 * size), 0xffd9a0, { x, y: 1 + 0.65 * size, z: z + 2.35 * size }));
      desks.add(mesh(new THREE.BoxGeometry(3.1 * size, 0.55 * size, 0.2 * size), 0xf0b878, { x, y: 1 + 0.3 * size, z: z + 2.85 * size }));
      desks.add(mesh(new THREE.BoxGeometry(0.95 * size, 0.65 * size, 0.1 * size), 0xdfe3ff, { x: x + 1.15 * size, y: 1 + 1.05 * size, z: z + 2.15 * size }));
    }
  }

  // Scales furniture and people down when a room gets crowded.
  function deskSize(cell: number): number {
    return Math.max(0.9, Math.min(cell / 7, 1.5));
  }

  function disposeGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        // Tiled floors have their own material and texture; the rest are shared.
        const material = child.material as THREE.MeshToonMaterial;
        if (material.map) {
          material.map.dispose();
          material.dispose();
        }
      }
      if (child instanceof CSS2DObject) child.element.remove();
    }
  }

  // ---- Characters -------------------------------------------------------

  function addAccessory(group: THREE.Group, accessory: Accessory, material: THREE.Material) {
    const ink = mat(INK);
    const add = (geometry: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const part = mesh(geometry, m, { x, y, z });
      group.add(part);
      return part;
    };
    if (accessory === 'sprout') {
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), ink, 0, 2.62, 0);
      add(new THREE.SphereGeometry(0.34, 8, 6), mat(0x7ad67f), -0.28, 2.92, 0).scale.set(1.2, 0.55, 0.8);
      add(new THREE.SphereGeometry(0.34, 8, 6), mat(0x7ad67f), 0.28, 2.92, 0).scale.set(1.2, 0.55, 0.8);
    } else if (accessory === 'ears') {
      add(new THREE.ConeGeometry(0.42, 0.85, 8), material, -0.72, 2.45, 0).rotation.z = 0.35;
      add(new THREE.ConeGeometry(0.42, 0.85, 8), material, 0.72, 2.45, 0).rotation.z = -0.35;
    } else if (accessory === 'antenna') {
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6), ink, 0, 2.72, 0);
      add(new THREE.SphereGeometry(0.24, 10, 8), mat(0xff7b9c), 0, 3.15, 0);
    } else if (accessory === 'bow') {
      add(new THREE.ConeGeometry(0.34, 0.6, 4), mat(0xff6f9f), 0.72, 2.32, 0.1).rotation.z = Math.PI / 2;
      add(new THREE.ConeGeometry(0.34, 0.6, 4), mat(0xff6f9f), 0.2, 2.5, 0.1).rotation.z = -Math.PI / 2;
    } else if (accessory === 'party') {
      add(new THREE.ConeGeometry(0.52, 1.15, 12), mat(0xffe27a), 0, 2.88, 0);
    } else if (accessory === 'headphones') {
      const band = add(new THREE.TorusGeometry(1.32, 0.09, 8, 20, Math.PI), ink, 0, 1.28, 0);
      band.scale.y = 0.92;
      add(new THREE.CapsuleGeometry(0.2, 0.28, 4, 8), mat(0xff6f9f), -1.32, 1.28, 0);
      add(new THREE.CapsuleGeometry(0.2, 0.28, 4, 8), mat(0xff6f9f), 1.32, 1.28, 0);
    }
  }

  // Drawn lines become thin tubes wrapped around the body, merged by color to keep draw calls low.
  function addDrawing(inner: THREE.Group, strokes: Stroke[]) {
    const partsByColor = new Map<string, THREE.BufferGeometry[]>();
    for (const stroke of strokes) {
      const radius = (stroke.width * DRAWING_SCALE) / 2;
      const points: THREE.Vector3[] = [];
      for (const [x, y] of pointPairs(stroke)) {
        const point = new THREE.Vector3(...surfacePoint(x, y, radius * 0.4));
        const last = points[points.length - 1];
        if (!last || last.distanceTo(point) > 0.001) points.push(point);
      }
      const first = points[0];
      const last = points[points.length - 1];
      if (!first || !last) continue;

      const parts = partsByColor.get(stroke.color) ?? [];
      partsByColor.set(stroke.color, parts);
      // Round caps, which are also all that a single tap draws.
      parts.push(new THREE.SphereGeometry(radius, 8, 6).translate(first.x, first.y, first.z));
      if (points.length > 1) {
        parts.push(new THREE.SphereGeometry(radius, 8, 6).translate(last.x, last.y, last.z));
        const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
        parts.push(new THREE.TubeGeometry(curve, Math.min(points.length * 2, 80), radius, 6, false));
      }
    }

    for (const [color, parts] of partsByColor) {
      const merged = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      if (merged) inner.add(mesh(merged, parseInt(color.slice(1), 16), { shadow: false }));
    }
  }

  // Matches the 2D hat: the same width and height, sitting on top of the head.
  function addHat(inner: THREE.Group) {
    inner.add(mesh(new THREE.CylinderGeometry(1.07, 1.07, 0.12, 24), INK, { y: 2.48 }));
    inner.add(mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.72, 24), INK, { y: 2.9 }));
    inner.add(mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.2, 24), 0xff6f9f, { y: 2.67 }));
  }

  function buildBody(inner: THREE.Group, user: TeamUser): THREE.Material {
    const look = lookFor(user.username, user.look);
    const bodyMaterial = new THREE.MeshToonMaterial({ color: look.color, gradientMap: ramp });
    const body = mesh(new THREE.SphereGeometry(BODY_RADIUS, 24, 18), bodyMaterial, { y: BODY_CENTER_Y });
    body.scale.set(1, BODY_SCALE_Y, BODY_SCALE_Z);
    inner.add(body);

    const eye = new THREE.SphereGeometry(0.13, 10, 8);
    inner.add(mesh(eye, INK, { x: -0.46, y: 1.42, z: 1.21, shadow: false }));
    inner.add(mesh(eye, INK, { x: 0.46, y: 1.42, z: 1.21, shadow: false }));

    const blush = new THREE.SphereGeometry(0.2, 10, 6);
    const left = mesh(blush, 0xff9ab5, { x: -0.76, y: 1.12, z: 1.06, shadow: false });
    const right = mesh(blush, 0xff9ab5, { x: 0.76, y: 1.12, z: 1.06, shadow: false });
    left.scale.z = right.scale.z = 0.3;
    left.scale.y = right.scale.y = 0.65;
    inner.add(left, right);

    const smile = mesh(new THREE.TorusGeometry(0.17, 0.045, 6, 12, Math.PI), INK, { y: 1.16, z: 1.27, shadow: false });
    smile.rotation.z = Math.PI;
    if (look.wearing.includes('mustache')) {
      const [, y, z] = surfacePoint(32, 42 + MUSTACHE_SMILE_DROP, 0.02);
      smile.position.set(0, y, z);
    }
    inner.add(smile);

    // A hat takes the place of the automatic accessory.
    if (look.wearing.includes('hat')) addHat(inner);
    else addAccessory(inner, look.accessory, bodyMaterial);
    addDrawing(inner, [...wornStrokes(look.wearing), ...look.strokes]);

    inner.traverse((node) => {
      if (node instanceof THREE.Mesh) node.userData.username = user.username;
    });
    return bodyMaterial;
  }

  function createCharacter(user: TeamUser, phase: number): Character {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);
    const bodyMaterial = buildBody(inner, user);

    // CSS2DRenderer owns the anchor's transform, so this inner element can scale.
    const labelElement = document.createElement('div');
    Object.assign(labelElement.style, { display: 'flex', justifyContent: 'center', transformOrigin: '50% 100%' });
    const anchor = document.createElement('div');
    anchor.append(labelElement);
    const label = new CSS2DObject(anchor);
    label.position.set(0, 3.3, 0);
    label.center.set(0.5, 1);
    group.add(label);
    scene.add(group);

    return { username: user.username, designKey: JSON.stringify(user.look), bodyMaterial, group, inner, label, labelElement, phase, target: new THREE.Vector3(), placed: false, opacity: 1, targetOpacity: 1, scale: 1, cell: 10, labelScale: 0, strolling: false };
  }

  function clearBody(character: Character) {
    character.inner.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      (node.userData.fadeMaterial as THREE.Material | undefined)?.dispose();
    });
    character.bodyMaterial.dispose();
    character.inner.clear();
  }

  function destroyCharacter(character: Character) {
    scene.remove(character.group);
    character.label.element.remove();
    clearBody(character);
  }

  // Someone saved a new look, so swap it in without moving them.
  function redecorate(character: Character, user: TeamUser, designKey: string) {
    clearBody(character);
    character.bodyMaterial = buildBody(character.inner, user);
    character.designKey = designKey;
    if (character.opacity < 1) setOpacity(character, character.opacity);
  }

  function setOpacity(character: Character, value: number) {
    character.opacity = value;
    character.group.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (!node.userData.fadeMaterial) node.userData.fadeMaterial = (node.material as THREE.Material).clone();
      const material = node.userData.fadeMaterial as THREE.Material;
      node.material = material;
      material.transparent = value < 1;
      material.opacity = value;
      material.depthWrite = value >= 1;
    });
  }

  // ---- Camera -----------------------------------------------------------

  // How far back the camera must sit for an area of this size to fit on screen.
  function fitDistance(w: number, h: number, tilt: number): number {
    const span = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max(w / (span * camera.aspect), (h * tilt) / span);
  }

  function buildPresets() {
    const all = { w: layout.width + 8, h: layout.height + 8 };
    presets = [
      { id: 'overview', name: 'Overview', target: [0, 0, 1], ...all, direction: [0, 0.76, 0.64], tilt: 0.86 },
      { id: 'top', name: 'From above', target: [0, 0, 0], ...all, direction: [0, 1, 0.001], tilt: 1.12 },
    ];
    for (const z of layout.zones) {
      if (z.kind === 'lobby') continue;
      const c = zoneCenter(z);
      // The street spans the whole map, so its view frames the middle where people stroll.
      const viewWidth = z.kind === 'street' ? z.w * 0.7 : z.w + 6;
      presets.push({ id: z.id, name: z.name, target: [c.x, 0, c.z], w: viewWidth, h: z.h + 6, direction: [0, 0.6, 0.8], tilt: 0.85 });
    }
    reportCamera();
  }

  function reportCamera() {
    onCamera({ presets: presets.map(({ id, name }) => ({ id, name })), active: activePreset });
  }

  let tween: Tween | null = null;

  function flyTo(targetVec: THREE.Vector3, positionVec: THREE.Vector3, immediate = false) {
    // Clears leftover momentum from a drag, which would otherwise skew the landing.
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;

    if (immediate || reducedMotion) {
      controls.target.copy(targetVec);
      camera.position.copy(positionVec);
      tween = null;
      controls.update();
      return;
    }
    tween = {
      fromTarget: controls.target.clone(),
      fromPosition: camera.position.clone(),
      toTarget: targetVec,
      toPosition: positionVec,
      startedAt: performance.now(),
    };
  }

  function applyPreset(id: string, immediate = false) {
    const preset = presets.find((p) => p.id === id) ?? presets[0];
    if (!preset) return;
    activePreset = preset.id;
    const target = new THREE.Vector3(...preset.target);
    const direction = new THREE.Vector3(...preset.direction).normalize();
    const position = target.clone().addScaledVector(direction, fitDistance(preset.w, preset.h, preset.tilt));
    flyTo(target, position, immediate);
    reportCamera();
  }

  controls.addEventListener('start', () => {
    tween = null;
    activePreset = null;
    reportCamera();
  });

  // ---- Clicking characters ----------------------------------------------

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt: { x: number; y: number } | null = null;

  function onPointerDown(e: PointerEvent) {
    downAt = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e: PointerEvent) {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const meshes = [...characters.values()].map((c) => c.group);
    const hit = raycaster.intersectObjects(meshes, true).find((h) => h.object.userData.username);
    const username = hit?.object.userData.username as string | undefined;
    const character = username ? characters.get(username) : undefined;
    if (username && character) onPick(username, character.labelElement);
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  // ---- Applying data ----------------------------------------------------

  function apply(state: TeamState, isDimmed: (user: TeamUser) => boolean): SceneLabels {
    layout = computeLayout(state.places, state.users);

    // Rooms change size with their people, which means rebuilding the town.
    const key = layout.zones.map((z) => [z.id, z.name, z.x, z.y, z.w, z.h].join()).join(';');
    const isFirstBuild = !buildKey;
    if (key !== buildKey) {
      buildKey = key;
      buildWorld();
    }
    if (isFirstBuild) applyPreset('overview', true);

    const nextDeskKey = [...layout.seats.entries()].map(([u, s]) => `${u}:${s.x}:${s.y}:${s.zone.kind}`).join();
    if (nextDeskKey !== deskKey) {
      deskKey = nextDeskKey;
      buildDesks();
    }

    const seen = new Set<string>();
    let changed = false;
    state.users.forEach((user, i) => {
      const seat = layout.seats.get(user.username);
      if (!seat) return;
      seen.add(user.username);
      let character = characters.get(user.username);
      if (!character) {
        character = createCharacter(user, i * 0.7);
        characters.set(user.username, character);
        changed = true;
      }
      const designKey = JSON.stringify(user.look);
      if (designKey !== character.designKey) redecorate(character, user, designKey);
      const { x, z } = toWorld(seat.x, seat.y);
      character.target = new THREE.Vector3(x, 1, z);
      character.scale = deskSize(seat.cell);
      character.cell = seat.cell;
      character.strolling = seat.zone.kind === 'street';
      character.targetOpacity = isDimmed(user) ? 0.22 : 1;
      if (!character.placed || reducedMotion) {
        character.group.position.copy(character.target);
        character.placed = true;
      }
    });

    for (const [username, character] of characters) {
      if (!seen.has(username)) {
        destroyCharacter(character);
        characters.delete(username);
        changed = true;
      }
    }

    // A new map only when people come or go, so React re-renders just for that.
    if (changed) labelElements = new Map([...characters].map(([username, c]) => [username, c.labelElement]));

    const zones = layout.zones.flatMap(({ id, name, count }) => {
      const element = zoneLabels.get(id);
      return element ? [{ id, name, count, element }] : [];
    });
    return { people: labelElements, zones };
  }

  // ---- Animation --------------------------------------------------------

  function animate(dt: number, time: number) {
    if (tween) {
      // Based on real time, so a slow machine lands on schedule with fewer frames.
      const t = Math.min(1, (performance.now() - tween.startedAt) / 900);
      const k = t * t * (3 - 2 * t);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      camera.position.lerpVectors(tween.fromPosition, tween.toPosition, k);
      if (t >= 1) tween = null;
    }
    controls.update();

    for (const c of characters.values()) {
      const { group, inner, target } = c;
      const size = c.scale;
      group.scale.setScalar(size);

      // Shrink labels when neighbours would overlap at the current zoom.
      const pixelsPerUnit = root.clientHeight / (2 * group.position.distanceTo(camera.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      const labelScale = Math.round(Math.max(root.clientWidth < 600 ? 0.42 : 0.55, Math.min((c.cell * pixelsPerUnit) / 104, 1)) * 20) / 20;
      if (labelScale !== c.labelScale) {
        c.labelScale = labelScale;
        c.labelElement.style.transform = `scale(${labelScale})`;
      }

      const toTarget = target.clone().sub(group.position);
      toTarget.y = 0;
      const distance = toTarget.length();
      if (distance > 0.05) {
        const step = Math.min(distance, WALK_SPEED * dt);
        group.position.addScaledVector(toTarget.normalize(), step);
        const facing = Math.atan2(toTarget.x, toTarget.z);
        inner.rotation.y += shortestAngle(facing - inner.rotation.y) * Math.min(1, dt * 12);
        inner.position.y = Math.abs(Math.sin(time * 11 + c.phase)) * 0.75;
      } else {
        // On the street people amble to and fro, half turned so their faces still show.
        const ambling = c.strolling && !reducedMotion;
        const heading = ambling ? Math.sign(Math.cos(time * STROLL_SPEED + c.phase)) * 0.8 : 0;
        inner.position.y = ambling ? Math.abs(Math.sin(time * 3.2 + c.phase)) * 0.14 : 0;
        inner.rotation.y += shortestAngle(heading - inner.rotation.y) * Math.min(1, dt * 4);
        if (!reducedMotion) {
          const breathe = Math.sin(time * 2.2 + c.phase) * 0.025;
          inner.scale.set(1 + breathe, 1 - breathe, 1 + breathe);
        }
      }

      const strollX = c.strolling && !reducedMotion ? Math.sin(time * STROLL_SPEED + c.phase) * Math.min(c.cell * 0.18, 1.4) : 0;
      inner.position.x += (strollX - inner.position.x) * Math.min(1, dt * 4);
      c.label.position.x = inner.position.x;

      if (Math.abs(c.opacity - c.targetOpacity) > 0.005) {
        setOpacity(c, c.opacity + (c.targetOpacity - c.opacity) * Math.min(1, dt * 8));
      }
    }
  }

  function shortestAngle(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  let raf = 0;
  let last = 0;
  let lastFrame = 0;

  // requestAnimationFrame stops by itself while the tab is hidden.
  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    if (now - lastFrame < FRAME_MS) return;
    const dt = Math.min((now - last) / 1000 || 0, 0.1);
    last = now;
    lastFrame = now;
    animate(dt, now / 1000);
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = root;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
    if (activePreset && presets.length) applyPreset(activePreset, true);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(root);
  resize();
  raf = requestAnimationFrame(loop);

  return {
    update: apply,
    applyPreset: (id) => applyPreset(id),
    focus(username) {
      const c = characters.get(username);
      if (!c) return;
      activePreset = null;
      const target = c.target.clone();
      target.y = 0;
      const position = target.clone().addScaledVector(new THREE.Vector3(0, 0.6, 0.8), fitDistance(34, 26, 0.85));
      flyTo(target, position);
      reportCamera();
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.dispose();
        (node.material as THREE.Material).dispose();
        (node.userData.fadeMaterial as THREE.Material | undefined)?.dispose();
      });
      for (const character of characters.values()) character.bodyMaterial.dispose();
      for (const material of materials.values()) material.dispose();
      ramp.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // Browsers allow only a few live 3D contexts.
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
