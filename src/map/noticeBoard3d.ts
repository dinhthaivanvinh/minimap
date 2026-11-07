// The lobby's notice board in 3D: a wooden board on two posts, with the open votes drawn
// as paper notes on a canvas texture (lib/noticeBoard.ts, the same notes as 2D). Clicks
// are picked by raycast; an HTML link anchored to it serves keyboards and screen readers.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Board } from '../lib/noticeBoard.ts';

const CANVAS_W = 528;
const CANVAS_H = 360;
const PANEL_W = 11;
const PANEL_H = 7.5;
const POST_H = 3;
const NOTE_COLOURS = ['#fff4b8', '#c9f2dc', '#ffd6e6', '#ffffff'];
const INK = '#2a2657';

interface NoteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Two columns of notes inside the cork, as in 2D.
function noteRects(count: number): NoteRect[] {
  const left = CANVAS_W * 0.09;
  const top = CANVAS_H * 0.11;
  const w = CANVAS_W - left * 2;
  const h = CANVAS_H * 0.74;
  const gap = CANVAS_W * 0.05;
  const rows = Math.max(1, Math.ceil(count / 2));
  const cellW = count === 1 ? w : (w - gap) / 2;
  const cellH = (h - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => ({
    x: left + (count === 1 ? 0 : (i % 2) * (cellW + gap)),
    y: top + Math.floor(i / 2) * (cellH + gap),
    w: cellW,
    h: cellH,
  }));
}

// Wraps a name onto at most two lines that fit the note.
function lines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(' ');
  const out: string[] = [''];
  for (const word of words) {
    const line = out[out.length - 1]!;
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) out[out.length - 1] = next;
    else out.push(word);
  }
  if (out.length > 2) out.splice(2, out.length - 2, `${out[1]}…`);
  return out;
}

export interface NoticeBoard3D {
  group: THREE.Group;
  /** Where the HTML link for keyboards and screen readers goes. */
  slot: HTMLElement;
  /** Redraws the notes. `pulse` (0 to 1) makes notes in their last hour swell a little. */
  draw(board: Board, pulse: number): void;
  /** The link a click at this spot on the board opens. */
  linkAt(uv: THREE.Vector2): string;
}

export function createNoticeBoard(): NoticeBoard3D {
  const group = new THREE.Group();
  group.name = 'notice-board';
  const wood = new THREE.MeshStandardMaterial({ color: 0xc99467, roughness: 0.8 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0xa8774f, roughness: 0.85 });
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
  let rects: { rect: NoteRect; link: string }[] = [];

  function add(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noticeBoard = true;
    // The scene disposes of the board's own materials and texture with it.
    mesh.userData.ownedMaterial = true;
    group.add(mesh);
    return mesh;
  }

  for (const x of [-PANEL_W * 0.36, PANEL_W * 0.36]) add(new THREE.BoxGeometry(0.5, POST_H + PANEL_H * 0.5, 0.5), darkWood, x, (POST_H + PANEL_H * 0.5) / 2, -0.2);
  add(new THREE.BoxGeometry(PANEL_W + 0.6, PANEL_H + 0.6, 0.5), wood, 0, POST_H + PANEL_H / 2, 0);
  const front = add(new THREE.PlaneGeometry(PANEL_W, PANEL_H), face, 0, POST_H + PANEL_H / 2, 0.26);
  front.userData.noticeFace = true;
  // A little roof keeps the rain off the notes.
  const roof = add(new THREE.BoxGeometry(PANEL_W + 1.4, 0.35, 1.4), darkWood, 0, POST_H + PANEL_H + 0.45, 0.2);
  roof.rotation.x = 0.12;

  const slot = document.createElement('div');
  const anchor = new CSS2DObject(slot);
  anchor.position.set(0, POST_H - 0.6, 0.6);
  group.add(anchor);

  function draw(board: Board, pulse: number) {
    ctx.fillStyle = '#e9b97f';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#c48e55';
    for (let i = 0; i < 70; i++) {
      // The same cork speckles every time, so redrawing doesn't make them flicker.
      const x = (i * 97) % CANVAS_W;
      const y = (i * 53 + (i % 7) * 31) % CANVAS_H;
      ctx.fillRect(x, y, 4, 4);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, CANVAS_W - 6, CANVAS_H - 6);

    const notes = board.notes.length
      ? board.notes.map((n) => ({ title: n.title, left: n.left, urgent: n.urgent, link: `/vote?id=${encodeURIComponent(n.id)}` }))
      : [{ title: 'No open votes.', left: 'Start one', urgent: false, link: '/vote' }];
    const placed = noteRects(notes.length);
    rects = [];
    notes.forEach((note, i) => {
      const rect = placed[i]!;
      rects.push({ rect, link: note.link });
      const grow = note.urgent ? 1 + pulse * 0.06 : 1;
      const tilt = ((i % 2 ? 2.5 : -2) * (i > 1 ? -1 : 1) * Math.PI) / 180;
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate(tilt);
      ctx.scale(grow, grow);
      ctx.fillStyle = note.urgent ? '#ff8a8a' : NOTE_COLOURS[i % NOTE_COLOURS.length]!;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff9cc2';
      ctx.beginPath();
      ctx.arc(0, -rect.h / 2 + 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      const size = Math.round(Math.min(rect.h * 0.27, 42));
      ctx.font = `800 ${size}px 'Baloo 2', 'Segoe UI', sans-serif`;
      ctx.textBaseline = 'top';
      lines(ctx, note.title, rect.w - 20).forEach((line, n) => ctx.fillText(line, -rect.w / 2 + 10, -rect.h / 2 + 24 + n * size * 1.02, rect.w - 20));
      ctx.font = `700 ${Math.round(size * 0.85)}px 'Nunito', 'Segoe UI', sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(note.left, -rect.w / 2 + 10, rect.h / 2 - 8, rect.w - 20);
      ctx.restore();
    });

    if (board.more > 0) {
      const label = `+${board.more}`;
      ctx.font = `800 30px 'Baloo 2', sans-serif`;
      const w = ctx.measureText(label).width + 20;
      ctx.fillStyle = '#ffe27a';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W - w - 18, CANVAS_H - 50, w, 38, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, CANVAS_W - w - 8, CANVAS_H - 30);
    }
    texture.needsUpdate = true;
  }

  function linkAt(uv: THREE.Vector2): string {
    const x = uv.x * CANVAS_W;
    const y = (1 - uv.y) * CANVAS_H;
    const hit = rects.find(({ rect }) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
    return hit?.link ?? '/vote';
  }

  return { group, slot, draw, linkAt };
}
