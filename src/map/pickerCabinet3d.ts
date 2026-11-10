// A low-poly claw machine with an anchored keyboard control, matching the 2D park cabinet.
import * as THREE from 'three';
import { PICKER_COLORS, PICKER_LABELS } from '../lib/pickerAppearance.ts';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
export function createPickerCabinet() {
  const group = new THREE.Group();
  const colors = new Map<number, THREE.MeshStandardMaterial>();
  function add(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number) {
    let material = colors.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
      colors.set(color, material);
    }
    const m = new THREE.Mesh(g, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.picker = true;
    m.userData.ownedMaterial = true;
    group.add(m);
    return m;
  }
  const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) =>
    add(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  const color = (key: keyof typeof PICKER_COLORS) => new THREE.Color(PICKER_COLORS[key]).getHex();
  add(new THREE.CylinderGeometry(4.1, 4.2, 0.3, 32), 0xc4d2d4, 0, 0.15, 0);
  box(6, 3, 4, color('body'), 0, 1.5, 0);
  box(6, 1.3, 4, color('body'), 0, 8.7, 0);
  box(5.5, 1.1, 0.2, color('marquee'), 0, 8.7, 2.1);
  box(5.4, 4.6, 0.2, color('glass'), 0, 5.6, -1.8);
  for (const x of [-2.7, 2.7]) for (const z of [-1.8, 1.8]) box(0.3, 5, 0.3, 0xff9cc2, x, 5.5, z);
  box(4.8, 0.12, 0.15, 0x2a2657, 0, 7.8, 0);
  box(0.13, 1.2, 0.13, 0x2a2657, 0, 7.1, 0);
  for (const side of [-1, 1]) {
    const prong = box(0.15, 0.9, 0.15, 0x2a2657, side * 0.38, 6.2, 0);
    prong.rotation.z = side * 0.45;
  }
  for (let i = 0; i < 5; i++) {
    const x = ((i % 3) - 1) * 1.5,
      z = Math.floor(i / 3) * 1.3;
    add(new THREE.SphereGeometry(0.7, 12, 8), [0xff9cc2, 0xffe39b, 0xb7a6ef][i % 3]!, x, 3.6, z);
    for (const dx of [-0.2, 0.2]) add(new THREE.SphereGeometry(0.07, 6, 4), 0x2a2657, x + dx, 3.7, z + 0.65);
  }
  box(5.4, 0.15, 3.6, color('floor'), 0, 3.1, 0);
  box(2.6, 0.9, 0.15, color('prize'), 0, 0.8, 2.1);
  // Canvas signs remain readable when the map is zoomed, without extra floating labels.
  function sign(text: string, width: number, height: number, y: number, background: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = PICKER_COLORS.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 66px sans-serif';
    ctx.fillText(text, 256, 68, 485);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    face.position.set(0, y, 2.22);
    face.userData.picker = true;
    face.userData.ownedMaterial = true;
    group.add(face);
  }
  sign(PICKER_LABELS.title, 5.4, 1.0, 8.7, PICKER_COLORS.marquee);
  sign(PICKER_LABELS.prize, 2.4, 0.64, 0.8, PICKER_COLORS.prize);
  const playElement = document.createElement('div');
  const label = new CSS2DObject(playElement);
  label.position.set(0, 3.2, 2.3);
  group.add(label);
  return { group, playElement };
}
