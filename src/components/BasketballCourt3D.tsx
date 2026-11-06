import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createCharacterBuilder, type CharacterTools } from '../map/character3d.ts';
import { crowdSpot, nameFontSize, bannerAngle, type BasketballCast } from '../lib/basketballCast.ts';
import type { TeamUser } from '../../shared/types.ts';
import { COURT, FREE_THROW_Z, courtMarkings } from '../lib/basketballCourt.ts';
import type { CourtProps } from './BasketballCourt.tsx';

// Paint channels into the sphere's surface rather than placing raised rings on it.
// Two great circles plus two bowed panel boundaries form the classic eight panels.
function basketballTextures(): { color: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const width = 1024,
    height = 512;
  colorCanvas.width = bumpCanvas.width = width;
  colorCanvas.height = bumpCanvas.height = height;
  const colorContext = colorCanvas.getContext('2d')!;
  const bumpContext = bumpCanvas.getContext('2d')!;
  const colorImage = colorContext.createImageData(width, height);
  const bumpImage = bumpContext.createImageData(width, height);
  const tilt = Math.hypot(1, 0.38);
  const normalX = 1 / tilt,
    normalZ = 0.38 / tilt;
  const offset = 0.72,
    curveScale = Math.sqrt(1 - offset * offset);
  for (let row = 0; row < height; row++) {
    const theta = ((row + 0.5) / height) * Math.PI;
    const y = Math.cos(theta),
      ring = Math.sin(theta);
    for (let col = 0; col < width; col++) {
      // Match SphereGeometry's UV convention, including its longitude wrap.
      const phi = ((col + 0.5) / width) * Math.PI * 2;
      const x = -Math.cos(phi) * ring,
        z = Math.sin(phi) * ring;
      const distance = Math.min(
        Math.abs(x),
        Math.abs(y),
        Math.abs(normalX * x + normalZ * z - offset) / curveScale,
        Math.abs(-normalX * x + normalZ * z - offset) / curveScale,
      );
      const edge = THREE.MathUtils.smoothstep(distance, 0.01, 0.018);
      const noise = ((Math.imul(col + row * width, 1597334677) >>> 0) & 255) / 255;
      const grain = (noise - 0.5) * 12;
      const index = (row * width + col) * 4;
      const orange = [237 + grain, 128 + grain, 51 + grain];
      const channel = [48, 31, 26];
      for (let c = 0; c < 3; c++) colorImage.data[index + c] = channel[c]! * (1 - edge) + orange[c]! * edge;
      colorImage.data[index + 3] = 255;
      const relief = 75 + (145 + noise * 24) * edge;
      bumpImage.data[index] = bumpImage.data[index + 1] = bumpImage.data[index + 2] = relief;
      bumpImage.data[index + 3] = 255;
    }
  }
  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  const color = new THREE.CanvasTexture(colorCanvas),
    bump = new THREE.CanvasTexture(bumpCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = bump.wrapS = THREE.RepeatWrapping;
  color.anisotropy = bump.anisotropy = 4;
  return { color, bump };
}

export default function BasketballCourt3D(props: CourtProps & { onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
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
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    scene.background = new THREE.Color('#15213d');
    scene.fog = new THREE.Fog('#15213d', 18, 44);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 70);
    camera.position.set(0, 6.7, 15.5);
    camera.lookAt(0, 3.1, -2);
    scene.add(new THREE.HemisphereLight(0xc8e9ff, 0x523835, 2.6));
    const light = new THREE.DirectionalLight(0xffe2bc, 3.5);
    light.position.set(3, 11, 7);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.normalBias = 0.025;
    Object.assign(light.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
    scene.add(light);
    const materials: THREE.Material[] = [];
    function material(color: string, glow = false) {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.65,
        ...(glow ? { emissive: color, emissiveIntensity: 0.7 } : {}),
      });
      materials.push(m);
      return m;
    }
    const wood = material('#da9a63'),
      dark = material('#223250'),
      teal = material('#71e3d0', true);
    const white = material('#fff0cc'),
      orange = material('#ff7745');
    function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = h > 0.1;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }
    box(20, 0.25, 25, 0, -0.15, 0, wood);
    // One smooth surface, with regulation half-court markings rather than floor tiles.
    box(
      COURT.laneHalfWidth * 2,
      0.015,
      COURT.freeThrowDistance,
      0,
      0.005,
      (COURT.baseline + FREE_THROW_Z) / 2,
      material('#bb7356'),
    );
    for (const marking of courtMarkings()) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        marking.points.map((p) => new THREE.Vector3(p.x, 0.022, p.z)),
      );
      const lineMaterial = marking.dashed
        ? new THREE.LineDashedMaterial({ color: 0xfff0cc, dashSize: 0.22, gapSize: 0.18 })
        : new THREE.LineBasicMaterial({ color: 0xfff0cc });
      const line = new THREE.Line(geometry, lineMaterial);
      if (marking.dashed) line.computeLineDistances();
      scene.add(line);
    }
    box(23, 11, 0.4, 0, 5, -10, dark);
    box(0.2, 7, 0.2, 0, 3.5, -6.4, dark);
    box(4.2, 2.6, 0.16, 0, 5.8, -6, white);
    for (const x of [-2.14, 2.14]) box(0.09, 2.7, 0.2, x, 5.8, -5.98, teal);
    for (const y of [4.45, 7.15]) box(4.3, 0.09, 0.2, 0, y, -5.98, teal);
    for (const x of [-0.65, 0.65]) box(0.06, 1, 0.12, x, 5.15, -5.88, orange);
    for (const y of [4.65, 5.65]) box(1.35, 0.06, 0.12, 0, y, -5.88, orange);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.065, 12, 64), orange);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 4.65, -4.96);
    scene.add(rim);
    box(0.14, 0.14, 0.3, 0, 4.65, -5.8, orange);
    const netPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const top = new THREE.Vector3(Math.cos(angle) * 0.8, 4.62, -4.96 + Math.sin(angle) * 0.8);
      const bottom = new THREE.Vector3(
        Math.cos(angle + 0.4) * 0.48,
        3.6,
        -4.96 + Math.sin(angle + 0.4) * 0.48,
      );
      netPoints.push(top, bottom);
      netPoints.push(
        new THREE.Vector3(Math.cos(angle) * 0.48, 3.6, -4.96 + Math.sin(angle) * 0.48),
        new THREE.Vector3(Math.cos(angle + 0.4) * 0.8, 4.62, -4.96 + Math.sin(angle + 0.4) * 0.8),
      );
    }
    scene.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(netPoints),
        new THREE.LineBasicMaterial({ color: 0xfff3d9 }),
      ),
    );
    for (const x of [-8, 8]) {
      box(0.14, 8, 0.16, x, 4, -7, teal);
    }
    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 1024;
    bannerCanvas.height = 160;
    const bannerContext = bannerCanvas.getContext('2d');
    let bannerTexture: THREE.CanvasTexture | undefined;
    if (bannerContext) {
      bannerContext.fillStyle = '#15213d';
      bannerContext.fillRect(0, 0, 1024, 160);
      bannerContext.textAlign = 'center';
      bannerContext.fillStyle = '#a4eed9';
      bannerContext.font = '900 58px sans-serif';
      bannerContext.fillText('M I N I M A P   A R E N A', 512, 105);
      bannerTexture = new THREE.CanvasTexture(bannerCanvas);
      bannerTexture.colorSpace = THREE.SRGBColorSpace;
      const bannerMaterial = new THREE.MeshBasicMaterial({ map: bannerTexture });
      materials.push(bannerMaterial);
      box(10, 1.56, 0.04, 0, 8.4, -9.74, bannerMaterial);
    }
    const ramp = new THREE.DataTexture(new Uint8Array([145, 210, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
    const characterColors = new Map<number, THREE.Material>();
    const characterMat = (color: number) => {
      let mat = characterColors.get(color);
      if (!mat) {
        mat = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
        characterColors.set(color, mat);
        materials.push(mat);
      }
      return mat;
    };
    const characterMesh: CharacterTools['mesh'] = (
      geometry,
      color,
      { x = 0, y = 0, z = 0, shadow = true } = {},
    ) => {
      const node = new THREE.Mesh(geometry, typeof color === 'number' ? characterMat(color) : color);
      node.position.set(x, y, z);
      node.castShadow = shadow;
      node.receiveShadow = true;
      return node;
    };
    const buildCharacter = createCharacterBuilder({ ramp, mat: characterMat, mesh: characterMesh });
    interface Actor {
      root: THREE.Group;
      inner: THREE.Group;
      label: CSS2DObject;
      banner?: CSS2DObject;
      lean: number;
      bodyMaterial: THREE.Material;
      player: boolean;
      index: number;
      baseY: number;
    }
    let actors: Actor[] = [];
    let currentCast: BasketballCast | null = null;
    const clearCast = () => {
      for (const actor of actors) {
        const geometries = new Set<THREE.BufferGeometry>();
        actor.root.traverse((node) => {
          if (node instanceof THREE.Mesh) geometries.add(node.geometry);
        });
        geometries.forEach((geometry) => geometry.dispose());
        actor.bodyMaterial.dispose();
        actor.label.element.remove();
        actor.banner?.element.remove();
        scene.remove(actor.root);
      }
      actors = [];
    };
    const addActor = (user: TeamUser, player: boolean, index: number) => {
      const root = new THREE.Group(),
        inner = new THREE.Group();
      root.add(inner);
      const bodyMaterial = buildCharacter(inner, user);
      const name = document.createElement('div');
      name.className = 'arcade-name';
      name.textContent = user.nickname || user.username;
      name.title = user.username;
      name.dataset.arcadeName = user.username;
      name.style.fontSize = `${nameFontSize(user)}px`;
      name.style.lineHeight = `${nameFontSize(user) + 2}px`;
      const label = new CSS2DObject(name);
      label.position.set(0, player ? -0.12 : 3.45, 0);
      label.center.set(0.5, player ? 0 : 1);
      root.add(label);
      const support = player ? undefined : latest.current.cast.banners[user.username];
      let banner: CSS2DObject | undefined;
      const lean = support ? ((bannerAngle(support) * Math.PI) / 180) * 0.7 : 0;
      if (support) {
        const wrapper = document.createElement('div'),
          sign = document.createElement('div');
        wrapper.dataset.arcadeBanner = user.username;
        wrapper.dataset.bannerPose = support.pose;
        sign.className = 'arcade-banner';
        sign.textContent = support.text;
        sign.style.background = support.color;
        sign.style.transform = `rotate(${bannerAngle(support)}deg)`;
        wrapper.appendChild(sign);
        banner = new CSS2DObject(wrapper);
        banner.position.set(support.pose === 'left' ? -0.25 : support.pose === 'right' ? 0.25 : 0, -0.1, 0.8);
        root.add(banner);
      }
      let baseY = 0;
      if (player) {
        root.position.set(-1.4, 0, 4.7);
        root.scale.setScalar(0.85);
        inner.rotation.y = Math.PI * 0.65;
      } else {
        const spot = crowdSpot(index);
        root.position.set(spot.x, 0, spot.z);
        root.scale.setScalar(0.52);
        inner.rotation.y = -spot.side * 0.35;
      }
      scene.add(root);
      actors.push({ root, inner, label, banner, lean, bodyMaterial, player, index, baseY });
    };
    const ball = new THREE.Group();

    const ballTextures = basketballTextures();
    const ballMaterial = material('#ffffff');
    ballMaterial.map = ballTextures.color;
    ballMaterial.bumpMap = ballTextures.bump;
    ballMaterial.bumpScale = 0.012;
    ballMaterial.roughness = 0.88;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.63, 64, 48), ballMaterial);
    sphere.castShadow = true;
    ball.add(sphere);
    scene.add(ball);
    const resize = () => {
      const width = root.clientWidth,
        height = root.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      labels.setSize(width, height);
      camera.aspect = width / height;
      const narrow = camera.aspect < 1.1;
      camera.position.set(0, narrow ? 8.3 : 6.7, narrow ? 19 : 17.5);
      camera.lookAt(0, 3.1, -2);
      camera.fov = narrow ? 60 : 43;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    const fail = (event: Event) => {
      event.preventDefault();
      latest.current.onFail();
    };
    renderer.domElement.addEventListener('webglcontextlost', fail);
    // Keep full nameplates inside the viewport and separate the three labels on
    // each sideline, even when long display names wrap on a narrow screen.
    const arrangeNames = () => {
      const bounds = root.getBoundingClientRect();
      for (const actor of actors) {
        if (!actor.banner) continue;
        const rect = actor.banner.element.getBoundingClientRect();
        const x = Math.max(bounds.x + 8, Math.min(rect.x, bounds.right - 8 - rect.width));
        const y = Math.max(bounds.y + 8, Math.min(rect.y, bounds.bottom - 8 - rect.height));
        actor.banner.element.style.transform += ` translate(${x - rect.x}px,${y - rect.y}px)`;
      }
      const obstacles = actors
        .filter((a) => a.banner)
        .map((a) => ({ side: a.index % 2, rect: a.banner!.element.getBoundingClientRect() }));
      const entries = actors.map((actor) => ({
        actor,
        rect: actor.label.element.getBoundingClientRect(),
        dy: 0,
      }));
      for (const side of [0, 1]) {
        const column = entries
          .filter((e) => !e.actor.player && e.actor.index % 2 === side)
          .sort((a, b) => a.rect.y - b.rect.y);
        let bottom = bounds.bottom - 8;
        for (let i = column.length - 1; i >= 0; i--) {
          const entry = column[i]!;
          let y = Math.min(entry.rect.y, bottom - entry.rect.height);
          for (const obstacle of obstacles
            .filter((o) => o.side === side)
            .sort((a, b) => b.rect.y - a.rect.y)) {
            if (y < obstacle.rect.bottom + 6 && y + entry.rect.height > obstacle.rect.y - 6)
              y = obstacle.rect.y - 6 - entry.rect.height;
          }
          entry.dy = y - entry.rect.y;
          bottom = y - 8;
        }
        const first = column[0];
        if (first) {
          const shift = Math.max(0, bounds.y + 8 - (first.rect.y + first.dy));
          for (const entry of column) entry.dy += shift;
        }
      }
      for (const entry of entries) {
        const x = Math.max(bounds.x + 8, Math.min(entry.rect.x, bounds.right - 8 - entry.rect.width));
        const y = Math.max(
          bounds.y + 8,
          Math.min(entry.rect.y + entry.dy, bounds.bottom - 8 - entry.rect.height),
        );
        entry.actor.label.element.style.transform += ` translate(${x - entry.rect.x}px,${y - entry.rect.y}px)`;
      }
    };
    let frame = 0;
    const render = () => {
      const { shot, elapsed, reduced, cast } = latest.current;
      if (cast !== currentCast) {
        clearCast();
        currentCast = cast;
        // Keep the sampled crowd around the sidelines for the whole round.
        cast.crowd.forEach((user, index) => addActor(user, false, index));
        addActor(cast.player, true, 0);
      }
      const recent = shot ? Math.max(0, elapsed - shot.at) : 2000;
      const release = reduced || recent > 650 ? 0 : Math.sin(Math.PI * Math.min(1, recent / 500));
      const basketCheer = !!shot?.hit && recent < 1400;
      for (const actor of actors) {
        if (actor.player) {
          actor.root.position.y = release * 0.17;
          actor.inner.rotation.z = -release * 0.09;
        } else {
          const beat = elapsed / (basketCheer ? 95 : 260) + actor.index * 1.9;
          actor.root.position.y =
            actor.baseY + (reduced ? 0 : Math.max(0, Math.sin(beat)) * (basketCheer ? 0.32 : 0.07));
          actor.inner.rotation.z = actor.lean + (reduced ? 0 : Math.sin(beat) * (basketCheer ? 0.1 : 0.025));
        }
      }
      const flight = shot ? Math.max(0, (elapsed - shot.at) / 650) : 1;
      const flying = !!shot && flight < 1;
      const p = flying && !reduced ? flight : 0;
      ball.visible = !reduced || !flying;
      ball.position.set(
        shot && !shot.hit ? (shot.id % 2 ? 3 : -3) * p : 0,
        1.5 + 3.15 * p + Math.sin(Math.PI * p) * 4.4,
        5 - 9.96 * p,
      );
      if (!reduced) ball.rotation.set(p * 4, p * 3, p * 2);
      renderer.render(scene, camera);
      labels.render(scene, camera);
      arrangeNames();
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      clearCast();
      ramp.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', fail);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
        }
      });
      scene.traverse((object) => {
        if (object instanceof THREE.Line) {
          const mats = Array.isArray(object.material) ? object.material : [object.material];
          mats.forEach((m) => m.dispose());
        }
      });
      bannerTexture?.dispose();
      ballTextures.color.dispose();
      ballTextures.bump.dispose();
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labels.domElement.remove();
    };
  }, []);
  return (
    <div
      ref={host}
      role="img"
      aria-label="3D basketball arcade court"
      data-arcade-player={props.cast.player.username}
      data-crowd-count={props.cast.crowd.length}
      style={{ position: 'absolute', inset: 0 }}
    />
  );
}
