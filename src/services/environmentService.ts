import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

let cachedEnvironmentTexture: THREE.Texture | null = null;
let isSoftwareGlCache: boolean | null = null;

/**
 * Detects software WebGL (headless browsers, SwiftShader, llvmpipe, WARP)
 * to adjust expensive multi-pass features without altering scene composition.
 */
export function isSoftwareGl(): boolean {
  if (isSoftwareGlCache !== null) return isSoftwareGlCache;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      isSoftwareGlCache = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    isSoftwareGlCache = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    isSoftwareGlCache = false;
  }
  return isSoftwareGlCache;
}

/**
 * Singleton PMREM Environment Generator.
 * Generates the studio reflection texture only ONCE and caches it
 * across all 2D model viewers and WebXR showroom sessions.
 */
export function getSharedEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (cachedEnvironmentTexture) {
    return cachedEnvironmentTexture;
  }
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  cachedEnvironmentTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
  pmremGenerator.dispose();
  return cachedEnvironmentTexture;
}

/**
 * Asynchronously pre-warms shaders for a scene and camera,
 * eliminating the 150-300ms runtime compilation hitch upon first object view.
 */
export async function prewarmShaders(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera
): Promise<void> {
  if (isSoftwareGl()) return; // Skip heavy compile pass on software GL
  try {
    if (typeof (renderer as any).compileAsync === 'function') {
      await (renderer as any).compileAsync(scene, camera);
    } else {
      renderer.compile(scene, camera);
    }
  } catch (err) {
    console.debug('Shader pre-warm note:', err);
  }
}

/**
 * Thorough disposal helper for Three.js Object3D hierarchies.
 * Ensures all geometries, materials, and internal textures are freed from GPU memory.
 */
export function disposeHierarchy(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => disposeMaterial(mat));
        } else {
          disposeMaterial(mesh.material);
        }
      }
    }
  });
}

function disposeMaterial(mat: THREE.Material): void {
  // Dispose all associated textures
  for (const key of Object.keys(mat)) {
    const val = (mat as any)[key];
    if (val && typeof val.dispose === 'function') {
      val.dispose();
    }
  }
  mat.dispose();
}
