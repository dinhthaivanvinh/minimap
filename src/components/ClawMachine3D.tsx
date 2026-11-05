// The picker's claw machine as a three.js cabinet, with the same decorated
// characters as the 3D map. It plays the same planned steps as the 2D view
// (lib/picker.ts), mapped into 3D by lib/picker3d.ts, so switching views during a
// draw keeps the result and the timeline. Loaded only when someone opens it.
import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { TeamUser } from '../../shared/types.ts';
import { BODY_CENTER_Y } from '../lib/drawing.ts';
import { CHUTE, FLOOR_Y, type DrawStep, type TrayLayout } from '../lib/picker.ts';
import {
  characterScale,
  clawPose,
  clawSize,
  ease,
  FRONT_Z,
  lerp,
  OPEN_ANGLE,
  prizePose,
  rowZ,
  SCALE,
  slotPose,
  worldX,
  type Vec,
} from '../lib/picker3d.ts';
import { createCharacterBuilder } from '../map/character3d.ts';
import { theme } from '../styles/theme.ts';

const INK = 0x2a2657;
// Wider than the glass, so the floor and back wall run past the edges of the view.
const WIDTH = 26;
const HEIGHT = 15.6;
const BACK_Z = rowZ(2) - 2.6;
// The floor runs past the bottom of the view.
const FRONT_EDGE = FRONT_Z + 8;
const RAIL_Y = HEIGHT - 0.2;
const CHUTE_LEFT = worldX(CHUTE.left);
const CHUTE_RIGHT = worldX(CHUTE.right);
const CHUTE_HEIGHT = (FLOOR_Y - CHUTE.top) * SCALE;
const FINGER_MS = 250;

const Host = styled.div`
  position: absolute;
  inset: 0;

  canvas { display: block; }
`;

// Name tags fit between neighbours, like in 2D. The glass is the size container, so cqw works here.
const NAME_STYLE: Partial<CSSStyleDeclaration> = {
  maxWidth: 'min(84px, calc(var(--spacing) * 0.9cqw - 2px))',
  padding: '0 4px',
  borderRadius: '6px',
  background: 'rgba(255, 254, 250, .85)',
  color: theme.ink,
  font: `800 max(9px, min(11px, 2.4cqw))/1.3 ${theme.displayFont}`,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export interface ClawMachine3DProps {
  shown: TeamUser[];
  layout: TrayLayout;
  step: DrawStep;
  /** Changes whenever a step starts, so the claw glides to it. */
  stepKey: string;
  /** Changes when a new set of characters should pop into the tray. */
  trayKey: string;
  winnerSlot: number | null;
  /** Jump straight to the step, as when skipping. */
  instant: boolean;
  reduced: boolean;
  onFail: () => void;
}

interface Character {
  group: THREE.Group;
  inner: THREE.Group;
  bodyMaterial: THREE.Material;
  label: CSS2DObject;
  bornAt: number;
}

function popScale(t: number): number {
  if (t <= 0) return 0.001;
  if (t >= 1) return 1;
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

export default function ClawMachine3D(props: ClawMachine3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const root = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      console.error('Could not show the 3D claw machine', error);
      latest.current.onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    root.append(renderer.domElement);
    const onLost = () => latest.current.onFail();
    renderer.domElement.addEventListener('webglcontextlost', onLost);

    const labels = new CSS2DRenderer();
    Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    root.append(labels.domElement);

    // ---- Materials ------------------------------------------------------

    const ramp = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
    const materials = new Map<number, THREE.MeshToonMaterial>();
    const ownMaterials: THREE.Material[] = [];
    const mat = (color: number) => {
      let material = materials.get(color);
      if (!material) {
        material = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
        materials.set(color, material);
      }
      return material;
    };
    const mesh = (geometry: THREE.BufferGeometry, color: number | THREE.Material, { x = 0, y = 0, z = 0, shadow = true } = {}) => {
      const node = new THREE.Mesh(geometry, typeof color === 'number' ? mat(color) : color);
      node.position.set(x, y, z);
      node.castShadow = shadow;
      node.receiveShadow = true;
      return node;
    };
    const buildBody = createCharacterBuilder({ ramp, mat, mesh });

    // ---- Scene ----------------------------------------------------------

    const scene = new THREE.Scene();
    // Looking down steeply enough that each row stands clear of the one in front.
    const camera = new THREE.PerspectiveCamera(31, 4 / 3, 1, 200);
    const target = new THREE.Vector3(-0.5, 3.4, -2.4);
    const elevation = (40 * Math.PI) / 180;
    camera.position.copy(target).add(new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation)).multiplyScalar(31));
    camera.lookAt(target);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc2ff, 2));
    const sun = new THREE.DirectionalLight(0xfff4dc, 1.5);
    sun.position.set(-8, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // The cabinet: floor, back wall, a rail for the claw and the prize chute. The page draws the frame.
    const depth = FRONT_EDGE - BACK_Z;
    const middleZ = (FRONT_EDGE + BACK_Z) / 2;
    scene.add(mesh(new THREE.BoxGeometry(WIDTH, 0.4, depth), 0xffe9b8, { y: -0.2, z: middleZ, shadow: false }));
    scene.add(mesh(new THREE.BoxGeometry(WIDTH, HEIGHT + 0.4, 0.4), 0xdcf1ff, { y: HEIGHT / 2, z: BACK_Z - 0.2, shadow: false }));
    scene.add(mesh(new THREE.BoxGeometry(WIDTH, 0.35, 0.35), 0xdfe3ff, { y: RAIL_Y + 0.2, z: BACK_Z + 0.4, shadow: false }));
    const carriage = mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), 0xffe27a, { y: RAIL_Y - 0.25, shadow: false });
    scene.add(carriage);

    const chuteWidth = CHUTE_RIGHT - CHUTE_LEFT;
    const chuteMiddle = (CHUTE_LEFT + CHUTE_RIGHT) / 2;
    const chuteDepth = 4;
    scene.add(mesh(new THREE.BoxGeometry(chuteWidth, CHUTE_HEIGHT, 0.25), 0xbdf0d2, { x: chuteMiddle, y: CHUTE_HEIGHT / 2, z: FRONT_Z - chuteDepth / 2 }));
    for (const x of [CHUTE_LEFT, CHUTE_RIGHT]) {
      scene.add(mesh(new THREE.BoxGeometry(0.25, CHUTE_HEIGHT, chuteDepth), 0xbdf0d2, { x, y: CHUTE_HEIGHT / 2, z: FRONT_Z }));
    }
    const glass = new THREE.MeshToonMaterial({ color: 0xbdf0d2, gradientMap: ramp, transparent: true, opacity: 0.35, depthWrite: false });
    ownMaterials.push(glass);
    scene.add(mesh(new THREE.BoxGeometry(chuteWidth, CHUTE_HEIGHT * 0.55, 0.15), glass, { x: chuteMiddle, y: CHUTE_HEIGHT * 0.275, z: FRONT_Z + chuteDepth / 2, shadow: false }));
    const sign = document.createElement('div');
    sign.textContent = 'PRIZE';
    Object.assign(sign.style, { ...NAME_STYLE, maxWidth: 'none', letterSpacing: '.08em', border: `2px solid ${theme.ink}` });
    const signObject = new CSS2DObject(sign);
    signObject.position.set(chuteMiddle, CHUTE_HEIGHT + 0.6, FRONT_Z + chuteDepth / 2);
    scene.add(signObject);

    // The claw, built one unit wide with its grip point at the origin, then scaled.
    const claw = new THREE.Group();
    const fingers: THREE.Group[] = [];
    const segment = (from: THREE.Vector3, to: THREE.Vector3, radius: number, color: number) => {
      const part = mesh(new THREE.CapsuleGeometry(radius, from.distanceTo(to), 4, 8), color);
      part.position.copy(from).add(to).multiplyScalar(0.5);
      part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      return part;
    };
    claw.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 20), 0xffe27a, { y: 0.52 }));
    claw.add(mesh(new THREE.SphereGeometry(0.14, 16, 12), 0xb7a6ff, { y: 0.38 }));
    // Two fingers either side, like the 2D claw, and a third reaching from the back.
    for (const angle of [0, Math.PI, Math.PI / 2]) {
      const arm = new THREE.Group();
      arm.rotation.y = angle;
      const finger = new THREE.Group();
      finger.position.set(0.1, 0.36, 0);
      const elbow = new THREE.Vector3(0.25, -0.45, 0);
      finger.add(segment(new THREE.Vector3(), elbow, 0.045, 0xdfe3ff));
      finger.add(segment(elbow, new THREE.Vector3(0.135, -0.535, 0), 0.045, 0xdfe3ff));
      finger.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), INK));
      arm.add(finger);
      claw.add(arm);
      fingers.push(finger);
    }
    const cable = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), INK, { shadow: false });
    scene.add(claw, cable);

    // ---- Characters -----------------------------------------------------

    let characters: Character[] = [];
    let trayKey = '';

    function clearCharacters() {
      for (const character of characters) {
        scene.remove(character.group);
        character.group.traverse((node) => {
          if (node instanceof THREE.Mesh) node.geometry.dispose();
        });
        character.bodyMaterial.dispose();
        character.label.element.remove();
      }
      characters = [];
    }

    function buildCharacters(shown: TeamUser[], layout: TrayLayout, now: number) {
      clearCharacters();
      characters = shown.map((user, i) => {
        const group = new THREE.Group();
        const inner = new THREE.Group();
        group.add(inner);
        const bodyMaterial = buildBody(inner, user);
        const tag = document.createElement('div');
        tag.textContent = user.nickname;
        Object.assign(tag.style, NAME_STYLE);
        const label = new CSS2DObject(tag);
        label.position.set(0, -0.1, 1.4);
        label.center.set(0.5, 0);
        group.add(label);
        const spot = slotPose(layout, i);
        group.position.set(spot.x, spot.y, spot.z);
        scene.add(group);
        return { group, inner, bodyMaterial, label, bornAt: now + i * 35 };
      });
    }

    // ---- Animation ------------------------------------------------------

    const first = latest.current;
    let clawAt: Vec = clawPose(first.step, first.layout);
    let prizeAt: Vec = first.winnerSlot === null ? clawAt : prizePose(first.step, first.layout, first.winnerSlot);
    let openness = first.step.open ? 1 : 0;
    let tween = { key: first.stepKey, start: 0, duration: 0, fromClaw: clawAt, fromPrize: prizeAt, fromOpen: openness };

    function resize() {
      const width = root.clientWidth;
      const height = root.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      labels.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();

    let frame = requestAnimationFrame(function draw(now) {
      frame = requestAnimationFrame(draw);
      const p = latest.current;
      const scale = characterScale(p.layout.size);

      if (p.trayKey !== trayKey) {
        trayKey = p.trayKey;
        root.style.setProperty('--spacing', String(p.layout.spacing));
        // A new draw starts with nobody moving yet; reduced motion skips the pop.
        buildCharacters(p.shown, p.layout, p.reduced ? -Infinity : now);
        if (p.winnerSlot !== null) prizeAt = slotPose(p.layout, p.winnerSlot);
      }
      if (p.stepKey !== tween.key) {
        tween = {
          key: p.stepKey,
          start: now,
          duration: p.instant || p.reduced ? 0 : p.step.duration,
          fromClaw: clawAt,
          fromPrize: prizeAt,
          fromOpen: openness,
        };
      }

      const progress = tween.duration ? (now - tween.start) / tween.duration : 1;
      const eased = ease(p.step.ease, progress);
      clawAt = lerp(tween.fromClaw, clawPose(p.step, p.layout), eased);
      const fingerProgress = tween.duration ? Math.min(1, (now - tween.start) / FINGER_MS) : 1;
      openness = tween.fromOpen + ((p.step.open ? 1 : 0) - tween.fromOpen) * fingerProgress;
      if (p.winnerSlot !== null) {
        prizeAt = p.step.prize === 'claw'
          ? { ...clawAt, y: clawAt.y - BODY_CENTER_Y * scale }
          : lerp(tween.fromPrize, prizePose(p.step, p.layout, p.winnerSlot), eased);
      }

      const size = clawSize(p.layout.size);
      claw.position.set(clawAt.x, clawAt.y, clawAt.z);
      claw.scale.setScalar(size);
      for (const finger of fingers) finger.rotation.z = openness * OPEN_ANGLE;
      carriage.position.set(clawAt.x, RAIL_Y - 0.25, clawAt.z);
      const headTop = clawAt.y + 0.6 * size;
      const cableTop = RAIL_Y - 0.5;
      cable.position.set(clawAt.x, (headTop + cableTop) / 2, clawAt.z);
      cable.scale.y = Math.max(0.01, cableTop - headTop);

      const moving = !p.reduced;
      for (const [i, character] of characters.entries()) {
        const held = i === p.winnerSlot && p.step.prize === 'claw';
        const at = i === p.winnerSlot ? prizeAt : slotPose(p.layout, i);
        character.group.position.set(at.x, at.y, at.z);
        character.group.scale.setScalar(scale * popScale((now - character.bornAt) / 450));
        character.inner.position.y = moving && !held ? Math.max(0, Math.sin(now / 380 + i * 1.7)) * 0.08 : 0;
        character.inner.rotation.z = moving && held ? Math.sin(now / 110) * 0.12 : 0;
      }

      renderer.render(scene, camera);
      labels.render(scene, camera);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      clearCharacters();
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
      });
      for (const material of [...materials.values(), ...ownMaterials]) material.dispose();
      ramp.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    };
  }, []);

  return <Host ref={host} />;
}
