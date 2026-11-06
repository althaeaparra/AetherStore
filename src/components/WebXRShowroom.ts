import * as THREE from 'three';
import * as xb from 'xrblocks';
import { Product } from '../types';
import { inventoryService } from '../services/inventoryService';
import {
  ModelFinish,
  buildModelByType,
  buildLowPolyProxyModel,
  getMaterialForFinish,
} from './ModelBuilders';
import {
  getSharedEnvironment,
  disposeHierarchy,
} from '../services/environmentService';

interface PedestalItem {
  product: Product;
  baseGroup: THREE.Group;
  pedestalMesh: THREE.Mesh;
  glowRingMesh: THREE.Mesh;
  previewModel: THREE.Group;
  textMesh: THREE.Mesh;
  angle: number;
}

export class WebXRShowroom extends xb.Script {
  private products: Product[];
  private activeIndex: number = 0;
  private currentFinish: ModelFinish = 'titanium';

  // Scene Elements
  private roomGroup: THREE.Group | null = null;
  private centerDais: THREE.Group | null = null;
  private activeModelRoot: THREE.Group | null = null;
  private activeModelGroup: THREE.Group | null = null;
  private pedestals: PedestalItem[] = [];
  private dustParticles: THREE.Points | null = null;

  // Spatial UI
  private uiCard: any = null;
  private uiTitleText: any = null;
  private uiMetaText: any = null;
  private uiPriceText: any = null;
  private uiSpecsText: any = null;
  private uiStatusText: any = null;
  private uiCartButton: any = null;
  private uiSpinButton: any = null;

  // Animation & Interaction
  private isSpinning: boolean = true;
  private spinSpeed: number = 0.008;
  private audioCtx: AudioContext | null = null;
  private clock = new THREE.Clock();

  constructor(initialProduct?: Product) {
    super();
    this.products = inventoryService.getProducts();
    if (initialProduct) {
      const idx = this.products.findIndex((p) => p.id === initialProduct.id);
      if (idx !== -1) this.activeIndex = idx;
    }
  }

  init() {
    this.initAudio();
    this.setupEnvironmentAndVRQuality();
    this.buildShowroomArchitecture();
    this.buildPedestalArc();
    this.buildCenterExaminationDais();
    this.buildSpatialUI();
    this.loadActiveModel();
  }

  private setupEnvironmentAndVRQuality() {
    try {
      const coreAny = xb.core as any;
      if (coreAny?.renderer) {
        const env = getSharedEnvironment(coreAny.renderer);
        if (coreAny.scene) {
          coreAny.scene.environment = env;
        }
        // Fixed Foveated Rendering: Allocates full fragment shading to optical center in VR headsets
        coreAny.renderer.xr?.setFoveation?.(1.0);
      }
    } catch {
      // Graceful fallback
    }
  }

  // --- 1. Audio Synthesizer (Procedural Zero-404 Web Audio) ---
  private initAudio() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    } catch {
      // Audio optional
    }
  }

  private playTone(freq: number, type: OscillatorType = 'sine', duration: number = 0.18, gainVal: number = 0.08) {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch {
      // Ignore
    }
  }

  private playChime() {
    this.playTone(587.33, 'sine', 0.12, 0.06); // D5
    setTimeout(() => this.playTone(880.0, 'sine', 0.22, 0.07), 70); // A5
    setTimeout(() => this.playTone(1174.66, 'sine', 0.35, 0.08), 140); // D6
  }

  private playClick() {
    this.playTone(1200, 'triangle', 0.04, 0.04);
  }

  // --- 2. Showroom Architectural Environment ---
  private buildShowroomArchitecture() {
    this.roomGroup = new THREE.Group();
    this.add(this.roomGroup);

    // Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 2.2);
    this.roomGroup.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff8eb, 2.8);
    keyLight.position.set(2.5, 5, 3);
    keyLight.castShadow = true;
    this.roomGroup.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    rimLight.position.set(-3, 2, -2.5);
    this.roomGroup.add(rimLight);

    const accentLight = new THREE.PointLight(0x818cf8, 2.0, 6);
    accentLight.position.set(0, 2.5, -1.2);
    this.roomGroup.add(accentLight);

    // Circular Pavilion Floor
    const floorGeo = new THREE.CylinderGeometry(4.2, 4.4, 0.12, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1d,
      roughness: 0.25,
      metalness: 0.85,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.06, -1.0);
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    // Glowing Concentric Floor Circuit Rings
    [1.8, 2.8, 3.8].forEach((radius, i) => {
      const ringGeo = new THREE.RingGeometry(radius - 0.015, radius + 0.015, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x38bdf8 : i === 1 ? 0x818cf8 : 0x4f46e5,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35 - i * 0.08,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.003, -1.0);
      this.roomGroup?.add(ring);
    });

    // Perimeter Architectural Neon Pillars (InstancedMesh: 4 pillars + 4 neon strips = 2 draw calls)
    const pillarAngles = [-1.3, -0.7, 0.7, 1.3];
    const pillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.8, 16);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.8,
    });
    const stripGeo = new THREE.BoxGeometry(0.02, 3.5, 0.04);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    const pillarInstanced = new THREE.InstancedMesh(pillarGeo, pillarMat, pillarAngles.length);
    const stripInstanced = new THREE.InstancedMesh(stripGeo, stripMat, pillarAngles.length);
    const dummy = new THREE.Object3D();

    pillarAngles.forEach((angle, idx) => {
      const x = Math.sin(angle) * 3.6;
      const z = -Math.cos(angle) * 3.6 - 1.0;

      dummy.position.set(x, 1.9, z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      pillarInstanced.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(x * 0.98, 1.9, z * 0.98);
      dummy.updateMatrix();
      stripInstanced.setMatrixAt(idx, dummy.matrix);
    });

    pillarInstanced.instanceMatrix.needsUpdate = true;
    stripInstanced.instanceMatrix.needsUpdate = true;
    this.roomGroup?.add(pillarInstanced);
    this.roomGroup?.add(stripInstanced);

    // Atmospheric Cyber Dust Particles
    const dustCount = 120;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 6;
      dustPositions[i * 3 + 1] = Math.random() * 3 + 0.2;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1.0;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 0.035,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    this.dustParticles = new THREE.Points(dustGeo, dustMat);
    this.roomGroup.add(this.dustParticles);
  }

  // --- 3. Radial Pedestals Arc for ALL 5 Gadgets ---
  private buildPedestalArc() {
    const arcRadius = 1.95;
    const arcAngles = [-0.75, -0.38, 0, 0.38, 0.75]; // 5 pedestals spanning ~90 degrees

    const pedGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.75, 32);
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.3,
      metalness: 0.8,
    });
    const ringGeo = new THREE.TorusGeometry(0.175, 0.012, 16, 32);

    this.products.forEach((product, idx) => {
      const angle = arcAngles[idx % arcAngles.length];
      const x = Math.sin(angle) * arcRadius;
      const z = -Math.cos(angle) * arcRadius + 0.15;

      const baseGroup = new THREE.Group();
      baseGroup.position.set(x, 0, z);

      // Base cylinder
      const pedestalMesh = new THREE.Mesh(pedGeo, pedMat.clone());
      pedestalMesh.position.y = 0.375;
      baseGroup.add(pedestalMesh);

      // Neon Top Ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: idx === this.activeIndex ? 0x10b981 : 0x38bdf8,
      });
      const glowRingMesh = new THREE.Mesh(ringGeo, ringMat);
      glowRingMesh.rotation.x = Math.PI / 2;
      glowRingMesh.position.y = 0.755;
      baseGroup.add(glowRingMesh);

      // Floating Mini Preview Model (LOD: Low-Poly Proxy with fast standard materials)
      const previewModel = new THREE.Group();
      previewModel.scale.setScalar(0.48);
      previewModel.position.set(0, 0.98, 0);
      buildLowPolyProxyModel(product.modelType, previewModel, 'titanium');
      baseGroup.add(previewModel);

      // 3D Canvas Label (Billboard with optimized power-of-two texture)
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 512;
      labelCanvas.height = 128;
      const ctx = labelCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.roundRect(10, 10, 492, 108, 20);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = idx === this.activeIndex ? '#10b981' : '#38bdf8';
        ctx.stroke();

        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(product.name, 256, 55);

        ctx.font = 'bold 32px sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`$${product.price} USD`, 256, 96);
      }
      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      labelTexture.colorSpace = THREE.SRGBColorSpace;
      labelTexture.generateMipmaps = false;
      labelTexture.minFilter = THREE.LinearFilter;
      const labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.11),
        new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true })
      );
      labelMesh.position.set(0, 1.25, 0);
      labelMesh.lookAt(0, 1.25, 0); // Face center/user
      baseGroup.add(labelMesh);

      // Simplified invisible collision proxy for instant zero-latency spatial raycasting
      const hitProxy = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.28, 1.35, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitProxy.position.y = 0.68;
      hitProxy.name = `PedestalHitProxy_${product.id}`;
      baseGroup.add(hitProxy);

      // Make pedestal selectable in XR & Desktop
      baseGroup.name = `Pedestal_${product.id}`;
      (baseGroup as any).xb = { interactionEnabled: true };

      this.add(baseGroup);
      this.pedestals.push({
        product,
        baseGroup,
        pedestalMesh,
        glowRingMesh,
        previewModel,
        textMesh: labelMesh,
        angle,
      });
    });
  }

  // --- 4. Central Active Examination Stage ---
  private buildCenterExaminationDais() {
    this.centerDais = new THREE.Group();
    this.centerDais.position.set(0, 0, -1.15);

    // Glowing Circular Glass Dais
    const daisGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.08, 48);
    const daisMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.2,
      metalness: 0.9,
    });
    const daisMesh = new THREE.Mesh(daisGeo, daisMat);
    daisMesh.position.y = 0.04;
    this.centerDais.add(daisMesh);

    // Concentric Neon Rim
    const rimGeo = new THREE.TorusGeometry(0.44, 0.015, 16, 48);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 0.082;
    this.centerDais.add(rimMesh);

    // Soft Contact Shadow for central model
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const ctx = shadowCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
    const shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.75, depthWrite: false })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.084;
    this.centerDais.add(shadowMesh);

    this.add(this.centerDais);

    // Active Model Root (Elevated to ergonomic chest height: Y: 1.35m, Z: -1.15m)
    this.activeModelRoot = new THREE.Group();
    this.activeModelRoot.position.set(0, 1.35, -1.15);

    // Enable direct XR Blocks Manipulation (Grab, pinch, rotate in VR!)
    (this.activeModelRoot as any).xb = {
      manipulation: true,
      interactionEnabled: true,
    };
    this.add(this.activeModelRoot);
  }

  // --- 5. Spatial UI Card (XR Blocks) ---
  private buildSpatialUI() {
    const p = this.products[this.activeIndex];

    this.uiTitleText = new xb.UIText({
      text: p.name.toUpperCase(),
      style: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: '#ffffff' },
    });

    this.uiMetaText = new xb.UIText({
      text: `★ ${p.rating.toFixed(1)} (${p.reviewCount} reviews) · ${p.category.toUpperCase()}`,
      style: { fontSize: 14, opacity: 0.75, textAlign: 'center', color: '#94a3b8' },
    });

    this.uiPriceText = new xb.UIText({
      text: `$${p.price.toLocaleString()} USD · ${p.stock} units available`,
      style: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', color: '#38bdf8' },
    });

    const specsSummary = `Battery: ${p.specs.batteryLife}  |  Weight: ${p.specs.weight}  |  ${p.specs.sensors}`;
    this.uiSpecsText = new xb.UIText({
      text: specsSummary,
      style: { fontSize: 13, textAlign: 'center', opacity: 0.7, color: '#cbd5e1' },
    });

    this.uiStatusText = new xb.UIText({
      text: 'Grab, rotate, or pinch to inspect in 3D.',
      style: { fontSize: 14, textAlign: 'center', color: '#a5b4fc' },
    });

    // Material Finish Swatches
    const makeFinishBtn = (label: string, finish: ModelFinish, color: string) =>
      new xb.UIButton({
        label,
        style: {
          flexGrow: 1,
          backgroundColor: this.currentFinish === finish ? color : '#1e293b',
          borderRadius: 8,
          fontSize: 13,
        },
        onClick: () => {
          this.currentFinish = finish;
          this.playClick();
          this.loadActiveModel();
          this.uiStatusText.text = `Finish applied: ${label}`;
        },
      });

    const finishRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 6 },
      children: [
        makeFinishBtn('Titanium', 'titanium', '#475569'),
        makeFinishBtn('Obsidian', 'obsidian', '#0f172a'),
        makeFinishBtn('Chrome', 'chrome', '#94a3b8'),
        makeFinishBtn('Emerald', 'emerald', '#065f46'),
      ],
    });

    // Carousel Navigation
    const prevBtn = new xb.UIButton({
      label: 'Prev',
      icon: 'navigate_before',
      style: { width: 90 },
      onClick: () => {
        this.selectProduct((this.activeIndex - 1 + this.products.length) % this.products.length);
      },
    });

    const nextBtn = new xb.UIButton({
      label: 'Next',
      icon: 'navigate_next',
      style: { width: 90 },
      onClick: () => {
        this.selectProduct((this.activeIndex + 1) % this.products.length);
      },
    });

    this.uiSpinButton = new xb.UIButton({
      label: 'Pause',
      icon: 'pause',
      style: { flexGrow: 1 },
      onClick: () => {
        this.isSpinning = !this.isSpinning;
        this.uiSpinButton.label = this.isSpinning ? 'Pause' : 'Spin';
        this.uiSpinButton.icon = this.isSpinning ? 'pause' : 'play_arrow';
        this.playClick();
      },
    });

    this.uiCartButton = new xb.UIButton({
      label: 'Add to Cart',
      icon: 'shopping_bag',
      style: { flexGrow: 2, backgroundColor: '#2563eb' },
      onClick: () => {
        const prod = this.products[this.activeIndex];
        inventoryService.addToCart(prod.id, prod.variants[0]?.id || 'default', 1);
        this.playChime();
        this.uiCartButton.label = 'Added!';
        this.uiStatusText.text = `Added 1x ${prod.name} to cart.`;
        setTimeout(() => {
          this.uiCartButton.label = 'Add to Cart';
        }, 1800);
      },
    });

    const exitBtn = new xb.UIButton({
      label: 'Exit VR Showroom',
      icon: 'close',
      style: { width: '100%', backgroundColor: '#334155' },
      onClick: () => {
        const coreAny = xb.core as any;
        if (coreAny.session) {
          coreAny.session.end();
        }
      },
    });

    // Assembled Card
    this.uiCard = new xb.UICard({
      size: { width: 0.64, height: 'auto' },
      manipulation: true,
      edge: true,
      style: { flexDirection: 'column', gap: 12, padding: 20 },
      children: [
        new xb.UIText({
          text: 'AETHER SPATIAL SHOWROOM',
          style: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', opacity: 0.6 },
        }),
        this.uiTitleText,
        this.uiMetaText,
        this.uiPriceText,
        this.uiSpecsText,
        new xb.UIText({
          text: 'SELECT MATERIAL FINISH:',
          style: { fontSize: 12, fontWeight: 'bold', opacity: 0.7, marginTop: 4 },
        }),
        finishRow,
        new xb.UIPanel({
          style: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 6 },
          children: [prevBtn, this.uiSpinButton, nextBtn],
        }),
        new xb.UIPanel({
          style: { width: '100%', flexDirection: 'row', gap: 8 },
          children: [this.uiCartButton],
        }),
        this.uiStatusText,
        exitBtn,
      ],
    });

    // Angled to the right of the central model so view is 100% unobstructed
    this.uiCard.position.set(0.74, 1.38, -1.05);
    this.uiCard.rotation.y = -0.42;
    this.add(this.uiCard);
  }

  // --- 6. Load & Swap Central 3D Model ---
  private loadActiveModel() {
    if (!this.activeModelRoot) return;

    if (this.activeModelGroup) {
      this.activeModelRoot.remove(this.activeModelGroup);
      disposeHierarchy(this.activeModelGroup);
      this.activeModelGroup = null;
    }

    const p = this.products[this.activeIndex];
    this.activeModelGroup = new THREE.Group();
    buildModelByType(p.modelType, this.activeModelGroup, this.currentFinish);

    // Initial scale & rotation
    this.activeModelGroup.scale.setScalar(1.0);
    this.activeModelRoot.add(this.activeModelGroup);

    // Update Spatial UI
    this.updateSpatialUI();

    // Highlight the active pedestal ring
    this.pedestals.forEach((ped, idx) => {
      const isSelected = idx === this.activeIndex;
      (ped.glowRingMesh.material as THREE.MeshBasicMaterial).color.set(
        isSelected ? 0x10b981 : 0x38bdf8
      );
    });
  }

  private updateSpatialUI() {
    if (!this.uiTitleText) return;
    const p = this.products[this.activeIndex];
    this.uiTitleText.text = p.name.toUpperCase();
    this.uiMetaText.text = `★ ${p.rating.toFixed(1)} (${p.reviewCount} reviews) · ${p.category.toUpperCase()}`;
    this.uiPriceText.text = `$${p.price.toLocaleString()} USD · ${p.stock} units available`;
    this.uiSpecsText.text = `Battery: ${p.specs.batteryLife}  |  Weight: ${p.specs.weight}  |  ${p.specs.sensors}`;
    this.uiStatusText.text = 'Grab, rotate, or pinch to inspect in 3D.';
  }

  public selectProduct(index: number) {
    if (index < 0 || index >= this.products.length || index === this.activeIndex) return;
    this.activeIndex = index;
    this.playChime();
    this.loadActiveModel();
    inventoryService.addToast(
      'Virtual Showroom',
      `Inspecting ${this.products[this.activeIndex].name}`,
      'info'
    );
  }

  // --- 7. Direct Pointer & Raycast Selection of Pedestals ---
  onSelectStart(event: any) {
    // Check if user clicked or pointed at one of the radial pedestals
    let target = event.target;
    while (target && target !== this) {
      const match = this.pedestals.find((p) => p.baseGroup === target || target.name?.startsWith('Pedestal_'));
      if (match) {
        const idx = this.products.findIndex((prod) => prod.id === match.product.id);
        if (idx !== -1) {
          this.selectProduct(idx);
          if (event.stopPropagation) event.stopPropagation();
          return;
        }
      }
      target = target.parent;
    }
  }

  // --- 8. Update & Animation Loop ---
  update() {
    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // Subtle Idle Rotation of Active Model
    if (this.isSpinning && this.activeModelGroup) {
      this.activeModelGroup.rotation.y += this.spinSpeed;
    }

    // Gentle Floating Animation on Radial Pedestal Previews
    this.pedestals.forEach((ped, idx) => {
      ped.previewModel.rotation.y += 0.012;
      ped.previewModel.position.y = 0.98 + Math.sin(elapsed * 2 + idx * 1.2) * 0.03;
    });

    // Slow Atmosphere Dust Particle Drift
    if (this.dustParticles) {
      const pos = this.dustParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + delta * 0.06;
        if (y > 3.2) y = 0.2;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
  }

  dispose() {
    if (this.roomGroup) {
      disposeHierarchy(this.roomGroup);
      this.remove(this.roomGroup);
      this.roomGroup = null;
    }
    if (this.centerDais) {
      disposeHierarchy(this.centerDais);
      this.remove(this.centerDais);
      this.centerDais = null;
    }
    if (this.activeModelRoot) {
      disposeHierarchy(this.activeModelRoot);
      this.remove(this.activeModelRoot);
      this.activeModelRoot = null;
    }
    this.pedestals.forEach((p) => {
      disposeHierarchy(p.baseGroup);
      this.remove(p.baseGroup);
    });
    this.pedestals = [];
  }
}
