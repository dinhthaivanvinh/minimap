// Small toon cars with road-projected headlight beams; each departing car releases its resources.
import * as THREE from 'three';
import { headlightLevel, type Car, type Road } from '../lib/traffic.ts';

// Soft edges like the street lamps, plus a fading texture inside the triangular road beams.
function lightTexture(beam = false) {
  const canvas = document.createElement('canvas');
  canvas.width = beam ? 128 : 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = beam
    ? ctx.createLinearGradient(0, 0, 128, 0)
    : ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(0.35, 'rgba(255,255,255,.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, 64);
  if (beam) {
    const edge = ctx.createLinearGradient(0, 0, 0, 64);
    edge.addColorStop(0, 'rgba(255,255,255,0)');
    edge.addColorStop(0.3, '#fff');
    edge.addColorStop(0.7, '#fff');
    edge.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, 128, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

function createCar(car: Car, clippingPlanes: THREE.Plane[]) {
  const group = new THREE.Group();
  const materials = new Map<string, THREE.MeshToonMaterial>();
  const mat = (color: string) => {
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshToonMaterial({ color, clippingPlanes });
      materials.set(color, material);
    }
    return material;
  };
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const body = mat(car.color);
  const glass = mat('#dfefff');
  const ink = mat('#2a2657');
  const length = car.length;
  const width = car.width;
  add(new THREE.BoxGeometry(length, 0.95, width), body, 0, 1.85, 0);
  const cabinLength =
    car.shape === 'compact' ? length * 0.5 : car.shape === 'pickup' ? length * 0.4 : length * 0.7;
  const cabinHeight = car.shape === 'van' ? 1.45 : 0.95;
  const cabinX = car.shape === 'pickup' ? length * 0.14 : -length * 0.06;
  add(new THREE.BoxGeometry(cabinLength, cabinHeight, width * 0.85), glass, cabinX, 2.3 + cabinHeight / 2, 0);
  add(new THREE.BoxGeometry(cabinLength + 0.16, 0.18, width * 0.96), body, cabinX, 2.35 + cabinHeight, 0);
  // Window pillars make the large glass block read as a little cabin.
  add(new THREE.BoxGeometry(0.18, cabinHeight, width * 0.87), body, cabinX, 2.3 + cabinHeight / 2, 0);
  if (car.shape === 'pickup')
    add(new THREE.BoxGeometry(length * 0.35, 0.12, width * 0.75), ink, -length * 0.28, 2.35, 0);
  const wheels: THREE.Mesh[] = [];
  for (const x of [-length * 0.31, length * 0.31]) {
    for (const z of [-width * 0.52, width * 0.52]) {
      const wheel = add(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), ink, x, 1.5, z);
      wheel.rotation.x = Math.PI / 2;
      wheels.push(wheel);
      const hub = add(new THREE.CylinderGeometry(0.22, 0.22, 0.32, 8), mat('#dfe3ff'), x, 1.5, z);
      hub.rotation.x = Math.PI / 2;
    }
  }
  const bulbs = mat('#fff0bd');
  bulbs.emissive.set('#ffe6a0');
  const rearBulbs = mat('#ff657c');
  rearBulbs.emissive.set('#ff435e');
  const haloMap = lightTexture();
  const beamMap = lightTexture(true);
  const frontGlow = new THREE.SpriteMaterial({
    map: haloMap,
    color: '#ffe6a0',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const rearGlow = new THREE.SpriteMaterial({
    map: haloMap,
    color: '#ff657c',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beams = new THREE.MeshBasicMaterial({
    map: beamMap,
    clippingPlanes,
    color: '#ffeab1',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  for (const z of [-width * 0.32, width * 0.32]) {
    add(new THREE.BoxGeometry(0.12, 0.4, width * 0.23), bulbs, length / 2 + 0.03, 1.95, z);
    add(new THREE.BoxGeometry(0.12, 0.3, width * 0.2), rearBulbs, -length / 2 - 0.03, 1.95, z);
    for (const [x, material, size] of [
      [length / 2 + 0.12, frontGlow, 3.4],
      [-length / 2 - 0.12, rearGlow, 2.3],
    ] as const) {
      const glow = new THREE.Sprite(material);
      glow.position.set(x, 1.95, z);
      glow.scale.setScalar(size);
      group.add(glow);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, -0.18, 6, 0, -1.3, 6, 0, 1.3, 0, 0, -0.18, 6, 0, 1.3, 0, 0, 0.18],
        3,
      ),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    add(geometry, beams, length / 2, 1.08, z);
  }
  return {
    group,
    update(next: Car, daylight: number) {
      const light = headlightLevel(daylight);
      bulbs.emissiveIntensity = light * 1.5;
      rearBulbs.emissiveIntensity = light * 1.2;
      frontGlow.opacity = light * 0.7;
      rearGlow.opacity = light * 0.6;
      beams.opacity = light * 0.5;
      group.position.set(next.x, 0, next.z);
      group.rotation.y = next.direction === 1 ? 0 : Math.PI;
      for (const wheel of wheels) wheel.rotation.y = -next.x * next.direction * 2;
    },
    dispose() {
      group.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
      });
      for (const material of materials.values()) material.dispose();
      beams.dispose();
      frontGlow.dispose();
      rearGlow.dispose();
      haloMap.dispose();
      beamMap.dispose();
      group.removeFromParent();
    },
  };
}

export function createTraffic3D() {
  const group = new THREE.Group();
  // Clip entry and exit to the street so cars never float beyond the island.
  const edges = [new THREE.Plane(new THREE.Vector3(1, 0, 0)), new THREE.Plane(new THREE.Vector3(-1, 0, 0))];
  const models = new Map<number, ReturnType<typeof createCar>>();
  return {
    group,
    update(cars: Car[], daylight: number, road: Road) {
      edges[0]!.constant = -road.minX;
      edges[1]!.constant = road.maxX;
      const ids = new Set(cars.map((car) => car.id));
      for (const [id, model] of models)
        if (!ids.has(id)) {
          model.dispose();
          models.delete(id);
        }
      for (const car of cars) {
        let model = models.get(car.id);
        if (!model) {
          model = createCar(car, edges);
          models.set(car.id, model);
          group.add(model.group);
        }
        model.update(car, daylight);
      }
    },
    clear() {
      for (const model of models.values()) model.dispose();
      models.clear();
    },
  };
}
