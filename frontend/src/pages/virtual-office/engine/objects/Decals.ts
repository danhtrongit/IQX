import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, type Texture } from 'three';
import { canvas } from '../utils/canvasTextures';

let radial: Texture | null = null;

function radialTexture(): Texture {
  if (radial) return radial;
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  radial = new CanvasTexture(c);
  return radial;
}

const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const shadowMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });

/** Soft contact shadow under a character (characters don't use the shadow map). */
export function blobShadow(size = 0.75): Mesh {
  if (!shadowMat.alphaMap) shadowMat.alphaMap = radialTexture();
  const m = new Mesh(geo, shadowMat);
  m.scale.set(size, 1, size * 0.85);
  m.position.y = 0.006;
  m.renderOrder = 1;
  return m;
}

/** Additive light pool on the floor. */
export function lightPool(x: number, z: number, r: number, color: number, intensity = 0.35): Mesh {
  const m = new Mesh(
    geo,
    new MeshBasicMaterial({ color, alphaMap: radialTexture(), transparent: true, opacity: intensity, depthWrite: false, blending: AdditiveBlending }),
  );
  m.scale.set(r * 2, 1, r * 2);
  m.position.set(x, 0.012, z);
  m.renderOrder = 1;
  return m;
}
