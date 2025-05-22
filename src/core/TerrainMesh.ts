import * as THREE from 'three';
import { Heightmap }         from './Heightmap';
import { createSplatMaterial } from './SplatMaterial';

/**
 * PlaneGeometry wrapped in a custom material + height-field displacement.
 * Updates vertex Y in place when the heightmap changes.
 */
export class TerrainMesh extends THREE.Mesh {
  hm: Heightmap;
  private readonly geometryInternal: THREE.PlaneGeometry;

  constructor(size = 512, _scale = 1, hm?: Heightmap) {
    /* -------- height-map -------------------------------------------------- */
    const heightmap = hm ?? new Heightmap(size);

    /* -------- geometry ---------------------------------------------------- */
    const geom = new THREE.PlaneGeometry(size, size, size - 1, size - 1);
    geom.rotateX(-Math.PI / 2);          // lay flat on XZ

    /* -------- placeholder textures (1×1 white) ---------------------------- */
    const white = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    white.needsUpdate = true;

    const mat = createSplatMaterial({
      tiles: 128,
      splat: white,
      tex  : [
        { color: white },
        { color: white },
        { color: white },
        { color: white },
      ],
    });

    super(geom, mat);

    this.hm                = heightmap;
    this.geometryInternal  = geom;
    this.updateGeometry();
  }

  /** Re-upload heights + recompute normals */
  updateGeometry(): void {
    const { hm, geometryInternal } = this;
    const pos = geometryInternal.attributes.position as THREE.BufferAttribute;
    const sz  = hm.size;

    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sz; x++) {
        const idx = (z * sz + x) * 3 + 1;        // +1 = Y component
        pos.array[idx] = hm.heightAt(x, z) * 120;
      }
    }
    pos.needsUpdate = true;
    geometryInternal.computeVertexNormals();
    geometryInternal.attributes.normal.needsUpdate = true;
  }
}
