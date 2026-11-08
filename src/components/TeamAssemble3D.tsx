import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { TeamUser } from '../../shared/types.ts';
import { ARRIVAL_MS, FLYBY_CLOSEUP_MS, FLYBY_RETURN_MS, heroPose, heroFormation } from '../lib/assembly.ts';
import { assemblyProp } from '../lib/assemblyProps.ts';
import { createCharacterBuilder, type CharacterTools } from '../map/character3d.ts';

export default function TeamAssemble3D(props: {
  members: TeamUser[];
  elapsed: number;
  reduced: boolean;
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const root = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      latest.current.onFail();
      return;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    root.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    Object.assign(labels.domElement.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    root.appendChild(labels.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050a10');
    scene.fog = new THREE.Fog('#050a10', 22, 85);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    scene.add(new THREE.HemisphereLight(0x9dcddd, 0x05070b, 0.75));
    const sun = new THREE.DirectionalLight(0xc3e9fa, 2.2);
    sun.position.set(-5, 12, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 20, bottom: -20 });
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xff702e, 4);
    rim.position.set(8, 6, -8);
    scene.add(rim);
    const cyan = new THREE.DirectionalLight(0x33c8f1, 2.5);
    cyan.position.set(-10, 4, 0);
    scene.add(cyan);
    const ramp = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    textures.add(ramp);
    const colors = new Map<number, THREE.Material>();
    const mat = (color: number) => {
      let m = colors.get(color);
      if (!m) {
        m = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
        colors.set(color, m);
        materials.add(m);
      }
      return m;
    };
    const mesh: CharacterTools['mesh'] = (geometry, color, { x = 0, y = 0, z = 0, shadow = true } = {}) => {
      const m = new THREE.Mesh(geometry, typeof color === 'number' ? mat(color) : color);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      return m;
    };
    const build = createCharacterBuilder({ ramp, mat, mesh });
    // Shared by every hero with the same glow hue, so large teams don't multiply materials.
    const glowMats = new Map<number, THREE.MeshBasicMaterial>();
    const glowMaterial = (color: number) => {
      let m = glowMats.get(color);
      if (!m) {
        m = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        glowMats.set(color, m);
        materials.add(m);
      }
      return m;
    };
    // Unlit canvas faces (backlit keys, a glowing screen), painted once per hue.
    const screenMats = new Map<string, THREE.MeshBasicMaterial>();
    const screenMaterial = (key: string, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
      let m = screenMats.get(key);
      if (!m) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        paint(canvas.getContext('2d')!);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        textures.add(texture);
        m = new THREE.MeshBasicMaterial({ map: texture });
        screenMats.set(key, m);
        materials.add(m);
      }
      return m;
    };
    const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
    // A soft radial falloff for the landing flash; an untextured sprite is a hard-edged square.
    const softGlow = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, '#ffffffff');
      gradient.addColorStop(0.35, '#ffffff99');
      gradient.addColorStop(1, '#ffffff00');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      textures.add(texture);
      return texture;
    })();
    // The doorway stands this far (× hero size) behind the hero's final spot. Heroes start
    // ENTRY_DEPTH back, fully behind it (body radius 1.35 plus gear), and walk through.
    const PORTAL_BEHIND = 1.8,
      ENTRY_DEPTH = 3.8,
      // Wide enough for the body and most of the gear to pass inside the ring.
      PORTAL_SCALE = 1.3;
    const span = Math.max(14, Math.min(32, props.members.length * 2.8)),
      depth = 14;
    const floor = mesh(
      new THREE.CylinderGeometry(Math.max(span, depth) * 0.7, Math.max(span, depth) * 0.72, 0.3, 64),
      (() => {
        const m = new THREE.MeshStandardMaterial({ color: 0x101821, roughness: 0.28, metalness: 0.55 });
        materials.add(m);
        return m;
      })(),
      { y: -0.2 },
    );
    floor.scale.z = 0.75;
    floor.castShadow = false;
    scene.add(floor);
    for (let i = -7; i <= 7; i++) {
      const h = 5 + ((i * i + 7) % 10);
      scene.add(
        mesh(new THREE.BoxGeometry(2.3, h, 2), 0x0b1420, { x: i * 2.8, y: h / 2, z: -depth / 2 - 6 }),
      );
      for (let y = 1; y < h; y += 1.4)
        scene.add(
          mesh(new THREE.BoxGeometry(0.6, 0.22, 0.05), 0x557780, { x: i * 2.8, y, z: -depth / 2 - 4.97 }),
        );
    }
    for (const side of [-1, 1]) {
      const m = new THREE.MeshBasicMaterial({
        color: side < 0 ? 0x84e7cf : 0xffdf93,
        transparent: true,
        opacity: 0.028,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      materials.add(m);
      const beam = mesh(new THREE.ConeGeometry(4, 18, 32, 1, true), m, {
        x: side * (span / 2 + 1),
        y: 7,
        z: -depth / 2,
      });
      beam.rotation.z = side * 0.28;
      beam.castShadow = false;
      beam.receiveShadow = false;
      scene.add(beam);
    }
    const heroes = props.members.map((user, index) => {
      const formation = heroFormation(index, props.members.length);
      const size = formation.scale * 1.15;
      const x = (formation.x - 0.5) * span,
        z = (formation.y - 0.68) * 24;
      const group = new THREE.Group(),
        inner = new THREE.Group();
      group.add(inner);
      materials.add(build(inner, user));
      // Weapons sit at the hero's sides and rise past the silhouette, so a head-on close-up
      // shows both the face and the gear.
      const prop = new THREE.Group();
      inner.add(prop);
      const glowColor = index % 2 ? 0xff8a3d : 0x4cd8ff;
      const glowMat = glowMaterial(glowColor);
      const STEEL = 0x2b3440,
        GUNMETAL = 0x3a4552,
        GOLD = 0xe0a94a,
        INK = 0x1a2230;
      const solid = (
        geometry: THREE.BufferGeometry,
        color: number | THREE.Material,
        x = 0,
        y = 0,
        z = 0,
        parent: THREE.Object3D = prop,
      ) => {
        const part = mesh(geometry, color, { x, y, z });
        parent.add(part);
        return part;
      };
      const box = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, parent?: THREE.Object3D) =>
        solid(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);
      const rod = (radius: number, length: number, color: number, x = 0, y = 0, z = 0) =>
        solid(new THREE.CylinderGeometry(radius, radius, length, 12), color, x, y, z);
      const glow = (geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0, parent: THREE.Object3D = prop) => {
        const part = mesh(geometry, glowMat, { x, y, z, shadow: false });
        part.receiveShadow = false;
        parent.add(part);
        return part;
      };
      let spinner: THREE.Object3D | null = null;
      switch (assemblyProp(index)) {
        case 'rubber-duck': {
          // A giant debug duck in sunglasses, hoisted on a glowing aura. It faces the camera
          // (+z) so the shades sit across its eyes in the head-on close-up.
          prop.position.set(1.55, 1.35, 0.4);
          prop.rotation.set(0, -0.35, 0.08);
          const DUCK = 0xffd23f;
          solid(new THREE.SphereGeometry(0.45, 16, 12), DUCK).scale.set(1, 0.85, 1.25);
          solid(new THREE.SphereGeometry(0.3, 16, 12), DUCK, 0, 0.5, 0.28);
          solid(new THREE.ConeGeometry(0.06, 0.3, 6), DUCK, 0, 0.22, -0.62).rotation.x = -0.9;
          for (const side of [-1, 1])
            solid(new THREE.SphereGeometry(0.28, 12, 8), 0xf2bf1d, side * 0.38, 0.02, -0.05).scale.set(0.4, 0.6, 1.2);
          solid(new THREE.SphereGeometry(0.16, 12, 8), 0xff8a1f, 0, 0.42, 0.6).scale.set(0.9, 0.42, 1.2);
          // Shades: two lenses on the face, a bridge, and arms running back over the head.
          for (const side of [-1, 1]) {
            box(0.17, 0.11, 0.05, INK, side * 0.11, 0.58, 0.55);
            box(0.03, 0.03, 0.28, INK, side * 0.27, 0.6, 0.42);
          }
          box(0.08, 0.025, 0.03, INK, 0, 0.6, 0.57);
          glow(new THREE.BoxGeometry(0.07, 0.02, 0.01), -0.14, 0.61, 0.58);
          glow(new THREE.TorusGeometry(0.62, 0.03, 8, 32), 0, -0.45).rotation.x = Math.PI / 2;
          break;
        }
        case 'toilet-plunger': {
          // A plunger carried like a lance, cup up, its rim humming with power.
          prop.position.set(-1.5, 0.25, 0.4);
          prop.rotation.set(0, 0, 0.15);
          rod(0.065, 2.4, 0xa86b3c, 0, 1.3);
          rod(0.08, 0.22, GOLD, 0, 0.35);
          const cup = solid(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xc8322b, 0, 2.75);
          cup.rotation.x = Math.PI;
          solid(new THREE.CircleGeometry(0.41, 24), 0x7d1a16, 0, 2.74).rotation.x = -Math.PI / 2;
          glow(new THREE.TorusGeometry(0.42, 0.035, 8, 32), 0, 2.75).rotation.x = Math.PI / 2;
          break;
        }
        case 'coffee-bazooka': {
          // A shoulder-mounted launcher made from a giant travel mug, steam venting at the lid.
          prop.position.set(1.15, 1.75, 0.15);
          prop.rotation.set(0, -0.3, 0.12);
          rod(0.26, 1.6, 0x57bac4, 0.6).rotation.z = Math.PI / 2;
          rod(0.27, 0.22, 0xeef0f2, 0.25).rotation.z = Math.PI / 2;
          rod(0.29, 0.18, 0x243746, 1.45).rotation.z = Math.PI / 2;
          box(0.3, 0.14, 0.14, STEEL, 0.6, 0.32);
          box(0.14, 0.42, 0.18, 0x1b2027, 0.35, -0.36);
          glow(new THREE.TorusGeometry(0.2, 0.035, 8, 24), 1.56).rotation.y = Math.PI / 2;
          for (const [dy, s] of [
            [0.25, 0.09],
            [0.45, 0.07],
            [0.62, 0.05],
          ] as const)
            glow(new THREE.TorusGeometry(s, 0.02, 6, 16), 1.6 + dy * 0.3, dy);
          break;
        }
        case 'sticky-shuriken': {
          // Four sticky notes folded into a throwing star, spinning in the hero's hand.
          prop.position.set(1.5, 1.05, 0.65);
          const star = new THREE.Group();
          prop.add(star);
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2;
            const note = box(0.42, 0.42, 0.02, k % 2 ? 0xff8fb1 : 0xffe066, Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0, star);
            note.rotation.z = a + Math.PI / 4;
          }
          solid(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), GOLD, 0, 0, 0.03, star).rotation.x = Math.PI / 2;
          glow(new THREE.TorusGeometry(0.14, 0.025, 8, 24), 0, 0, 0.04, star);
          spinner = star;
          break;
        }
        case 'keyboard-blade': {
          // A greatsword whose blade is a backlit keyboard, raised past the hero's head.
          prop.position.set(-1.5, 0.75, 0.35);
          prop.rotation.set(0, 0.2, 0.2);
          rod(0.09, 0.62, 0x3a2a22, 0, -0.2);
          solid(new THREE.SphereGeometry(0.13, 12, 8), GOLD, 0, -0.55);
          box(1.0, 0.16, 0.24, STEEL, 0, 0.18);
          glow(new THREE.BoxGeometry(0.8, 0.035, 0.02), 0, 0.18, 0.13);
          box(0.44, 2.5, 0.14, 0x1e2630, 0, 1.51);
          const keys = screenMaterial(`keys-${glowColor}`, 64, 384, (ctx) => {
            ctx.fillStyle = '#141b24';
            ctx.fillRect(0, 0, 64, 384);
            for (let row = 0; row < 16; row++)
              for (let col = 0; col < 2; col++) {
                ctx.fillStyle = (row + col * 2) % 5 === 0 ? cssColor(glowColor) : '#d9e1ea';
                ctx.fillRect(6 + col * 28, 6 + row * 23.5, 24, 19);
              }
          });
          solid(new THREE.PlaneGeometry(0.38, 2.4), keys, 0, 1.51, 0.075);
          const tip = solid(new THREE.ConeGeometry(0.31, 0.5, 4), 0x1e2630, 0, 3.0);
          tip.rotation.y = Math.PI / 4;
          tip.scale.z = 0.32;
          // Edge glow continues up both slanted faces of the tip (base half-width 0.22, rising
          // 0.5 to the point), so the dark point still reads against the night sky.
          const slant = Math.atan2(0.22, 0.5),
            slantLength = Math.hypot(0.22, 0.5);
          for (const side of [-1, 1]) {
            glow(new THREE.BoxGeometry(0.03, 2.5, 0.03), side * 0.225, 1.51);
            glow(new THREE.BoxGeometry(0.035, slantLength, 0.16), side * 0.11, 3.0).rotation.z = side * slant;
          }
          break;
        }
        case 'staple-cannon': {
          // An arm-mounted cannon: the stapler is the receiver, feeding a coil-wrapped barrel.
          prop.position.set(1.3, 1.05, 0.55);
          prop.rotation.set(0, -0.35, 0.3);
          box(1.2, 0.42, 0.5, STEEL, 0.5);
          box(1.35, 0.18, 0.46, 0x2c9aa8, 0.55, 0.3);
          box(0.55, 0.12, 0.52, 0xc9d3dc, 0.45, 0.16);
          box(0.22, 0.55, 0.3, 0x1b2027, 0.15, -0.42);
          rod(0.17, 0.95, GUNMETAL, 1.5).rotation.z = Math.PI / 2;
          for (const at of [1.2, 1.45, 1.7]) glow(new THREE.TorusGeometry(0.23, 0.035, 8, 24), at).rotation.y = Math.PI / 2;
          glow(new THREE.SphereGeometry(0.15, 12, 8), 2.0);
          glow(new THREE.BoxGeometry(0.95, 0.04, 0.02), 0.5, 0.02, 0.26);
          break;
        }
        case 'monitor-shield': {
          // A tower shield cut from a monitor, its screen flashing a reassuring error.
          prop.position.set(-1.5, 0.95, 1.05);
          prop.rotation.set(0, 0.6, 0.06);
          box(1.5, 1.15, 0.16, 0x20262e);
          const screen = screenMaterial(`screen-${glowColor}`, 256, 192, (ctx) => {
            ctx.fillStyle = '#0d1a2a';
            ctx.fillRect(0, 0, 256, 192);
            ctx.fillStyle = '#ffffff10';
            for (let y = 0; y < 192; y += 6) ctx.fillRect(0, y, 256, 2);
            ctx.fillStyle = cssColor(glowColor);
            ctx.textAlign = 'center';
            ctx.font = '900 76px Impact, sans-serif';
            ctx.fillText('404', 128, 104);
            ctx.font = '900 22px sans-serif';
            ctx.fillText('FEAR NOT FOUND', 128, 146);
          });
          solid(new THREE.PlaneGeometry(1.32, 0.97), screen, 0, 0, 0.085);
          for (const y of [-0.6, 0.6]) glow(new THREE.BoxGeometry(1.4, 0.035, 0.02), 0, y, 0.09);
          for (const side of [-1, 1]) {
            solid(new THREE.ConeGeometry(0.1, 0.38, 6), STEEL, side * 0.45, -0.75).rotation.z = Math.PI;
            for (const y of [-0.5, 0.5]) solid(new THREE.SphereGeometry(0.05, 8, 6), GOLD, side * 0.69, y, 0.09);
          }
          break;
        }
        case 'deadline-scythe': {
          // A scythe crowned with a ticking clock: the deadline, weaponized.
          prop.position.set(1.45, 0.1, -0.25);
          prop.rotation.set(0, 0, -0.12);
          rod(0.07, 3.3, 0x2a2f38, 0, 1.65);
          for (const at of [0.4, 1.15]) rod(0.095, 0.14, GOLD, 0, at);
          // Crescent: outer arc sweeps from the staff top outward and down to the tip.
          const crescent = new THREE.Shape();
          crescent.absarc(0, 1.95, 1.3, Math.PI * 0.5, Math.PI * 0.05, true);
          crescent.absarc(0.15, 1.85, 1.22, Math.PI * 0.08, Math.PI * 0.5, false);
          solid(new THREE.ExtrudeGeometry(crescent, { depth: 0.06, bevelEnabled: false }), 0xa9bccb, 0, 0, -0.03);
          glow(new THREE.TorusGeometry(1.3, 0.03, 6, 32, Math.PI * 0.45), 0, 1.95).rotation.z = Math.PI * 0.05;
          rod(0.34, 0.12, GOLD, 0, 3.3).rotation.x = Math.PI / 2;
          solid(new THREE.CircleGeometry(0.28, 24), 0xf3ead7, 0, 3.3, 0.065);
          box(0.035, 0.2, 0.02, INK, 0, 3.4, 0.075);
          box(0.14, 0.035, 0.02, INK, 0.07, 3.3, 0.075);
          glow(new THREE.TorusGeometry(0.4, 0.03, 8, 32), 0, 3.3);
          break;
        }
        case 'mouse-flail': {
          // A flail on its own glowing cable, the mouse studded with spikes.
          prop.position.set(1.35, 0.55, 0.75);
          prop.rotation.set(0, 0, -0.1);
          rod(0.08, 0.75, STEEL);
          rod(0.11, 0.12, GOLD, 0, 0.4);
          const cable = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0.45, 0),
            new THREE.Vector3(0.05, 1.0, 0.03),
            new THREE.Vector3(0.3, 1.5, 0.08),
            new THREE.Vector3(0.65, 1.55, 0.1),
          ]);
          glow(new THREE.TubeGeometry(cable, 24, 0.03, 6, false));
          // The mouse's nose points back along the cable toward the handle.
          const head = new THREE.Group();
          head.position.set(1.05, 1.55, 0.1);
          head.rotation.z = Math.PI / 2;
          prop.add(head);
          solid(new THREE.SphereGeometry(0.4, 16, 12), 0xd7dde4, 0, 0, 0, head).scale.set(0.75, 1, 0.55);
          box(0.02, 0.32, 0.02, INK, 0, 0.2, 0.2, head);
          glow(new THREE.BoxGeometry(0.07, 0.14, 0.05), 0, 0.22, 0.2, head);
          const up = new THREE.Vector3(0, 1, 0);
          for (const [dx, dy, dz] of [
            [1, 0, 0],
            [-1, 0, 0],
            [0, -1, 0],
            [0.7, -0.7, 0],
            [-0.7, -0.7, 0],
            [0.7, 0.3, 0.5],
            [-0.7, 0.3, 0.5],
            [0, -0.4, 0.9],
            [0.6, 0, -0.8],
            [-0.6, 0, -0.8],
          ] as const) {
            const dir = new THREE.Vector3(dx, dy, dz).normalize();
            const spike = solid(
              new THREE.ConeGeometry(0.06, 0.26, 6),
              STEEL,
              dir.x * 0.3 + dir.x * 0.13,
              dir.y * 0.4 + dir.y * 0.13,
              dir.z * 0.22 + dir.z * 0.13,
              head,
            );
            spike.quaternion.setFromUnitVectors(up, dir);
          }
          break;
        }
      }
      // The portal is a real doorway: whatever is still behind its plane is cut away, so the
      // hero steps out of it rather than popping in whole. Every hero needs its own plane, so
      // its materials are cloned (the shared ones would cut every hero at the same depth).
      const portalZ = z - PORTAL_BEHIND * size;
      const doorway = new THREE.Plane(new THREE.Vector3(0, 0, 1), -portalZ);
      const clipped = new Map<THREE.Material, THREE.Material>();
      inner.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const original = node.material as THREE.Material;
        let clone = clipped.get(original);
        if (!clone) {
          clone = original.clone();
          clone.clippingPlanes = [doorway];
          clone.clipShadows = true;
          clipped.set(original, clone);
          materials.add(clone);
        }
        node.material = clone;
      });
      scene.add(group);
      const tag = document.createElement('div');
      tag.textContent = user.nickname || user.username;
      tag.dataset.assemblyMember = user.username;
      Object.assign(tag.style, {
        maxWidth: '100px',
        padding: '3px 6px',
        borderRadius: '6px',
        background: '#0a1624e6',
        color: '#d7f5e8',
        font: '800 11px/1.25 sans-serif',
        textAlign: 'center',
        overflowWrap: 'anywhere',
      });
      const label = new CSS2DObject(tag);
      label.position.set(0, -0.1, 0.15);
      label.center.set(0.5, 0);
      group.add(label);
      const portalMat = new THREE.MeshBasicMaterial({
        color: 0xffa34f,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      materials.add(portalMat);
      const portal = mesh(new THREE.TorusGeometry(1.75, 0.06, 10, 80), portalMat, {
        x,
        y: 1.75 * size,
        z: portalZ,
      });
      portal.castShadow = false;
      portal.receiveShadow = false;
      scene.add(portal);
      const shimmerMat = new THREE.MeshBasicMaterial({
        color: index % 2 ? 0x9a5629 : 0x236e91,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      materials.add(shimmerMat);
      const shimmer = mesh(new THREE.CircleGeometry(1.68, 64), shimmerMat, { shadow: false });
      shimmer.receiveShadow = false;
      portal.add(shimmer);
      const accentMat = new THREE.MeshBasicMaterial({
        color: 0x79deee,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      materials.add(accentMat);
      const rings = [new THREE.Group(), new THREE.Group()];
      rings.forEach((ring, layer) => {
        const radius = layer === 0 ? 1.47 : 1.94;
        const ringMat = layer === 0 ? accentMat : portalMat;
        const hoop = mesh(new THREE.TorusGeometry(radius, 0.018, 6, 64), ringMat, { shadow: false });
        hoop.receiveShadow = false;
        ring.add(hoop);
        for (let tick = 0; tick < 24; tick++) {
          const a = (tick / 24) * Math.PI * 2;
          const mark = mesh(new THREE.BoxGeometry(0.035, tick % 3 === 0 ? 0.16 : 0.08, 0.02), ringMat, {
            x: Math.cos(a) * radius,
            y: Math.sin(a) * radius,
            shadow: false,
          });
          mark.rotation.z = a - Math.PI / 2;
          mark.receiveShadow = false;
          ring.add(mark);
        }
        portal.add(ring);
      });
      const sparks = new Float32Array(80 * 3);
      for (let j = 0; j < 80; j++) {
        const a = (j / 80) * Math.PI * 2,
          r = 1.75 + ((j * 17) % 13) * 0.025;
        sparks.set([Math.cos(a) * r, Math.sin(a) * r, 0], j * 3);
      }
      const sparkGeo = new THREE.BufferGeometry();
      sparkGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(sparks, 3).setUsage(THREE.DynamicDrawUsage),
      );
      sparkGeo.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(80 * 3), 3).setUsage(THREE.DynamicDrawUsage),
      );
      const sparkMat = new THREE.PointsMaterial({
        color: 0xffffff,
        vertexColors: true,
        size: 0.075,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      materials.add(sparkMat);
      portal.add(new THREE.Points(sparkGeo, sparkMat));
      const impactMat = new THREE.MeshBasicMaterial({
        color: 0xffb46b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      materials.add(impactMat);
      const impact = mesh(new THREE.RingGeometry(0.85, 1, 64), impactMat, { x, y: 0.015, z });
      impact.rotation.x = -Math.PI / 2;
      impact.castShadow = false;
      impact.receiveShadow = false;
      scene.add(impact);
      const flashMat = new THREE.SpriteMaterial({
        map: softGlow,
        color: 0xfff3d6,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      materials.add(flashMat);
      const flash = new THREE.Sprite(flashMat);
      flash.scale.setScalar(2.6);
      flash.position.set(0, 1.3, 0);
      group.add(flash);
      return {
        group,
        inner,
        portal,
        portalMat,
        shimmerMat,
        sparkMat,
        sparkGeo,
        accentMat,
        rings,
        impact,
        impactMat,
        flashMat,
        label,
        spinner,
        size,
        x,
        z,
      };
    });
    let cameraDistance = 24;
    const resize = () => {
      const w = root.clientWidth,
        h = root.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      labels.setSize(w, h);
      camera.aspect = w / h;
      const distance = Math.max(22, span / (2 * Math.tan(Math.PI / 9) * camera.aspect) + 4);
      cameraDistance = distance;
      camera.far = distance + 100;
      camera.position.set(0, distance * 0.14 + 1.8, distance);
      camera.lookAt(0, 1.5, 0);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    const lost = (event: Event) => {
      event.preventDefault();
      latest.current.onFail();
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    const smoothstep = (v: number) => v * v * (3 - 2 * v);
    // Every hero gets a close-up; assemblyMs() stretches the timeline to fit them all.
    const flybyVisits = heroes.length;
    const flybySegments = flybyVisits + 1; // wide -> hero -> hero -> ... -> wide
    const flybySpan = flybyVisits * FLYBY_CLOSEUP_MS + FLYBY_RETURN_MS;
    const wideShot = () => {
      const angle = 0.04,
        distance = cameraDistance;
      return {
        pos: new THREE.Vector3(Math.sin(angle) * distance, distance * 0.14 + 1.8, Math.cos(angle) * distance),
        look: new THREE.Vector3(0, 1.5, 1.5),
      };
    };
    // Close-ups sweep the lineup left to right rather than zig-zagging in roster order.
    const leftToRight = heroes.map((_, index) => index).sort((a, b) => heroes[a]!.x - heroes[b]!.x);
    const visitHero = (visitSlot: number) => leftToRight[Math.min(visitSlot, heroes.length - 1)]!;
    // Head-on, from slightly below eye level for a heroic angle. Distance scales with the body
    // sphere (BODY_RADIUS 1.35, see src/lib/drawing.ts) so the face and gear both fit; `push`
    // is the slow dolly-in while the shot lingers.
    const CLOSE_DISTANCE = 6.4;
    const heroShot = (visitSlot: number, push: number) => {
      const hero = heroes[visitHero(visitSlot)]!;
      const distance = CLOSE_DISTANCE * hero.size * (1 - push * 0.14);
      return {
        pos: new THREE.Vector3(hero.x, 1.0 * hero.size + 0.35, hero.z + distance),
        look: new THREE.Vector3(hero.x, 1.35 * hero.size, hero.z),
      };
    };
    // Heroes standing between the head-on camera and the focused hero, inside the frame. They
    // step out of the shot (a standard close-up cheat) rather than blocking the face.
    const occludersOf = (focus: number) => {
      const target = heroes[focus]!;
      const cameraZ = target.z + CLOSE_DISTANCE * target.size;
      const halfWidthPerDepth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      const hidden = new Set<number>();
      heroes.forEach((other, index) => {
        if (index === focus || other.z <= target.z + 0.1 || other.z >= cameraZ) return;
        const halfWidth = (cameraZ - other.z) * halfWidthPerDepth;
        if (Math.abs(other.x - target.x) < halfWidth + 1.6 * other.size) hidden.add(index);
      });
      return hidden;
    };
    let frame = 0;
    const draw = () => {
      const { elapsed, reduced } = latest.current;
      let focus = -1;
      let hidden: Set<number> | null = null;
      for (const m of glowMats.values()) m.opacity = reduced ? 0.95 : 0.78 + 0.2 * Math.sin(elapsed / 170);
      if (!reduced && elapsed >= ARRIVAL_MS && flybySegments > 0) {
        // The finale's slow-motion close-up pass: fly in on each hero for FLYBY_CLOSEUP_MS,
        // linger with a gentle drift, then ease back out to the wide shot for a clean landing
        // frame over FLYBY_RETURN_MS.
        const t = Math.min(flybySpan, elapsed - ARRIVAL_MS);
        const closeupsEnd = flybyVisits * FLYBY_CLOSEUP_MS;
        const isReturn = t >= closeupsEnd;
        const segIndex = isReturn
          ? flybySegments - 1
          : Math.min(flybyVisits - 1, Math.floor(t / FLYBY_CLOSEUP_MS));
        const segDuration = isReturn ? FLYBY_RETURN_MS : FLYBY_CLOSEUP_MS;
        const segElapsed = isReturn ? t - closeupsEnd : t - segIndex * FLYBY_CLOSEUP_MS;
        const segT = segDuration > 0 ? Math.min(1, segElapsed / segDuration) : 1;
        const ease = segT < 0.6 ? smoothstep(segT / 0.6) : 1;
        // Fly in over the first 60%, then a slow push-in while the shot lingers.
        const push = !isReturn && segT > 0.6 ? smoothstep((segT - 0.6) / 0.4) : 0;
        // The previous shot ended fully pushed in, so start from there to avoid a jump.
        const from = segIndex === 0 ? wideShot() : heroShot(segIndex - 1, 1);
        const to = isReturn ? wideShot() : heroShot(segIndex, push);
        camera.position.copy(from.pos.lerp(to.pos, ease));
        camera.lookAt(from.look.lerp(to.look, ease));
        // Swap occluders at the midpoint of the flight, where camera motion hides the pop.
        const fromFocus = segIndex === 0 ? -1 : visitHero(segIndex - 1);
        const toFocus = isReturn ? -1 : visitHero(segIndex);
        focus = ease >= 0.5 ? toFocus : fromFocus;
        if (focus >= 0) hidden = occludersOf(focus);
      } else {
        const dolly = reduced ? 1 : Math.min(1, elapsed / ARRIVAL_MS),
          baseAngle = reduced ? 0 : -0.16 + dolly * 0.2;
        // In the last beat before the finale cut, swing the camera around faster, fading back
        // to the settled framing exactly at the cut so there's no jump once it lands.
        const sweepStart = ARRIVAL_MS - 1500,
          sweepEnd = ARRIVAL_MS;
        let sweep = 0;
        if (!reduced && elapsed > sweepStart && elapsed < sweepEnd) {
          const sweepT = (elapsed - sweepStart) / (sweepEnd - sweepStart);
          sweep = Math.sin(sweepT * Math.PI * 2.5) * (1 - sweepT) * 0.55;
        }
        const angle = baseAngle + sweep;
        const distance = cameraDistance * (1.12 - dolly * 0.12);
        camera.position.set(Math.sin(angle) * distance, distance * 0.14 + 1.8, Math.cos(angle) * distance);
        camera.lookAt(0, 1.5, 1.5);
      }
      heroes.forEach((hero, index) => {
        const pose = heroPose(index, heroes.length, elapsed, reduced);
        hero.group.visible = pose.visible && !hidden?.has(index);
        // CSS2D labels draw over everything and can't be cut by the doorway, so they wait until
        // the hero is mostly through it; during a close-up only the focused name shows.
        hero.label.visible = pose.emerge > 0.6 && (focus < 0 || index === focus);
        if (hero.spinner) hero.spinner.rotation.z = reduced ? 0 : -elapsed / 110;
        // Impact^2 sharpens the shake/flash to a snappy burst right at the landing peak.
        const punch = reduced ? 0 : pose.impact * pose.impact;
        const shakeX = punch ? Math.sin(pose.progress * 180 + index * 11) * punch * 0.18 * hero.size : 0;
        const shakeZ = punch ? Math.cos(pose.progress * 150 + index * 5) * punch * 0.12 * hero.size : 0;
        hero.group.position.set(
          hero.x + shakeX,
          0,
          hero.z - (1 - pose.forward) * ENTRY_DEPTH * hero.size + shakeZ,
        );
        hero.flashMat.opacity = pose.impact ** 3;
        hero.group.scale.setScalar(pose.scale * hero.size);
        hero.inner.rotation.z = (pose.lean * Math.PI) / 180;
        hero.portal.visible = pose.portal > 0.01;
        hero.portal.scale.setScalar(pose.portalScale * hero.size * PORTAL_SCALE);
        hero.portalMat.opacity = pose.portal * 0.95;
        hero.shimmerMat.opacity = pose.portal * (0.18 + Math.sin(pose.progress * Math.PI * 12) * 0.06);
        hero.sparkMat.opacity = pose.portal;
        hero.accentMat.opacity = pose.portal * 0.8;
        hero.rings[0]!.rotation.z = -pose.portalRotation * 1.8;
        hero.rings[1]!.rotation.z = pose.portalRotation * 0.5;
        if (pose.portal && !reduced) {
          const positions = hero.sparkGeo.getAttribute('position');
          const colors = hero.sparkGeo.getAttribute('color');
          for (let spark = 0; spark < positions.count; spark++) {
            const life = (pose.progress * 4 + spark * 0.618) % 1;
            const angle = (spark / positions.count) * Math.PI * 2;
            const radius = 1.75 + life * 0.7;
            positions.setXYZ(spark, Math.cos(angle) * radius, Math.sin(angle) * radius + life * 0.18, 0.03);
            const fade = Math.sin(life * Math.PI) * (1 - life);
            colors.setXYZ(spark, fade, fade * 0.6, fade * 0.22);
          }
          positions.needsUpdate = colors.needsUpdate = true;
        }
        hero.impactMat.opacity = pose.impact * 0.7;
        hero.impact.scale.setScalar(1 + (1 - pose.impact) * 3);
        hero.portal.rotation.z = pose.portalRotation + index;
      });
      renderer.render(scene, camera);
      labels.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Points) geometries.add(node.geometry);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labels.domElement.remove();
    };
  }, [props.members]);
  return (
    <div ref={host} role="img" aria-label="3D team assembly" style={{ position: 'absolute', inset: 0 }} />
  );
}
