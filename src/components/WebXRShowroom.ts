import * as THREE from 'three';
import * as xb from 'xrblocks';
import { Product } from '../types';
import { inventoryService } from '../services/inventoryService';

export class WebXRShowroom extends xb.Script {
  private product: Product;
  private pedestal: THREE.Mesh | null = null;
  private modelGroup: THREE.Group | null = null;
  private card: any = null;
  private rotationSpeed = 0.01;
  private isRotating = true;

  constructor(product: Product) {
    super();
    this.product = product;
  }

  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x475569, 2.5));
    const dirLight = new THREE.DirectionalLight(0xfff5ea, 2.5);
    dirLight.position.set(1.5, 4, 2);
    this.add(dirLight);

    // Pedestal
    const pedGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.9, 32);
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.6,
    });
    this.pedestal = new THREE.Mesh(pedGeo, pedMat);
    this.pedestal.position.set(0, 0.45, -1.2);
    this.add(this.pedestal);

    // Subtle Glowing Accent Ring on Pedestal Top
    const ringGeo = new THREE.TorusGeometry(0.32, 0.01, 16, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.set(0, 0.905, -1.2);
    this.add(ringMesh);

    // 3D Product Model
    this.modelGroup = new THREE.Group();
    this.modelGroup.position.set(0, 1.15, -1.2);
    this.buildShowroomModel(this.modelGroup);
    this.add(this.modelGroup);

    // Spatial UI Card using XR Blocks
    const statusText = new xb.UIText({
      text: `${this.product.name}\n$${this.product.price} USD · ${this.product.stock} in stock`,
      style: { fontSize: 18, textAlign: 'center', lineHeight: 1.4 },
    });

    const rotateBtn = new xb.UIButton({
      label: 'Toggle Spin',
      icon: 'rotate_right',
      style: { flexGrow: 1 },
      onClick: () => {
        this.isRotating = !this.isRotating;
      },
    });

    const addCartBtn = new xb.UIButton({
      label: 'Add to Cart',
      icon: 'shopping_bag',
      style: { flexGrow: 1 },
      onClick: () => {
        inventoryService.addToCart(this.product.id, this.product.variants[0]?.id || 'default', 1);
        statusText.text = `Added to Cart! ($${this.product.price} USD)`;
      },
    });

    const closeBtn = new xb.UIButton({
      label: 'Exit WebXR',
      icon: 'close',
      style: { flexGrow: 1 },
      onClick: () => {
        const coreAny = xb.core as any;
        if (coreAny.session) {
          coreAny.session.end();
        }
      },
    });

    this.card = new xb.UICard({
      size: { width: 0.58, height: 0.38 },
      manipulation: true,
      edge: true,
      style: { flexDirection: 'column', gap: 14, padding: 18 },
      children: [
        new xb.UIText({
          text: 'SPATIAL SHOWROOM',
          style: { fontSize: 26, fontWeight: 'bold', textAlign: 'center' },
        }),
        statusText,
        new xb.UIPanel({
          style: { width: '100%', flexDirection: 'row', gap: 10 },
          children: [rotateBtn, addCartBtn],
        }),
        closeBtn,
      ],
    });

    this.card.position.set(0.65, 1.25, -1.0);
    this.card.rotation.y = -0.3;
    this.add(this.card);
  }

  update() {
    if (this.isRotating && this.modelGroup) {
      this.modelGroup.rotation.y += this.rotationSpeed;
    }
  }

  private buildShowroomModel(group: THREE.Group) {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.9 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.3 });

    if (this.product.modelType === 'visor') {
      const visorGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3);
      const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x2563eb, roughness: 0.1, transmission: 0.75 });
      const vMesh = new THREE.Mesh(visorGeo, visorMat);
      vMesh.rotation.y = Math.PI / 2;
      group.add(vMesh);

      const frameGeo = new THREE.TorusGeometry(0.25, 0.02, 16, 32, Math.PI);
      const frameMesh = new THREE.Mesh(frameGeo, goldMat);
      frameMesh.rotation.x = Math.PI / 2;
      frameMesh.position.y = 0.08;
      group.add(frameMesh);
    } else if (this.product.modelType === 'ring') {
      const ringGeo = new THREE.TorusGeometry(0.18, 0.04, 16, 32);
      const ringMesh = new THREE.Mesh(ringGeo, goldMat);
      group.add(ringMesh);

      const gemGeo = new THREE.OctahedronGeometry(0.06, 2);
      const gemMat = new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, roughness: 0.05, transmission: 0.9 });
      const gemMesh = new THREE.Mesh(gemGeo, gemMat);
      gemMesh.position.set(0, 0.19, 0);
      group.add(gemMesh);
    } else {
      const baseGeo = new THREE.BoxGeometry(0.25, 0.1, 0.25);
      const baseMesh = new THREE.Mesh(baseGeo, darkMat);
      group.add(baseMesh);

      const coreGeo = new THREE.SphereGeometry(0.08, 24, 16);
      const coreMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.8 });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.y = 0.1;
      group.add(coreMesh);
    }
  }

  dispose() {
    if (this.pedestal) {
      this.pedestal.geometry.dispose();
      (this.pedestal.material as THREE.Material).dispose();
    }
  }
}
