// Browser-side conversion of 3D models to GLB, so the server only ever stores (and validates) glTF binaries.
// three.js is loaded on demand: this code only runs when someone imports a model in Bibliotecas.

export type ModelFormat = 'glb' | 'gltf' | '3ds' | 'obj' | 'dae' | 'fbx' | 'skp';
export const MODEL_EXT = ['.glb', '.gltf', '.3ds', '.obj', '.dae', '.fbx', '.skp'];

export const formatOf = (name: string): ModelFormat | null => {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return (['glb', 'gltf', '3ds', 'obj', 'dae', 'fbx', 'skp'] as const).find((f) => f === ext) ?? null;
};

/** SketchUp files are a closed binary format with no open reader; explain the export path instead of failing silently. */
export const SKP_HELP =
  'Los archivos .skp de SketchUp no se pueden leer fuera de SketchUp (su formato es cerrado). En SketchUp usa Archivo → Exportar → Modelo 3D y elige ' +
  'COLLADA (.dae) o 3DS (.3ds); después súbelo aquí y lo convertimos a GLB automáticamente. SketchUp 2025 o posterior también exporta glTF (.glb) directo.';

export interface Converted {
  glb: Blob;
  name: string;
  /** Size in cm after unit normalisation (bounding box). */
  size: { w: number; h: number; d: number };
  triangles: number;
  note?: string;
}

/**
 * Converts 3DS / OBJ / DAE / FBX to GLB. Units are guessed from the bounding box: models larger than 20 “units” are
 * treated as millimetres or centimetres and scaled to metres (glTF's unit), and the model sits on the floor (y = 0).
 */
export async function toGlb(file: File): Promise<Converted> {
  const fmt = formatOf(file.name);
  if (fmt === 'skp') throw new Error(SKP_HELP);
  if (!fmt || fmt === 'glb' || fmt === 'gltf') throw new Error('Formato no convertible.');
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const buf = await file.arrayBuffer();
  let root: import('three').Object3D;
  let note: string | undefined;
  if (fmt === '3ds') {
    const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js');
    root = new TDSLoader().parse(buf, '');
    // 3DS is Z-up.
    root.rotation.x = -Math.PI / 2;
  } else if (fmt === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    root = new OBJLoader().parse(new TextDecoder().decode(buf));
    note = 'Los OBJ no traen materiales incrustados; se usa un material neutro.';
  } else if (fmt === 'dae') {
    const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
    const c = new ColladaLoader().parse(new TextDecoder().decode(buf), '');
    if (!c?.scene) throw new Error('El archivo COLLADA no tiene una escena válida.');
    root = c.scene;
  } else {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    root = new FBXLoader().parse(buf, '');
  }
  const scene = new THREE.Scene();
  scene.add(root);
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) throw new Error('El modelo no tiene geometría visible.');
  const size0 = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size0.x, size0.y, size0.z);
  // Furniture is 0.2–4 m: pick the unit that lands it there.
  const scale = maxDim > 400 ? 0.001 : maxDim > 20 ? 0.01 : 1;
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const s = box.getSize(new THREE.Vector3());
  let triangles = 0;
  const fallback = new THREE.MeshStandardMaterial({ color: 0xd9d6d0, roughness: 0.6 });
  root.traverse((o) => {
    const mesh = o as import('three').Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    triangles += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // GLTFExporter only understands Standard/Physical/Basic materials well; convert the legacy ones.
    const conv = mats.map((m) => {
      if (!m) return fallback;
      const legacy = m as import('three').MeshPhongMaterial;
      if ((m as import('three').MeshStandardMaterial).isMeshStandardMaterial) return m;
      return new THREE.MeshStandardMaterial({ name: m.name, color: legacy.color ?? 0xd9d6d0, map: legacy.map ?? null, transparent: m.transparent, opacity: m.opacity, roughness: 0.6, metalness: 0 });
    });
    mesh.material = Array.isArray(mesh.material) ? conv : conv[0]!;
  });
  const out = (await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true })) as ArrayBuffer;
  return {
    glb: new Blob([out], { type: 'model/gltf-binary' }),
    name: file.name.replace(/\.[^.]+$/, '.glb'),
    size: { w: Math.round(s.x * 100), h: Math.round(s.y * 100), d: Math.round(s.z * 100) },
    triangles: Math.round(triangles),
    note: scale !== 1 ? [note, `Unidades detectadas: ${scale === 0.001 ? 'milímetros' : 'centímetros'}; se convirtió a metros.`].filter(Boolean).join(' ') : note,
  };
}
