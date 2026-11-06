// A vote's results as a small 3D skyline: one tower per option, as tall as its votes, the
// winner on a gold top once the vote closes. Towers grow smoothly as votes come in and the
// camera slowly circles. Loaded with lazy(); VoteCard shows the bars when 3D can't run.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import styled from 'styled-components';
import type { VoteView } from '../../shared/vote.ts';
import { watchContextLoss } from '../lib/contextLoss.ts';
import { skylineTowers, TOWER_GAP, type Tower } from '../lib/skyline.ts';
import { theme } from '../styles/theme.ts';

const Stage = styled.div`
  position: relative;
  height: 260px;
  overflow: hidden;
  border: ${theme.thinLine};
  border-radius: 14px;
  background: linear-gradient(#cdebff, #f3fbff);

  canvas { display: block; }
`;

const COLOURS = [0xff9cc2, 0x8fddf5, 0xbdf0d2, 0xb7a6ff, 0xffb38a];

interface Built {
  body: THREE.Mesh;
  cap: THREE.Mesh;
  label: CSS2DObject;
  height: number;
  target: number;
}

export default function VoteSkyline3D({ vote, closed, onFail }: { vote: VoteView; closed: boolean; onFail: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const update = useRef<(towers: Tower[]) => void>(() => {});
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  useEffect(() => {
    const stage = stageRef.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    stage.append(renderer.domElement);
    const stopWatching = watchContextLoss(renderer.domElement, () => onFailRef.current());
    const labels = new CSS2DRenderer();
    Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    stage.append(labels.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc2ff, 2));
    const sun = new THREE.DirectionalLight(0xfff4dc, 1.4);
    sun.position.set(6, 12, 8);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0xbdf0d2 }));
    ground.position.y = -0.15;
    scene.add(ground);

    const ink = new THREE.MeshStandardMaterial({ color: 0x2a2657 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0x6b4a00, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.4 });
    const towers = new Map<string, Built>();
    let width = TOWER_GAP;

    function build(next: Tower[]) {
      next.forEach((tower, i) => {
        let built = towers.get(tower.id);
        if (!built) {
          const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.6), new THREE.MeshStandardMaterial({ color: COLOURS[i % COLOURS.length]! }));
          const cap = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.8), ink);
          const element = document.createElement('div');
          Object.assign(element.style, {
            padding: '0 6px',
            border: `2px solid ${theme.ink}`,
            borderRadius: '8px',
            background: theme.paper,
            font: `800 12px/1.3 ${theme.displayFont}`,
            whiteSpace: 'nowrap',
            maxWidth: '110px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          });
          const label = new CSS2DObject(element);
          scene.add(body, cap, label);
          built = { body, cap, label, height: reduced ? tower.height : 0.01, target: tower.height };
          towers.set(tower.id, built);
        }
        built.target = tower.height;
        built.body.position.x = built.cap.position.x = built.label.position.x = tower.x;
        built.label.position.set(tower.x, 0, 1.3);
        built.label.element.textContent = `${tower.label} · ${tower.count}`;
        built.cap.material = tower.gold ? gold : ink;
      });
      width = Math.max(TOWER_GAP * 2, next.length * TOWER_GAP);
      ground.scale.set(width / 2 + 1.5, 1, width / 2 + 1.5);
    }
    update.current = build;

    function resize() {
      const { clientWidth: w, clientHeight: h } = stage;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labels.setSize(w, h);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    let raf = 0;
    let last = performance.now();
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      for (const built of towers.values()) {
        built.height += (built.target - built.height) * (reduced ? 1 : Math.min(1, dt * 3));
        built.body.scale.y = built.height;
        built.body.position.y = built.height / 2;
        built.cap.position.y = built.height + 0.15;
      }
      // Far enough back to see every tower; slowly circling unless motion is turned down.
      const distance = Math.max(17, width * 1.8) / Math.min(1, camera.aspect);
      const angle = reduced ? 0.35 : (now / 1000) * 0.15;
      camera.position.set(Math.sin(angle) * distance, distance * 0.42, Math.cos(angle) * distance);
      camera.lookAt(0, 2.6, 0);
      renderer.render(scene, camera);
      labels.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      stopWatching();
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          if (node.material !== ink && node.material !== gold) (node.material as THREE.Material).dispose();
        }
      });
      ink.dispose();
      gold.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // Browsers allow only a few live 3D contexts.
      renderer.domElement.remove();
      labels.domElement.remove();
    };
  }, []);

  useEffect(() => {
    update.current(skylineTowers(vote, closed));
  }, [vote, closed]);

  return <Stage ref={stageRef} role="img" aria-label={`Results as towers: ${vote.options.map((o) => `${o.text} ${o.count}`).join(', ')}`} />;
}
