import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { ModelFinish, ModelPartInfo } from './ModelBuilders';
import { buildModelByType, getMaterialForFinish } from './ModelBuilders';

export type { ModelFinish };

export class ThreeModelViewer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private currentModelGroup: THREE.Group | null = null;
  private parts: ModelPartInfo[] = [];
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
    buildModelByType(type, group, finish, this.parts);

    this.currentModelGroup = group;
    this.scene.add(group);
  }

  public setExplodedView(factor: number) {
    this.targetExplodeFactor = Math.max(0, Math.min(1, factor));
  }

  public setFinish(finish: ModelFinish) {
    this.currentFinish = finish;
    if (this.currentModelGroup) {
      // Re-apply to all metal parts
      const newMat = getMaterialForFinish(finish);
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
