import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ModelFinish = 'titanium' | 'obsidian' | 'chrome' | 'emerald';

export class ThreeModelViewer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private currentModelGroup: THREE.Group | null = null;
  private parts: { mesh: THREE.Mesh | THREE.Group; basePos: THREE.Vector3; explodeDir: THREE.Vector3 }[] = [];
  private contactShadow: THREE.Mesh | null = null;
  private frameId = 0;
  private isDestroyed = false;

  // Interaction & Damping
  private isPointerDown = false;
  private prevPointerX = 0;
  private prevPointerY = 0;
  private targetRotationX = 0.2;
  private targetRotationY = -0.5;
  private currentRotationX = 0.2;
  private currentRotationY = -0.5;
  private targetZoom = 1.8;
  private currentZoom = 1.8;
  private autoRotate = true;
  private explodeFactor = 0;
  private targetExplodeFactor = 0;
  private currentFinish: ModelFinish = 'titanium';

  constructor(container: HTMLElement) {
    this.container = container;

    // Renderer setup with ACESFilmicToneMapping
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 400, container.clientHeight || 400);
    this.container.appendChild(this.renderer.domElement);

    // Scene & Environment Reflections
    this.scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      (container.clientWidth || 400) / (container.clientHeight || 400),
      0.1,
      20
    );
    this.camera.position.set(0, 0, this.currentZoom);

    // Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.8);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff8ed, 2.5);
    keyLight.position.set(2, 4, 3);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
    rimLight.position.set(-3, -1, -2);
    this.scene.add(rimLight);

    // Soft Contact Shadow Grounding
    this.createContactShadow();

    // Event Listeners
    this.bindEvents();

    // Render loop
    this.animate = this.animate.bind(this);
    this.animate();
  }

  private createContactShadow() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
      gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const shadowGeo = new THREE.PlaneGeometry(1.4, 1.4);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = -0.45;
    this.scene.add(this.contactShadow);
  }

  private bindEvents() {
    const el = this.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;
      this.autoRotate = false;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isPointerDown) return;
      const dx = e.clientX - this.prevPointerX;
      const dy = e.clientY - this.prevPointerY;
      this.targetRotationY += dx * 0.008;
      this.targetRotationX = Math.max(-1.2, Math.min(1.2, this.targetRotationX + dy * 0.008));
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;
    });

    window.addEventListener('pointerup', () => {
      this.isPointerDown = false;
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetZoom = Math.max(0.8, Math.min(3.5, this.targetZoom + e.deltaY * 0.002));
    });

    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  public resize() {
    if (this.isDestroyed || !this.container) return;
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 400;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public loadModel(type: 'visor' | 'ring' | 'neural' | 'drone' | 'watch', finish: ModelFinish = 'titanium') {
    this.currentFinish = finish;
    if (this.currentModelGroup) {
      this.scene.remove(this.currentModelGroup);
      this.disposeObject(this.currentModelGroup);
      this.currentModelGroup = null;
      this.parts = [];
    }

    const group = new THREE.Group();

    switch (type) {
      case 'visor':
        this.buildVisorModel(group, finish);
        break;
      case 'ring':
        this.buildRingModel(group, finish);
        break;
      case 'neural':
        this.buildNeuralModel(group, finish);
        break;
      case 'drone':
        this.buildDroneModel(group, finish);
        break;
      case 'watch':
        this.buildWatchModel(group, finish);
        break;
    }

    this.currentModelGroup = group;
    this.scene.add(group);
  }

  // --- 1. PROCEDURAL SPATIAL VISOR (Composite 7 parts) ---
  private buildVisorModel(group: THREE.Group, finish: ModelFinish) {
    const metalMat = this.getMaterialForFinish(finish);
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
    this.parts.push({ mesh: glassMesh, basePos: glassMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0, 0.3) });

    // Part 2: Titanium upper brow chassis
    const browGeo = new THREE.TorusGeometry(0.38, 0.035, 16, 48, Math.PI);
    const browMesh = new THREE.Mesh(browGeo, metalMat);
    browMesh.rotation.x = Math.PI / 2;
    browMesh.position.set(0, 0.14, 0);
    group.add(browMesh);
    this.parts.push({ mesh: browMesh, basePos: browMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.2, 0) });

    // Part 3 & 4: Left & Right temple audio arms
    [-0.38, 0.38].forEach((xSide, i) => {
      const armGeo = new THREE.BoxGeometry(0.04, 0.06, 0.42);
      const armMesh = new THREE.Mesh(armGeo, metalMat);
      armMesh.position.set(xSide, 0.08, -0.15);
      group.add(armMesh);
      this.parts.push({
        mesh: armMesh,
        basePos: armMesh.position.clone(),
        explodeDir: new THREE.Vector3(xSide > 0 ? 0.25 : -0.25, 0, -0.1),
      });

      // Part 5 & 6: Memory-foam earcups
      const cupGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 32);
      const cupMesh = new THREE.Mesh(cupGeo, darkMat);
      cupMesh.rotation.z = Math.PI / 2;
      cupMesh.position.set(xSide > 0 ? xSide + 0.03 : xSide - 0.03, -0.05, -0.25);
      group.add(cupMesh);
      this.parts.push({
        mesh: cupMesh,
        basePos: cupMesh.position.clone(),
        explodeDir: new THREE.Vector3(xSide > 0 ? 0.35 : -0.35, -0.1, -0.15),
      });
    });

    // Part 7: Rear counter-weight ergonomic battery dial
    const dialGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 32);
    const dialMesh = new THREE.Mesh(dialGeo, metalMat);
    dialMesh.rotation.x = Math.PI / 2;
    dialMesh.position.set(0, 0.08, -0.38);
    group.add(dialMesh);
    this.parts.push({ mesh: dialMesh, basePos: dialMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0, -0.3) });
  }

  // --- 2. PROCEDURAL HOLOGRAPHIC RING (Composite 5 parts) ---
  private buildRingModel(group: THREE.Group, finish: ModelFinish) {
    const metalMat = this.getMaterialForFinish(finish);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2, metalness: 0.8 });

    // Part 1: Outer faceted band
    const outerGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 32, 1, true);
    const outerMesh = new THREE.Mesh(outerGeo, metalMat);
    group.add(outerMesh);
    this.parts.push({ mesh: outerMesh, basePos: outerMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.15, 0) });

    // Part 2: Comfort-fit beveled inner liner
    const innerGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 32, 1, true);
    const innerMesh = new THREE.Mesh(innerGeo, darkMat);
    group.add(innerMesh);
    this.parts.push({ mesh: innerMesh, basePos: innerMesh.position.clone(), explodeDir: new THREE.Vector3(0, -0.15, 0) });

    // Part 3: Top micro-emitter bezel
    const bezelGeo = new THREE.TorusGeometry(0.12, 0.025, 16, 32);
    const bezelMesh = new THREE.Mesh(bezelGeo, metalMat);
    bezelMesh.rotation.x = Math.PI / 2;
    bezelMesh.position.set(0, 0.1, 0.28);
    group.add(bezelMesh);
    this.parts.push({ mesh: bezelMesh, basePos: bezelMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.2, 0.2) });

    // Part 4: Faceted diamond micro-crystal lens
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
    this.parts.push({ mesh: crystalMesh, basePos: crystalMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.35, 0.35) });

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
    this.parts.push({ mesh: glyphMesh, basePos: glyphMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.45, 0.4) });
  }

  // --- 3. PROCEDURAL NEURAL HEADBAND (Composite 6 parts) ---
  private buildNeuralModel(group: THREE.Group, finish: ModelFinish) {
    const metalMat = this.getMaterialForFinish(finish);
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.3 });

    // Part 1: Main ergonomic carbon-fiber arch
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
    this.parts.push({ mesh: archMesh, basePos: archMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.1, 0) });

    // Part 2: Central Chrome Telemetry Enclosure
    const centerGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 32);
    const centerMesh = new THREE.Mesh(centerGeo, metalMat);
    centerMesh.rotation.z = Math.PI / 2;
    centerMesh.position.set(0, 0.2, 0.15);
    group.add(centerMesh);
    this.parts.push({ mesh: centerMesh, basePos: centerMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.2, 0.2) });

    // Part 3-6: Biometric Gold/Chrome dry-contact electrode nodes
    const nodeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16);
    const nodeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.9 });
    [-0.25, -0.1, 0.1, 0.25].forEach((xVal, idx) => {
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      node.position.set(xVal, 0.18, 0.12);
      group.add(node);
      this.parts.push({
        mesh: node,
        basePos: node.position.clone(),
        explodeDir: new THREE.Vector3(xVal * 0.5, 0.25, 0.1),
      });
    });
  }

  // --- 4. PROCEDURAL CYBERDECK DRONE (Composite 8 parts) ---
  private buildDroneModel(group: THREE.Group, finish: ModelFinish) {
    const metalMat = this.getMaterialForFinish(finish);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.4 });
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 });

    // Part 1: Central aerodynamic fuselage
    const bodyGeo = new THREE.BoxGeometry(0.24, 0.1, 0.36);
    const bodyMesh = new THREE.Mesh(bodyGeo, darkMat);
    group.add(bodyMesh);
    this.parts.push({ mesh: bodyMesh, basePos: bodyMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.1, 0) });

    // Part 2: Optical LiDAR dome
    const lidarGeo = new THREE.SphereGeometry(0.07, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const lidarMat = new THREE.MeshPhysicalMaterial({ color: 0x0284c7, roughness: 0.1, transmission: 0.8 });
    const lidarMesh = new THREE.Mesh(lidarGeo, lidarMat);
    lidarMesh.position.set(0, 0.05, 0.05);
    group.add(lidarMesh);
    this.parts.push({ mesh: lidarMesh, basePos: lidarMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.25, 0) });

    // Parts 3-6: 4 Articulated folding arms
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
      this.parts.push({ mesh: armMesh, basePos: armMesh.position.clone(), explodeDir: c.dir });

      // Part 7-8: Motor hubs & Rotor blades
      const motorGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 16);
      const motorMesh = new THREE.Mesh(motorGeo, metalMat);
      motorMesh.position.set(c.x * 1.4, 0.02, c.z * 1.4);
      group.add(motorMesh);

      const bladeGeo = new THREE.BoxGeometry(0.22, 0.005, 0.03);
      const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
      bladeMesh.position.set(c.x * 1.4, 0.045, c.z * 1.4);
      group.add(bladeMesh);

      this.parts.push({
        mesh: bladeMesh,
        basePos: bladeMesh.position.clone(),
        explodeDir: new THREE.Vector3(c.dir.x * 1.5, 0.2, c.dir.z * 1.5),
      });
    });
  }

  // --- 5. PROCEDURAL QUANTUM CHRONOMETER (Composite 6 parts) ---
  private buildWatchModel(group: THREE.Group, finish: ModelFinish) {
    const metalMat = this.getMaterialForFinish(finish);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.3 });

    // Part 1: Ceramic Case
    const caseGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 48);
    const caseMesh = new THREE.Mesh(caseGeo, darkMat);
    group.add(caseMesh);
    this.parts.push({ mesh: caseMesh, basePos: caseMesh.position.clone(), explodeDir: new THREE.Vector3(0, -0.15, 0) });

    // Part 2: Bezel Ring
    const bezelGeo = new THREE.TorusGeometry(0.35, 0.025, 16, 48);
    const bezelMesh = new THREE.Mesh(bezelGeo, metalMat);
    bezelMesh.rotation.x = Math.PI / 2;
    bezelMesh.position.set(0, 0.05, 0);
    group.add(bezelMesh);
    this.parts.push({ mesh: bezelMesh, basePos: bezelMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.15, 0) });

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
    this.parts.push({ mesh: crystalMesh, basePos: crystalMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.3, 0) });

    // Part 4: Skeleton Gear Train Dial
    const gearGeo = new THREE.RingGeometry(0.08, 0.32, 32);
    const gearMesh = new THREE.Mesh(gearGeo, metalMat);
    gearMesh.rotation.x = -Math.PI / 2;
    gearMesh.position.set(0, 0.02, 0);
    group.add(gearMesh);
    this.parts.push({ mesh: gearMesh, basePos: gearMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.05, 0) });

    // Part 5: Levitating Quantum Gyroscope Ring
    const gyroGeo = new THREE.TorusGeometry(0.12, 0.015, 16, 32);
    const gyroMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.95 });
    const gyroMesh = new THREE.Mesh(gyroGeo, gyroMat);
    gyroMesh.position.set(0, 0.03, 0);
    group.add(gyroMesh);
    this.parts.push({ mesh: gyroMesh, basePos: gyroMesh.position.clone(), explodeDir: new THREE.Vector3(0, 0.2, 0) });

    // Part 6: Knurled Crown
    const crownGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 24);
    const crownMesh = new THREE.Mesh(crownGeo, metalMat);
    crownMesh.rotation.z = Math.PI / 2;
    crownMesh.position.set(0.38, 0, 0);
    group.add(crownMesh);
    this.parts.push({ mesh: crownMesh, basePos: crownMesh.position.clone(), explodeDir: new THREE.Vector3(0.25, 0, 0) });
  }

  private getMaterialForFinish(finish: ModelFinish): THREE.MeshStandardMaterial {
    switch (finish) {
      case 'obsidian':
        return new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.25, metalness: 0.85 });
      case 'chrome':
        return new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.05, metalness: 0.98 });
      case 'emerald':
        return new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.2, metalness: 0.8 });
      case 'titanium':
      default:
        return new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.9 });
    }
  }

  public setExplodedView(factor: number) {
    this.targetExplodeFactor = Math.max(0, Math.min(1, factor));
  }

  public setFinish(finish: ModelFinish) {
    this.currentFinish = finish;
    if (this.currentModelGroup) {
      // Re-apply to all metal parts
      const newMat = this.getMaterialForFinish(finish);
      this.currentModelGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
          const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (m.metalness > 0.6) {
            (child as THREE.Mesh).material = newMat;
          }
        }
      });
    }
  }

  public toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
  }

  public resetView() {
    this.targetRotationX = 0.2;
    this.targetRotationY = -0.5;
    this.targetZoom = 1.8;
    this.targetExplodeFactor = 0;
  }

  private animate() {
    if (this.isDestroyed) return;
    this.frameId = requestAnimationFrame(this.animate);

    // Smooth Damped Rotation
    if (this.autoRotate) {
      this.targetRotationY += 0.005;
    }

    this.currentRotationX = THREE.MathUtils.damp(this.currentRotationX, this.targetRotationX, 10, 0.016);
    this.currentRotationY = THREE.MathUtils.damp(this.currentRotationY, this.targetRotationY, 10, 0.016);
    this.currentZoom = THREE.MathUtils.damp(this.currentZoom, this.targetZoom, 10, 0.016);
    this.explodeFactor = THREE.MathUtils.damp(this.explodeFactor, this.targetExplodeFactor, 8, 0.016);

    if (this.currentModelGroup) {
      this.currentModelGroup.rotation.x = this.currentRotationX;
      this.currentModelGroup.rotation.y = this.currentRotationY;

      // Update exploded part offsets
      this.parts.forEach((p) => {
        p.mesh.position.copy(p.basePos).addScaledVector(p.explodeDir, this.explodeFactor);
      });
    }

    this.camera.position.z = this.currentZoom;
    this.renderer.render(this.scene, this.camera);
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
    });
  }

  public destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.frameId);
    if (this.currentModelGroup) {
      this.scene.remove(this.currentModelGroup);
      this.disposeObject(this.currentModelGroup);
    }
    if (this.contactShadow) {
      this.scene.remove(this.contactShadow);
      this.disposeObject(this.contactShadow);
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
