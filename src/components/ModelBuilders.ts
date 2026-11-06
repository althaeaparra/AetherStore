import * as THREE from 'three';

export type ModelFinish = 'titanium' | 'obsidian' | 'chrome' | 'emerald';

export interface ModelPartInfo {
  mesh: THREE.Mesh | THREE.Group;
  basePos: THREE.Vector3;
  explodeDir: THREE.Vector3;
}

export function getMaterialForFinish(finish: ModelFinish): THREE.MeshStandardMaterial {
  switch (finish) {
    case 'titanium':
      return new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.28,
        metalness: 0.9,
      });
    case 'obsidian':
      return new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.18,
        metalness: 0.95,
      });
    case 'chrome':
      return new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.08,
        metalness: 1.0,
      });
    case 'emerald':
      return new THREE.MeshStandardMaterial({
        color: 0x065f46,
        roughness: 0.22,
        metalness: 0.85,
      });
  }
}

// 1. PROCEDURAL SPATIAL VISOR (Composite 7 parts)
export function buildVisorModel(
  group: THREE.Group,
  finish: ModelFinish = 'titanium',
  partsOut?: ModelPartInfo[]
): void {
  const metalMat = getMaterialForFinish(finish);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.45, metalness: 0.2 });

  // Part 1: Curved electrochromic glass shield
  const glassGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 48, 1, true, -Math.PI / 3, (2 * Math.PI) / 3);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: finish === 'emerald' ? 0x059669 : 0x2563eb,
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.7,
    transparent: true,
    opacity: 0.85,
    ior: 1.52,
  });
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.rotation.y = Math.PI / 2;
  glassMesh.position.set(0, 0.05, 0.05);
  group.add(glassMesh);
  partsOut?.push({ mesh: glassMesh, basePos: glassMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0, 0.3) });

  // Part 2: Titanium upper brow chassis
  const browGeo = new THREE.TorusGeometry(0.38, 0.035, 16, 48, Math.PI);
  const browMesh = new THREE.Mesh(browGeo, metalMat);
  browMesh.rotation.x = Math.PI / 2;
  browMesh.position.set(0, 0.14, 0);
  group.add(browMesh);
  partsOut?.push({ mesh: browMesh, basePos: browMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.2, 0) });

  // Parts 3 & 4: Left & Right temple audio arms & earcups
  [-0.38, 0.38].forEach((xSide) => {
    const armGeo = new THREE.BoxGeometry(0.04, 0.06, 0.42);
    const armMesh = new THREE.Mesh(armGeo, metalMat);
    armMesh.position.set(xSide, 0.08, -0.15);
    group.add(armMesh);
    partsOut?.push({
      mesh: armMesh,
      basePos: armMesh.position.clone(),
      explodeDir: new THREE.Vector3(xSide > 0 ? 0.25 : -0.25, 0, -0.1),
    });

    const cupGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 32);
    const cupMesh = new THREE.Mesh(cupGeo, darkMat);
    cupMesh.rotation.z = Math.PI / 2;
    cupMesh.position.set(xSide > 0 ? xSide + 0.03 : xSide - 0.03, -0.05, -0.25);
    group.add(cupMesh);
    partsOut?.push({
      mesh: cupMesh,
      basePos: cupMesh.position.clone(),
      explodeDir: new THREE.Vector3(xSide > 0 ? 0.35 : -0.35, -0.1, -0.15),
    });
  });

  // Part 7: Rear counter-weight battery dial
  const dialGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 32);
  const dialMesh = new THREE.Mesh(dialGeo, metalMat);
  dialMesh.rotation.x = Math.PI / 2;
  dialMesh.position.set(0, 0.08, -0.38);
  group.add(dialMesh);
  partsOut?.push({ mesh: dialMesh, basePos: dialMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0, -0.3) });
}

// 2. PROCEDURAL HOLOGRAPHIC RING (Composite 5 parts)
export function buildRingModel(
  group: THREE.Group,
  finish: ModelFinish = 'titanium',
  partsOut?: ModelPartInfo[]
): void {
  const metalMat = getMaterialForFinish(finish);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2, metalness: 0.8 });

  // Part 1: Outer faceted band
  const outerGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 32, 1, true);
  const outerMesh = new THREE.Mesh(outerGeo, metalMat);
  group.add(outerMesh);
  partsOut?.push({ mesh: outerMesh, basePos: outerMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.15, 0) });

  // Part 2: Comfort-fit inner liner
  const innerGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 32, 1, true);
  const innerMesh = new THREE.Mesh(innerGeo, darkMat);
  group.add(innerMesh);
  partsOut?.push({ mesh: innerMesh, basePos: innerMesh.position.clone(), explodeDir: new THREE.Vector3(0, -0.15, 0) });

  // Part 3: Top micro-emitter bezel
  const bezelGeo = new THREE.TorusGeometry(0.12, 0.025, 16, 32);
  const bezelMesh = new THREE.Mesh(bezelGeo, metalMat);
  bezelMesh.rotation.x = Math.PI / 2;
  bezelMesh.position.set(0, 0.1, 0.28);
  group.add(bezelMesh);
  partsOut?.push({ mesh: bezelMesh, basePos: bezelMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.2, 0.2) });

  // Part 4: Faceted crystal lens
  const crystalGeo = new THREE.OctahedronGeometry(0.09, 2);
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0x93c5fd,
    roughness: 0.05,
    metalness: 0.1,
    transmission: 0.9,
    transparent: true,
    opacity: 0.95,
    ior: 2.1,
  });
  const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
  crystalMesh.position.set(0, 0.1, 0.28);
  group.add(crystalMesh);
  partsOut?.push({ mesh: crystalMesh, basePos: crystalMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.35, 0.35) });

  // Part 5: Floating holographic glyph disc
  const glyphGeo = new THREE.RingGeometry(0.05, 0.18, 32);
  const glyphMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });
  const glyphMesh = new THREE.Mesh(glyphGeo, glyphMat);
  glyphMesh.rotation.x = Math.PI / 2;
  glyphMesh.position.set(0, 0.35, 0.28);
  group.add(glyphMesh);
  partsOut?.push({ mesh: glyphMesh, basePos: glyphMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.45, 0.4) });
}

// 3. PROCEDURAL NEURAL HEADBAND (Composite 6 parts)
export function buildNeuralModel(
  group: THREE.Group,
  finish: ModelFinish = 'titanium',
  partsOut?: ModelPartInfo[]
): void {
  const metalMat = getMaterialForFinish(finish);
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.3 });

  // Part 1: Main carbon-fiber arch
  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.4, -0.1, -0.2),
    new THREE.Vector3(-0.35, 0.15, 0.05),
    new THREE.Vector3(0, 0.2, 0.15),
    new THREE.Vector3(0.35, 0.15, 0.05),
    new THREE.Vector3(0.4, -0.1, -0.2),
  ]);
  const archGeo = new THREE.TubeGeometry(archCurve, 64, 0.035, 16, false);
  const archMesh = new THREE.Mesh(archGeo, carbonMat);
  group.add(archMesh);
  partsOut?.push({ mesh: archMesh, basePos: archMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.1, 0) });

  // Part 2: Central Chrome Telemetry Enclosure
  const centerGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 32);
  const centerMesh = new THREE.Mesh(centerGeo, metalMat);
  centerMesh.rotation.z = Math.PI / 2;
  centerMesh.position.set(0, 0.2, 0.15);
  group.add(centerMesh);
  partsOut?.push({ mesh: centerMesh, basePos: centerMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.2, 0.2) });

  // Parts 3-6: Biometric Gold electrode nodes
  const nodeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16);
  const nodeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.9 });
  [-0.25, -0.1, 0.1, 0.25].forEach((xVal) => {
    const node = new THREE.Mesh(nodeGeo, nodeMat);
    node.position.set(xVal, 0.18, 0.12);
    group.add(node);
    partsOut?.push({
      mesh: node,
      basePos: node.position.clone(),
      explodeDir: new THREE.Vector3(xVal * 0.5, 0.25, 0.1),
    });
  });
}

// 4. PROCEDURAL CYBERDECK DRONE (Composite 8 parts)
export function buildDroneModel(
  group: THREE.Group,
  finish: ModelFinish = 'titanium',
  partsOut?: ModelPartInfo[]
): void {
  const metalMat = getMaterialForFinish(finish);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.4 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 });

  // Part 1: Central fuselage
  const bodyGeo = new THREE.BoxGeometry(0.24, 0.1, 0.36);
  const bodyMesh = new THREE.Mesh(bodyGeo, darkMat);
  group.add(bodyMesh);
  partsOut?.push({ mesh: bodyMesh, basePos: bodyMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.1, 0) });

  // Part 2: Optical LiDAR dome
  const lidarGeo = new THREE.SphereGeometry(0.07, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const lidarMat = new THREE.MeshPhysicalMaterial({ color: 0x0284c7, roughness: 0.1, transmission: 0.8 });
  const lidarMesh = new THREE.Mesh(lidarGeo, lidarMat);
  lidarMesh.position.set(0, 0.05, 0.05);
  group.add(lidarMesh);
  partsOut?.push({ mesh: lidarMesh, basePos: lidarMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.25, 0) });

  // Parts 3-8: 4 Articulated arms with motor hubs and blades
  const corners = [
    { x: -0.22, z: -0.22, dir: new THREE.Vector3(-0.25, 0, -0.25) },
    { x: 0.22, z: -0.22, dir: new THREE.Vector3(0.25, 0, -0.25) },
    { x: -0.22, z: 0.22, dir: new THREE.Vector3(-0.25, 0, 0.25) },
    { x: 0.22, z: 0.22, dir: new THREE.Vector3(0.25, 0, 0.25) },
  ];

  corners.forEach((c) => {
    const armGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.22, 16);
    const armMesh = new THREE.Mesh(armGeo, metalMat);
    armMesh.rotation.z = Math.PI / 2;
    armMesh.position.set(c.x, 0, c.z);
    group.add(armMesh);
    partsOut?.push({ mesh: armMesh, basePos: armMesh.position.clone(), explodeDir: c.dir });

    const motorGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 16);
    const motorMesh = new THREE.Mesh(motorGeo, metalMat);
    motorMesh.position.set(c.x * 1.4, 0.02, c.z * 1.4);
    group.add(motorMesh);

    const bladeGeo = new THREE.BoxGeometry(0.22, 0.005, 0.03);
    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    bladeMesh.position.set(c.x * 1.4, 0.045, c.z * 1.4);
    group.add(bladeMesh);

    partsOut?.push({
      mesh: bladeMesh,
      basePos: bladeMesh.position.clone(),
      explodeDir: new THREE.Vector3(c.dir.x * 1.5, 0.2, c.dir.z * 1.5),
    });
  });
}

// 5. PROCEDURAL QUANTUM CHRONOMETER (Composite 6 parts)
export function buildWatchModel(
  group: THREE.Group,
  finish: ModelFinish = 'titanium',
  partsOut?: ModelPartInfo[]
): void {
  const metalMat = getMaterialForFinish(finish);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.3 });

  // Part 1: Ceramic Case
  const caseGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 48);
  const caseMesh = new THREE.Mesh(caseGeo, darkMat);
  group.add(caseMesh);
  partsOut?.push({ mesh: caseMesh, basePos: caseMesh.position.clone(), explodeDir: new THREE.Vector3(0, -0.15, 0) });

  // Part 2: Bezel Ring
  const bezelGeo = new THREE.TorusGeometry(0.35, 0.025, 16, 48);
  const bezelMesh = new THREE.Mesh(bezelGeo, metalMat);
  bezelMesh.rotation.x = Math.PI / 2;
  bezelMesh.position.set(0, 0.05, 0);
  group.add(bezelMesh);
  partsOut?.push({ mesh: bezelMesh, basePos: bezelMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.15, 0) });

  // Part 3: Sapphire Crystal
  const crystalGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.015, 48);
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.02,
    transmission: 0.95,
    transparent: true,
    opacity: 0.9,
  });
  const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
  crystalMesh.position.set(0, 0.07, 0);
  group.add(crystalMesh);
  partsOut?.push({ mesh: crystalMesh, basePos: crystalMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.3, 0) });

  // Part 4: Dial Ring
  const dialGeo = new THREE.RingGeometry(0.12, 0.32, 48);
  const dialMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
  const dialMesh = new THREE.Mesh(dialGeo, dialMat);
  dialMesh.rotation.x = -Math.PI / 2;
  dialMesh.position.set(0, 0.055, 0);
  group.add(dialMesh);
  partsOut?.push({ mesh: dialMesh, basePos: dialMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.08, 0) });

  // Part 5: Central Gyro Tourbillon Cage
  const gyroGeo = new THREE.TorusGeometry(0.09, 0.015, 16, 32);
  const gyroMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.9 });
  const gyroMesh = new THREE.Mesh(gyroGeo, gyroMat);
  gyroMesh.position.set(0, 0.06, 0);
  group.add(gyroMesh);
  partsOut?.push({ mesh: gyroMesh, basePos: gyroMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.2, 0) });

  // Part 6: Hour/Minute Quantum Laser Needles
  const needleGeo = new THREE.BoxGeometry(0.015, 0.008, 0.22);
  const needleMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
  const needleMesh = new THREE.Mesh(needleGeo, needleMat);
  needleMesh.position.set(0.05, 0.062, 0.05);
  needleMesh.rotation.y = 0.8;
  group.add(needleMesh);
  partsOut?.push({ mesh: needleMesh, basePos: needleMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.22, 0) });
}

export function buildModelByType(
  type: 'visor' | 'ring' | 'neural' | 'drone' | 'watch',
  group: THREE.Group,
  finish: ModelFinish = 'titanium',
  partsOut?: ModelPartInfo[]
): void {
  switch (type) {
    case 'visor':
      buildVisorModel(group, finish, partsOut);
      break;
    case 'ring':
      buildRingModel(group, finish, partsOut);
      break;
    case 'neural':
      buildNeuralModel(group, finish, partsOut);
      break;
    case 'drone':
      buildDroneModel(group, finish, partsOut);
      break;
    case 'watch':
      buildWatchModel(group, finish, partsOut);
      break;
  }
}

/**
 * Lightweight Level of Detail (LOD) Proxy Models:
 * Used for background radial pedestals and distant previews.
 * Reduces vertex count by >75% and replaces expensive transmission
 * multi-pass shaders with fast standard materials.
 */
export function buildLowPolyProxyModel(
  type: 'visor' | 'ring' | 'neural' | 'drone' | 'watch',
  group: THREE.Group,
  finish: ModelFinish = 'titanium'
): void {
  const metalMat = getMaterialForFinish(finish);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.3 });

  switch (type) {
    case 'visor': {
      // 16-segment curved shield + brow
      const shieldGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3);
      const shieldMat = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.2,
        transparent: true,
        opacity: 0.75,
      });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.rotation.y = Math.PI / 2;
      group.add(shield);

      const browGeo = new THREE.TorusGeometry(0.35, 0.03, 8, 16, Math.PI);
      const brow = new THREE.Mesh(browGeo, metalMat);
      brow.rotation.x = Math.PI / 2;
      brow.position.y = 0.1;
      group.add(brow);
      break;
    }
    case 'ring': {
      const ringGeo = new THREE.TorusGeometry(0.28, 0.045, 10, 18);
      const ring = new THREE.Mesh(ringGeo, metalMat);
      group.add(ring);

      const gemGeo = new THREE.OctahedronGeometry(0.08, 0);
      const gemMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.5 });
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.position.set(0, 0.14, 0.24);
      group.add(gem);
      break;
    }
    case 'neural': {
      const archGeo = new THREE.TorusGeometry(0.35, 0.03, 8, 16, Math.PI * 0.85);
      const arch = new THREE.Mesh(archGeo, darkMat);
      arch.rotation.x = Math.PI / 2;
      group.add(arch);

      const nodeGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12);
      const node = new THREE.Mesh(nodeGeo, metalMat);
      node.position.set(0, 0.15, 0.12);
      group.add(node);
      break;
    }
    case 'drone': {
      const bodyGeo = new THREE.BoxGeometry(0.22, 0.08, 0.32);
      const body = new THREE.Mesh(bodyGeo, darkMat);
      group.add(body);

      // Simple 4-rotor disc proxies
      const rotorGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 10);
      const rotorMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 });
      [-0.22, 0.22].forEach((x) => {
        [-0.22, 0.22].forEach((z) => {
          const rotor = new THREE.Mesh(rotorGeo, rotorMat);
          rotor.position.set(x, 0.04, z);
          group.add(rotor);
        });
      });
      break;
    }
    case 'watch': {
      const caseGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20);
      const watchCase = new THREE.Mesh(caseGeo, darkMat);
      group.add(watchCase);

      const bezelGeo = new THREE.TorusGeometry(0.32, 0.02, 8, 20);
      const bezel = new THREE.Mesh(bezelGeo, metalMat);
      bezel.rotation.x = Math.PI / 2;
      bezel.position.y = 0.04;
      group.add(bezel);
      break;
    }
  }
}
