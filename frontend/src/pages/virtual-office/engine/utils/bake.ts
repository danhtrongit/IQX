import { BufferAttribute, type BufferGeometry, Group, type Material, Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges every static mesh under `root` into one mesh per (material, castShadow) pair.
 * Turns thousands of props into a few dozen draw calls.
 */
export function bakeStatic(root: Object3D): Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { material: Material; cast: boolean; geos: BufferGeometry[] }>();

  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as Material;
    let g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const key = `${material.uuid}|${mesh.castShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material, cast: mesh.castShadow, geos: [] }));
    b.geos.push(g);
  });

  const out = new Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const m = new Mesh(merged, b.material);
    m.castShadow = b.cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    out.add(m);
  }
  return out;
}
