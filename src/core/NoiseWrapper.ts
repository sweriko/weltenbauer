import { createNoise2D } from 'simplex-noise';

export interface NoiseParameters {
    seed?: number | string;
    scale: number;
    octaves: number;
    persistence: number;
    lacunarity: number;
    heightMultiplier: number;
}

// Simple LCG PRNG for seeding
function LCG(seed: number) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 2**32;
        return state / 2**32;
    };
}

export class NoiseWrapper {
    private noiseFn: (x: number, y: number) => number;
    private currentSeed: number | string | undefined;

    constructor(seed?: number | string) {
        this.currentSeed = seed;
        this.initializeNoiseFunction();
    }

    private initializeNoiseFunction(): void {
        let randomFn;
        if (typeof this.currentSeed === 'number') {
            randomFn = LCG(this.currentSeed);
        } else if (typeof this.currentSeed === 'string' && this.currentSeed.length > 0) {
            let hash = 0;
            for (let i = 0; i < this.currentSeed.length; i++) {
                const char = this.currentSeed.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash |= 0; // Convert to 32bit integer
            }
            randomFn = LCG(hash);
        } else {
            // Default to Math.random if no seed or empty string seed
            randomFn = Math.random;
        }
        this.noiseFn = createNoise2D(randomFn);
    }

    public setSeed(seed?: number | string): void {
        this.currentSeed = seed;
        this.initializeNoiseFunction();
    }

    /**
     * Generates a 2D noise value for given x, y coordinates.
     * @param x The x-coordinate.
     * @param y The y-coordinate.
     * @returns A noise value between -1 and 1.
     */
    public noise2D(x: number, y: number): number {
        return this.noiseFn(x, y);
    }

    /**
     * Generates a 2D Fractional Brownian Motion (fBm) noise value.
     * @param x The x-coordinate.
     * @param y The y-coordinate.
     * @param params Noise parameters (scale, octaves, persistence, lacunarity).
     * @returns A noise value, typically between -1 and 1 but can exceed this range depending on persistence.
     */
    public fBm2D(x: number, y: number, params: Omit<NoiseParameters, 'seed' | 'heightMultiplier'>): number {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;

        for (let i = 0; i < params.octaves; i++) {
            total += this.noise2D(x * frequency / params.scale, y * frequency / params.scale) * amplitude;
            maxValue += amplitude;
            amplitude *= params.persistence;
            frequency *= params.lacunarity;
        }
        return maxValue === 0 ? 0 : total / maxValue; // Avoid division by zero if octaves = 0 or persistence makes amplitude 0 quickly
    }

    /**
     * Generates a 2D ridged multifractal noise value.
     * This creates more pronounced ridges and valleys.
     * @param x The x-coordinate.
     * @param y The y-coordinate.
     * @param params Noise parameters.
     * @returns A noise value, typically between 0 and 1.
     */
    public ridgedFBM2D(x: number, y: number, params: Omit<NoiseParameters, 'seed' | 'heightMultiplier'>): number {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let weight = 1;

        const ridgeOffset = 1.0;
        const ridgeGain = 2.0;

        for (let i = 0; i < params.octaves; i++) {
            let n = this.noise2D(x * frequency / params.scale, y * frequency / params.scale);
            n = ridgeOffset - Math.abs(n);
            n = n * n;
            n *= weight;

            weight = Math.max(0, Math.min(1, n * ridgeGain));
            if (weight < 0.001 && i > 0) { // Optimization: if weight is negligible, further octaves won't contribute much
                break;
            }

            total += n * amplitude;
            amplitude *= params.persistence;
            frequency *= params.lacunarity;
        }
        
        // Normalization for ridged noise is tricky and depends on parameters.
        // This is a heuristic. A more robust approach might involve analyzing min/max output for given params.
        let normalizationFactor = 0;
        let amp = 1;
        for(let i=0; i < params.octaves; i++) {
            normalizationFactor += amp;
            amp *= params.persistence;
        }
        normalizationFactor = normalizationFactor * 0.7; // Approximate adjustment

        return normalizationFactor === 0 ? 0 : total / normalizationFactor;
    }
} 