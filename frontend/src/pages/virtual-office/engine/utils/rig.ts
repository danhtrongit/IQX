import {
  type Bone, BufferAttribute, type BufferGeometry, type Material, Matrix4, Mesh, MeshStandardMaterial, type Object3D, Skeleton,
  SkinnedMesh, Uint16BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Animatable {
  readonly root: Object3D;
  update(dt: number): void;
  setPose(pose: never): void;
}

/** One shared vertex-coloured material for all plain (untextured, opaque, non-emissive) parts. */
const plainMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });

const isPlain = (m: Material): m is MeshStandardMaterial => {
  const s = m as MeshStandardMaterial;
  return !!s.isMeshStandardMaterial && !s.map && !s.transparent && s.emissive.getHex() === 0 && s.metalness < 0.3;
};

/**
 * Cuts draw calls of a procedural rig: meshes that never move relative to their parent joint
 * (detected by exercising every pose) are merged per (parent, material).
 */
export function mergeRigidParts<P extends string>(model: Animatable & { setPose(p: P): void }, poses: readonly P[]): void {
  const meshes: Mesh[] = [];
  model.root.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  const snap = (m: Mesh) => `${m.visible}|${m.matrix.elements.map((v) => v.toFixed(4)).join(',')}`;
  const base = new Map<Mesh, string>();
  model.root.updateMatrixWorld(true);
  for (const m of meshes) {
    m.updateMatrix();
    base.set(m, snap(m));
  }
  const dynamic = new Set<Mesh>();
  const nodes: Object3D[] = [];
  model.root.traverse((o) => nodes.push(o));
  const vis = new Map(nodes.map((o) => [o, o.visible]));
  for (const pose of poses) {
    model.setPose(pose);
    for (let i = 0; i < 12; i++) {
      model.update(0.37);
      for (const m of meshes) {
        m.updateMatrix();
        if (snap(m) !== base.get(m)) dynamic.add(m);
      }
      for (const o of nodes) if (o.visible !== vis.get(o)) o.userData.toggles = true;
    }
  }

  const groups = new Map<string, { parent: Object3D; material: Material; items: Mesh[] }>();
  for (const m of meshes) {
    if (dynamic.has(m) || !m.parent || Array.isArray(m.material) || m.children.length) continue;
    const mat = m.material as Material;
    const plain = isPlain(mat);
    const key = `${m.parent.uuid}|${plain ? 'plain' : mat.uuid}|${m.castShadow}|${m.receiveShadow}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { parent: m.parent, material: plain ? plainMat : mat, items: [] }));
    g.items.push(m);
  }

  for (const { parent, material, items } of groups.values()) {
    const plain = material === plainMat;
    if (items.length < 2 && !plain) continue;
    const geos: BufferGeometry[] = items.map((m) => {
      let g = m.geometry.clone().applyMatrix4(new Matrix4().compose(m.position, m.quaternion, m.scale));
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (plain) {
        const c = (m.material as MeshStandardMaterial).color;
        const n = g.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
        g.setAttribute('color', new BufferAttribute(arr, 3));
      }
      return g;
    });
    if (!geos.every((g) => g.attributes.uv)) geos.forEach((g) => g.deleteAttribute('uv'));
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new Mesh(merged, material);
    mesh.castShadow = items[0].castShadow;
    mesh.receiveShadow = items[0].receiveShadow;
    for (const m of items) parent.remove(m);
    parent.add(mesh);
  }
}

/** Props (phone, paddle, mug…) live under `prop:*` groups that are toggled at runtime; never fold them into the body. */
function insideProp(o: Object3D, root: Object3D): boolean {
  for (let p: Object3D | null = o; p && p !== root; p = p.parent) if (p.name.startsWith('prop:') || p.userData.toggles) return true;
  return false;
}

/**
 * Folds every vertex-coloured rigid part into a single SkinnedMesh whose bones are the rig joints
 * (each vertex 100 % weighted to its joint). The whole body then renders in one draw call.
 * Call after mergeRigidParts.
 */
export function skinRigidParts(root: Object3D): SkinnedMesh | null {
  root.updateMatrixWorld(true);
  const rootInv = new Matrix4().copy(root.matrixWorld).invert();
  const parts: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.material === plainMat && m.parent && !insideProp(m, root)) parts.push(m);
  });
  if (parts.length < 2) return null;

  const bones: Object3D[] = [];
  const geos: BufferGeometry[] = [];
  for (const m of parts) {
    const joint = m.parent!;
    let bi = bones.indexOf(joint);
    if (bi < 0) bi = bones.push(joint) - 1;
    const toRoot = new Matrix4().multiplyMatrices(rootInv, joint.matrixWorld).multiply(m.matrix);
    const g = m.geometry.clone().applyMatrix4(toRoot);
    const n = g.attributes.position.count;
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = bi;
      w[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new BufferAttribute(w, 4));
    geos.push(g);
  }
  if (!geos.every((g) => g.attributes.uv)) geos.forEach((g) => g.deleteAttribute('uv'));
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return null;

  for (const m of parts) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  const skinned = new SkinnedMesh(merged, plainMat);
  skinned.frustumCulled = false;
  root.add(skinned);
  root.updateMatrixWorld(true);
  // Rig joints are plain Groups; Skeleton only needs their matrixWorld.
  skinned.bind(new Skeleton(bones as unknown as Bone[]));
  return skinned;
}
