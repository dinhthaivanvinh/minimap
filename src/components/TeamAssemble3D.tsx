import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { TeamUser } from '../../shared/types.ts';
import { heroPose, heroFormation } from '../lib/assembly.ts';
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
      const prop = new THREE.Group();
      prop.position.set(0.95, 0.65, 1.05);
      prop.rotation.z = -0.12;
      inner.add(prop);
      const box = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) => {
        const part = mesh(new THREE.BoxGeometry(w, h, d), color, { x, y, z });
        prop.add(part);
        return part;
      };
      const cylinder = (radius: number, height: number, color: number, x = 0, y = 0, z = 0) => {
        const part = mesh(new THREE.CylinderGeometry(radius, radius, height, 16), color, { x, y, z });
        prop.add(part);
        return part;
      };
      switch (assemblyProp(index)) {
        case 'badge': {
          const badge = cylinder(0.57, 0.12, 0xe6b25b);
          badge.rotation.x = Math.PI / 2;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 128;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#fff0c5';
          ctx.fillRect(0, 0, 128, 128);
          ctx.fillStyle = '#243746';
          ctx.textAlign = 'center';
          ctx.font = '900 44px sans-serif';
          ctx.fillText('#1', 64, 61);
          ctx.font = '900 15px sans-serif';
          ctx.fillText('EMPLOYEE', 64, 86);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          textures.add(texture);
          const labelMat = new THREE.MeshToonMaterial({ map: texture, gradientMap: ramp });
          materials.add(labelMat);
          prop.add(mesh(new THREE.CircleGeometry(0.48, 24), labelMat, { z: 0.07 }));
          break;
        }
        case 'stapler':
          box(0.19, 0.9, 0.2, 0xd5b47e, 0, -0.2);
          box(1.2, 0.22, 0.4, 0x42a8b5, 0, 0.5);
          box(1.2, 0.12, 0.4, 0xe7cfa1, 0, 0.08);
          box(0.17, 0.4, 0.4, 0xe7cfa1, -0.5, 0.28);
          prop.rotation.z = 0.4;
          break;
        case 'box-frame':
          prop.position.set(0, 0.55, 1.1);
          box(2.1, 0.25, 0.32, 0xbf915d, 0, 0.35);
          box(2.1, 0.3, 0.32, 0xbf915d, 0, -0.4);
          box(0.3, 0.8, 0.32, 0xbf915d, -0.9);
          box(0.3, 0.8, 0.32, 0xbf915d, 0.9);
          box(0.4, 0.14, 0.05, 0x7ccbd3, 0, -0.4, 0.19);
          box(0.14, 0.25, 0.04, 0xf5d7a0, 0, 0.35, 0.19);
          break;
        case 'travel-mug':
          cylinder(0.32, 0.85, 0x57bac4);
          cylinder(0.36, 0.12, 0x243746, 0, 0.47);
          box(0.22, 0.4, 0.08, 0xffe5ac, 0, 0, 0.31);
          box(0.3, 0.09, 0.17, 0xe3b160, 0.43, 0.23);
          box(0.09, 0.48, 0.17, 0xe3b160, 0.55);
          box(0.3, 0.09, 0.17, 0xe3b160, 0.43, -0.23);
          break;
        case 'review-axe': {
          cylinder(0.08, 1.5, 0xd6aa70, 0, -0.1);
          const paper = cylinder(0.13, 0.8, 0xfff1d1, 0.3, 0.48);
          paper.rotation.z = Math.PI / 2;
          box(0.55, 0.5, 0.08, 0xfff1d1, 0.35, 0.2);
          for (let line = 0; line < 3; line++)
            box(0.35 - line * 0.07, 0.025, 0.02, 0x61aeb9, 0.35, 0.32 - line * 0.1, 0.055);
          prop.rotation.z = -0.35;
          break;
        }
      }
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
        y: 1.6 * size,
        z: z - 1.8 * size,
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
    let frame = 0;
    const draw = () => {
      const { elapsed, reduced } = latest.current;
      const dolly = reduced ? 1 : Math.min(1, elapsed / 6500),
        angle = reduced ? 0 : -0.16 + dolly * 0.2;
      const distance = cameraDistance * (1.12 - dolly * 0.12);
      camera.position.set(Math.sin(angle) * distance, distance * 0.14 + 1.8, Math.cos(angle) * distance);
      camera.lookAt(0, 1.5, 1.5);
      heroes.forEach((hero, index) => {
        const pose = heroPose(index, heroes.length, elapsed, reduced);
        hero.group.visible = pose.visible;
        hero.group.position.set(hero.x, 0, hero.z - (1 - pose.forward) * 1.8 * hero.size);
        hero.group.scale.setScalar(pose.scale * hero.size);
        hero.inner.scale.z = pose.depthScale;
        hero.inner.rotation.z = (pose.lean * Math.PI) / 180;
        hero.portal.visible = pose.portal > 0.01;
        hero.portal.scale.setScalar(pose.portalScale * hero.size);
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
