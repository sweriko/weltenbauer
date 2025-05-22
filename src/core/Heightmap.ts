import { Vector2 } from 'three';

/** In-memory height-field with brush operations. */
export class Heightmap {
  private readonly _size: number;
  private readonly _data: Float32Array;

  constructor(size = 512, data?: Float32Array) {
    this._size = size;
    this._data = data ?? new Float32Array(size * size);
  }

  /* basic getters --------------------------------------------------------- */
  get size()   { return this._size; }
  get buffer() { return this._data; }

  /** integer grid value (no bounds check for perf) */
  heightAt(x: number, z: number): number {
    return this._data[z * this._size + x];
  }

  /** bilinear sample in float coords */
  sample(u: number, v: number): number {
    u = THREE.MathUtils.clamp(u, 0, this._size - 1);
    v = THREE.MathUtils.clamp(v, 0, this._size - 1);

    const x0 = Math.floor(u), z0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, this._size - 1);
    const z1 = Math.min(z0 + 1, this._size - 1);
    const tx = u - x0, tz = v - z0;

    const a = this.heightAt(x0, z0) * (1 - tx) + this.heightAt(x1, z0) * tx;
    const b = this.heightAt(x0, z1) * (1 - tx) + this.heightAt(x1, z1) * tx;
    return a * (1 - tz) + b * tz;
  }

  /* ----------------------------------------------------------------------- */
  /* brushes                                                                 */
  /* ----------------------------------------------------------------------- */

  paintRaise(center: Vector2, radius: number, strength: number): void {
    this.paintCore(center, radius, (h, f) => h + strength * f);
  }

  paintFlatten(center: Vector2, radius: number, tgt: number, strength: number): void {
    this.paintCore(center, radius, (h, f) => h + (tgt - h) * strength * f);
  }

  paintSmooth(center: Vector2, radius: number, strength: number): void {
    const { _size } = this;
    this.paintCore(center, radius, (h, f, x, z) => {
      let sum = 0, cnt = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = THREE.MathUtils.clamp(x + dx, 0, _size - 1);
          const nz = THREE.MathUtils.clamp(z + dz, 0, _size - 1);
          sum += this.heightAt(nx, nz);
          cnt++;
        }
      }
      const avg = sum / cnt;
      return THREE.MathUtils.lerp(h, avg, strength * f);
    });
  }

  /* internal generic loop */
  private paintCore(
    center: Vector2,
    radius: number,
    fn: (h: number, falloff: number, x: number, z: number) => number,
  ): void {
    const { _size }      = this;
    const [cx, cz]       = [center.x, center.y];
    const r2             = radius * radius;

    const minX = Math.max(0, Math.floor(cx - radius));
    const minZ = Math.max(0, Math.floor(cz - radius));
    const maxX = Math.min(_size - 1, Math.ceil (cx + radius));
    const maxZ = Math.min(_size - 1, Math.ceil (cz + radius));

    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;

        const idx     = z * _size + x;
        const falloff = 1 - Math.sqrt(d2) / radius;          // 0..1
        this._data[idx] = fn(this._data[idx], falloff, x, z);
      }
    }
  }
}
