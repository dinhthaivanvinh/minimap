// Builds the 3D Mochi characters, so the office map and the picker's claw machine look the same.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Accessory, Stroke } from '../../shared/look.ts';
import type { TeamUser } from '../../shared/types.ts';
import {
  BODY_CENTER_Y,
  BODY_RADIUS,
  BODY_SCALE_Y,
  BODY_SCALE_Z,
  DRAWING_SCALE,
  pointPairs,
  surfacePoint,
} from '../lib/drawing.ts';
import { lookFor } from '../lib/look.ts';
import { MUSTACHE_SMILE_DROP, wornStrokes } from '../lib/wornItems.ts';

const INK = 0x2a2657;

interface MeshOptions {
  x?: number;
  y?: number;
  z?: number;
  shadow?: boolean;
}

export interface CharacterTools {
  /** The toon shading ramp that body materials use. */
  ramp: THREE.Texture;
  /** A shared material for a color. */
  mat: (color: number) => THREE.Material;
  mesh: (geometry: THREE.BufferGeometry, color: number | THREE.Material, options?: MeshOptions) => THREE.Mesh;
}

/**
 * Returns a function that adds a person's decorated character to `inner`, standing on
 * y = 0 and facing +z, and returns the body's own material (which the caller disposes).
 */
export function createCharacterBuilder({ ramp, mat, mesh }: CharacterTools): (inner: THREE.Group, user: TeamUser) => THREE.Material {
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

  return buildBody;
}
