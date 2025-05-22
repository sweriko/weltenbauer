/**
 * Distributes identical meshes as GPU-instanced foliage / rocks
 * with simple slope / height filters.
 */
import * as THREE from 'three';
import { Heightmap } from './Heightmap';

export interface ScatterOpts {
  mesh          : THREE.Mesh;
  density       : number;            // instances / 1000 units²
  minSlope?     : number;            // 0..1 (sinθ) – flat=0, vertical=1
  maxSlope?     : number;
  minHeight?    : number;
  maxHeight?    : number;
  randomScale?  : [number, number];
  alignToNormal?: boolean;
}

export class ScatterSystem {
  readonly instanced: THREE.InstancedMesh;

  constructor(terrain: THREE.Mesh, hm: Heightmap, opts: ScatterOpts) {
    /* number of instances */
    const area    = hm.size * hm.size;
    const count   = Math.floor(opts.density * area / 1_000);
    const inst    = new THREE.InstancedMesh(opts.mesh.geometry, opts.mesh.material, count);

    const dummy   = new THREE.Object3D();
    const up      = new THREE.Vector3(0, 1, 0);
    let placed    = 0;

    while (placed < count) {
      const x = Math.random() * hm.size;
      const z = Math.random() * hm.size;
      const y = hm.sample(x, z) * 120;

      /* slope from height gradient */
      const gx = hm.sample(x + 1, z) - hm.sample(x - 1, z);
      const gz = hm.sample(x, z + 1) - hm.sample(x, z - 1);
      const slope = Math.min(1, Math.hypot(gx, gz) * 60);   // tuned scale

      /* reject if out of requested filters */
      if (opts.minHeight !== undefined && y < opts.minHeight) continue;
      if (opts.maxHeight !== undefined && y > opts.maxHeight) continue;
      if (opts.minSlope  !== undefined && slope < opts.minSlope) continue;
      if (opts.maxSlope  !== undefined && slope > opts.maxSlope) continue;

      /* transform --------------------------------------------------------- */
      dummy.position.set(x - hm.size / 2, y, z - hm.size / 2);
      dummy.rotation.y = Math.random() * Math.PI * 2;

      const scale = rand(opts.randomScale ?? [0.8, 1.2]);
      dummy.scale.setScalar(scale);

      if (opts.alignToNormal) {
        const normal = new THREE.Vector3(-gx, 2, -gz).normalize();
        dummy.quaternion.setFromUnitVectors(up, normal);
      }

      dummy.updateMatrix();
      inst.setMatrixAt(placed++, dummy.matrix);
    }

    inst.instanceMatrix.needsUpdate = true;
    this.instanced = inst;
  }
}

/* util */
function rand([a, b]: [number, number]): number {
  return a + Math.random() * (b - a);
}
