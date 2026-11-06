// The latest vote result in 3D: a small blimp that loops slowly over the town, towing a
// banner with the result on it (a canvas texture). Its gondola lights up after dark.
import * as THREE from 'three';

const BANNER_W = 15;
const BANNER_H = 2.4;
const CANVAS_W = 1024;
const CANVAS_H = 164;

export interface Blimp3D {
  group: THREE.Group;
  setText(text: string): void;
  /** 0 by day, up to 1 at night: how brightly the gondola's windows glow. */
  setLit(level: number): void;
}

export function createBlimp(): Blimp3D {
  const group = new THREE.Group();
  group.name = 'result-blimp';
  const pink = new THREE.MeshStandardMaterial({ color: 0xff9cc2, roughness: 0.55 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x2a2657, roughness: 0.7 });
  const windows = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffc861, emissiveIntensity: 0 });
  const rope = new THREE.LineBasicMaterial({ color: 0x2a2657 });

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const cloth = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });

  function add(object: THREE.Mesh) {
    object.castShadow = true;
    object.userData.resultBanner = true;
    object.userData.ownedMaterial = true;
    group.add(object);
    return object;
  }

  // The nose points along +x; the banner trails behind on -x.
  const body = add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), pink));
  body.scale.set(4.2, 1.7, 1.7);
  for (const [y, z, w, h] of [[1.3, 0, 0.15, 1.6], [0, 1.3, 1.6, 0.15], [0, -1.3, 1.6, 0.15], [-1.3, 0, 0.15, 1.6]] as const) {
    const fin = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, h, w), ink));
    fin.position.set(-3.6, y * 0.8, z * 0.8);
  }
  const gondola = add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 0.9), ink));
  gondola.position.set(0.3, -1.9, 0);
  const glass = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.32, 0.95), windows));
  glass.position.set(0.3, -1.85, 0);

  // Two cloths back to back, so the words read the right way round from either side.
  for (const side of [1, -1]) {
    const banner = add(new THREE.Mesh(new THREE.PlaneGeometry(BANNER_W, BANNER_H), cloth));
    banner.position.set(-4.6 - BANNER_W / 2 - 2, -0.6, side * 0.02);
    banner.rotation.y = side === 1 ? 0 : Math.PI;
    banner.castShadow = false;
  }
  const ropes = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-4.2, 0, 0),
    new THREE.Vector3(-6.6, -0.6 + BANNER_H / 2, 0),
    new THREE.Vector3(-4.2, 0, 0),
    new THREE.Vector3(-6.6, -0.6 - BANNER_H / 2, 0),
  ]);
  group.add(new THREE.LineSegments(ropes, rope));

  function setText(text: string) {
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = '#2a2657';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
    ctx.fillStyle = '#2a2657';
    let size = 76;
    ctx.font = `800 ${size}px 'Baloo 2', 'Segoe UI', sans-serif`;
    // Long results get smaller letters, down to a size that still reads from afar.
    while (ctx.measureText(text).width > CANVAS_W - 60 && size > 44) {
      size -= 4;
      ctx.font = `800 ${size}px 'Baloo 2', 'Segoe UI', sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2 + 4, CANVAS_W - 60);
    texture.needsUpdate = true;
  }

  return {
    group,
    setText,
    setLit(level) {
      windows.emissiveIntensity = level * 1.2;
    },
  };
}
