import { DoubleSide, FrontSide, MeshStandardMaterial, type Texture } from 'three';

export interface MatOptions {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  map?: Texture | null;
  emissiveMap?: Texture | null;
  transparent?: boolean;
  opacity?: number;
  doubleSide?: boolean;
  envMapIntensity?: number;
}

const cache = new Map<string, MeshStandardMaterial>();

/** Shared PBR material cache – identical params return the same instance (helps batching). */
export function mat(color: number, o: MatOptions = {}): MeshStandardMaterial {
  const key = [
    color, o.roughness ?? 0.8, o.metalness ?? 0, o.emissive ?? 0, o.emissiveIntensity ?? 1,
    o.map?.uuid ?? '', o.emissiveMap?.uuid ?? '', o.transparent ?? false, o.opacity ?? 1, o.doubleSide ?? false,
    o.envMapIntensity ?? 1,
  ].join('|');
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color,
      roughness: o.roughness ?? 0.8,
      metalness: o.metalness ?? 0,
      emissive: o.emissive ?? 0,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      map: o.map ?? null,
      emissiveMap: o.emissiveMap ?? null,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
      side: o.doubleSide ? DoubleSide : FrontSide,
      envMapIntensity: o.envMapIntensity ?? 1,
      depthWrite: !(o.transparent && (o.opacity ?? 1) < 0.6),
    });
    cache.set(key, m);
  }
  return m;
}

/** Common palette of finishes. */
export const M = {
  wall: () => mat(0xd8d6d2, { roughness: 0.92 }),
  featureWall: () => mat(0x2a303c, { roughness: 0.85 }),
  trim: () => mat(0xf7f6f2, { roughness: 0.6 }),
  skirting: () => mat(0x2d323c, { roughness: 0.5 }),
  aluminium: () => mat(0xb9c0ca, { roughness: 0.35, metalness: 0.85 }),
  darkMetal: () => mat(0x2a2e35, { roughness: 0.4, metalness: 0.7 }),
  chrome: () => mat(0xe3e7ec, { roughness: 0.15, metalness: 1 }),
  blackPlastic: () => mat(0x15171b, { roughness: 0.45 }),
  greyPlastic: () => mat(0x3a3f48, { roughness: 0.55 }),
  whitePlastic: () => mat(0xf1f2f4, { roughness: 0.45 }),
  laminate: () => mat(0xd9d3c8, { roughness: 0.6 }),
  walnut: () => mat(0x5b3a26, { roughness: 0.38 }),
  oak: () => mat(0xb88a5a, { roughness: 0.55 }),
  glass: () => mat(0xcfe8ff, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 2 }),
  frosted: () => mat(0xffffff, { roughness: 0.9, transparent: true, opacity: 0.42 }),
  fabricBlue: () => mat(0x4f6584, { roughness: 1 }),
  fabricTeal: () => mat(0x3f6b6d, { roughness: 1 }),
  leather: () => mat(0x2b1c16, { roughness: 0.5 }),
  paper: () => mat(0xfbfbf8, { roughness: 0.9 }),
  soil: () => mat(0x3b2a1e, { roughness: 1 }),
};
