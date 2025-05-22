/**
 * Procedural noise helpers:
 *  – multi-octave Simplex fBm
 *  – ridged multifractal variant
 *  – domain-warp (2-D)
 *
 * Pure TS, no WebGL; heavy arrays are generated in a worker.
 */
import Simplex from 'simplex-noise';

export interface NoiseOpts {
  seed: string | number;
  octaves: number;
  amplitude: number;
  frequency: number;
  persistence: number;
  lacunarity: number;
  ridged: number;       // 0 = normal fBm, 1 = fully ridged
  warpAmplitude: number;
  warpFreq: number;
}

export function generateHeight(
  size: number,
  opts: NoiseOpts,
  out: Float32Array = new Float32Array(size * size)
): Float32Array {
  const simplex = new Simplex(opts.seed.toString());
  const { octaves, amplitude, frequency, persistence, lacunarity, ridged, warpAmplitude, warpFreq } = opts;

  let idx = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      // domain warp
      const warpX = x + warpAmplitude * simplex.noise2D(x * warpFreq, z * warpFreq);
      const warpZ = z + warpAmplitude * simplex.noise2D((x + 1000) * warpFreq, (z + 1000) * warpFreq);

      let amp = amplitude;
      let freq = frequency;
      let height = 0;

      for (let o = 0; o < octaves; o++) {
        let n = simplex.noise2D(warpX * freq, warpZ * freq);
        if (ridged > 0) {
          n = 1 - Math.abs(n);       // turn valleys into ridges
          n *= n;                    // sharper
          n *= ridged;               // interpolate between normal & ridged
        }
        height += n * amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      out[idx++] = height;
    }
  }
  normalize(out);
  return out;
}

function normalize(arr: Float32Array) {
  let min = Infinity, max = -Infinity;
  for (let v of arr) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min;
  for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] - min) / range;
}
