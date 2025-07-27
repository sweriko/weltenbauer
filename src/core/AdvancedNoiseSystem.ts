/**
 * Advanced Noise System for Terrain Generation
 * Implements multiple noise types including fractal Perlin, FBM, ridged noise, and more
 */

export interface NoiseConfig {
  octaves: number
  frequency: number
  amplitude: number
  persistence: number
  lacunarity: number
  seed: number
  offset: { x: number; y: number }
}

export interface RidgedNoiseConfig extends NoiseConfig {
  ridgeOffset: number
  gain: number
  threshold: number
}

export interface FBMConfig extends NoiseConfig {
  warpStrength: number
  warpFrequency: number
  turbulence: boolean
}

export interface HybridConfig {
  baseNoise: NoiseConfig
  detailNoise: NoiseConfig
  warpNoise: NoiseConfig
  detailWeight: number
  warpWeight: number
}

export enum NoiseType {
  PERLIN = 'perlin',
  SIMPLEX = 'simplex', 
  RIDGED = 'ridged',
  FBM = 'fbm',
  TURBULENCE = 'turbulence',
  BILLOW = 'billow',
  HYBRID = 'hybrid',
  VORONOI = 'voronoi',
  WORLEY = 'worley'
}

export class AdvancedNoiseSystem {
  private permutation!: number[]
  private gradients!: Float32Array
  private seed: number

  constructor(seed: number = Date.now()) {
    this.seed = seed
    this.initializePermutationTable()
    this.initializeGradients()
  }

  private initializePermutationTable(): void {
    // Create permutation table based on seed
    this.permutation = new Array(512)
    const p = new Array(256)
    
    // Fill with sequential numbers
    for (let i = 0; i < 256; i++) {
      p[i] = i
    }
    
    // Shuffle using seeded random
    const random = this.seededRandom(this.seed)
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    
    // Duplicate for wrapping
    for (let i = 0; i < 256; i++) {
      this.permutation[i] = this.permutation[i + 256] = p[i]
    }
  }

  private initializeGradients(): void {
    // 3D gradient vectors
    const grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ]
    
    this.gradients = new Float32Array(256 * 3)
    for (let i = 0; i < 256; i++) {
      const gradIndex = i % grad3.length
      this.gradients[i * 3] = grad3[gradIndex][0]
      this.gradients[i * 3 + 1] = grad3[gradIndex][1]
      this.gradients[i * 3 + 2] = grad3[gradIndex][2]
    }
  }

  private seededRandom(seed: number): () => number {
    let state = seed
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return state / 4294967296
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a)
  }

  private grad(hash: number, x: number, y: number, z: number = 0): number {
    const h = hash & 15
    const u = h < 8 ? x : y
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z)
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }

  /**
   * Raw Perlin noise implementation
   */
  public perlin(x: number, y: number, z: number = 0): number {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    const Z = Math.floor(z) & 255
    
    x -= Math.floor(x)
    y -= Math.floor(y)
    z -= Math.floor(z)
    
    const u = this.fade(x)
    const v = this.fade(y)
    const w = this.fade(z)
    
    const A = this.permutation[X] + Y
    const AA = this.permutation[A] + Z
    const AB = this.permutation[A + 1] + Z
    const B = this.permutation[X + 1] + Y
    const BA = this.permutation[B] + Z
    const BB = this.permutation[B + 1] + Z
    
    return this.lerp(w,
      this.lerp(v,
        this.lerp(u, this.grad(this.permutation[AA], x, y, z),
                     this.grad(this.permutation[BA], x - 1, y, z)),
        this.lerp(u, this.grad(this.permutation[AB], x, y - 1, z),
                     this.grad(this.permutation[BB], x - 1, y - 1, z))),
      this.lerp(v,
        this.lerp(u, this.grad(this.permutation[AA + 1], x, y, z - 1),
                     this.grad(this.permutation[BA + 1], x - 1, y, z - 1)),
        this.lerp(u, this.grad(this.permutation[AB + 1], x, y - 1, z - 1),
                     this.grad(this.permutation[BB + 1], x - 1, y - 1, z - 1)))
    )
  }

  /**
   * Fractal Brownian Motion (fBm)
   */
  public fbm(x: number, y: number, config: FBMConfig): number {
    let total = 0
    let frequency = config.frequency
    let amplitude = config.amplitude
    let maxValue = 0

    // Apply warp if enabled
    if (config.warpStrength > 0) {
      const warpX = this.perlin(x * config.warpFrequency, y * config.warpFrequency) * config.warpStrength
      const warpY = this.perlin((x + 100) * config.warpFrequency, (y + 100) * config.warpFrequency) * config.warpStrength
      x += warpX
      y += warpY
    }

    for (let i = 0; i < config.octaves; i++) {
      let noise: number
      
      if (config.turbulence) {
        noise = Math.abs(this.perlin(
          (x + config.offset.x) * frequency,
          (y + config.offset.y) * frequency
        ))
      } else {
        noise = this.perlin(
          (x + config.offset.x) * frequency,
          (y + config.offset.y) * frequency
        )
      }
      
      total += noise * amplitude
      maxValue += amplitude
      
      amplitude *= config.persistence
      frequency *= config.lacunarity
    }

    return total / maxValue
  }

  /**
   * Ridged multifractal noise
   */
  public ridgedNoise(x: number, y: number, config: RidgedNoiseConfig): number {
    let total = 0
    let frequency = config.frequency
    let amplitude = config.amplitude
    let weight = 1.0

    for (let i = 0; i < config.octaves; i++) {
      let noise = this.perlin(
        (x + config.offset.x) * frequency,
        (y + config.offset.y) * frequency
      )
      
      // Create ridges
      noise = Math.abs(noise)
      noise = config.ridgeOffset - noise
      noise = noise * noise
      noise *= weight
      
      weight = Math.min(1.0, noise * config.gain)
      weight = Math.max(0.0, weight)
      
      total += noise * amplitude
      amplitude *= config.persistence
      frequency *= config.lacunarity
    }

    return total
  }

  /**
   * Billow noise (absolute value of fBm)
   */
  public billowNoise(x: number, y: number, config: NoiseConfig): number {
    let total = 0
    let frequency = config.frequency
    let amplitude = config.amplitude
    let maxValue = 0

    for (let i = 0; i < config.octaves; i++) {
      const noise = Math.abs(this.perlin(
        (x + config.offset.x) * frequency,
        (y + config.offset.y) * frequency
      ))
      
      total += noise * amplitude
      maxValue += amplitude
      
      amplitude *= config.persistence
      frequency *= config.lacunarity
    }

    return (total / maxValue) * 2 - 1
  }

  /**
   * Voronoi/Worley noise
   */
  public voronoiNoise(x: number, y: number, frequency: number = 1.0): number {
    const cellX = Math.floor(x * frequency)
    const cellY = Math.floor(y * frequency)
    
    let minDist = Infinity
    
    // Check 3x3 grid of cells
    for (let yi = -1; yi <= 1; yi++) {
      for (let xi = -1; xi <= 1; xi++) {
        const neighborX = cellX + xi
        const neighborY = cellY + yi
        
        // Generate random point in cell
        const random = this.seededRandom(neighborX * 374761393 + neighborY * 668265263 + this.seed)
        const pointX = neighborX + random()
        const pointY = neighborY + random()
        
        const dx = (x * frequency) - pointX
        const dy = (y * frequency) - pointY
        const dist = Math.sqrt(dx * dx + dy * dy)
        
        minDist = Math.min(minDist, dist)
      }
    }
    
    return minDist
  }

  /**
   * Hybrid noise combining multiple techniques
   */
  public hybridNoise(x: number, y: number, config: HybridConfig): number {
    // Base noise layer
    const base = this.fbm(x, y, {
      ...config.baseNoise,
      warpStrength: 0,
      warpFrequency: 0,
      turbulence: false
    } as FBMConfig)
    
    // Detail noise layer (computed but not used in current implementation)
    
    // Warp noise for domain distortion
    const warpX = this.fbm(x * 0.5, y * 0.5, {
      ...config.warpNoise,
      warpStrength: 0,
      warpFrequency: 0,
      turbulence: false
    } as FBMConfig) * config.warpWeight
    
    const warpY = this.fbm((x + 100) * 0.5, (y + 100) * 0.5, {
      ...config.warpNoise,
      warpStrength: 0,
      warpFrequency: 0,
      turbulence: false
    } as FBMConfig) * config.warpWeight
    
    // Apply domain distortion
    const warpedDetail = this.fbm(x + warpX, y + warpY, {
      ...config.detailNoise,
      warpStrength: 0,
      warpFrequency: 0,
      turbulence: false
    } as FBMConfig)
    
    return base + warpedDetail * config.detailWeight
  }

  /**
   * Generate noise based on type
   */
  public generateNoise(x: number, y: number, type: NoiseType, config: any): number {
    switch (type) {
      case NoiseType.PERLIN:
        return this.perlin(
          (x + config.offset.x) * config.frequency,
          (y + config.offset.y) * config.frequency
        )
      
      case NoiseType.FBM:
        return this.fbm(x, y, config as FBMConfig)
      
      case NoiseType.RIDGED:
        return this.ridgedNoise(x, y, config as RidgedNoiseConfig)
      
      case NoiseType.BILLOW:
        return this.billowNoise(x, y, config as NoiseConfig)
      
      case NoiseType.TURBULENCE:
        return this.fbm(x, y, { ...config, turbulence: true } as FBMConfig)
      
      case NoiseType.VORONOI:
        return this.voronoiNoise(x, y, config.frequency)
      
      case NoiseType.HYBRID:
        return this.hybridNoise(x, y, config as HybridConfig)
      
      default:
        return this.perlin(
          (x + config.offset.x) * config.frequency,
          (y + config.offset.y) * config.frequency
        )
    }
  }

  /**
   * Multi-scale noise composition
   */
  public multiScaleNoise(
    x: number, 
    y: number, 
    layers: Array<{ type: NoiseType; config: any; weight: number }>
  ): number {
    let total = 0
    let totalWeight = 0
    
    for (const layer of layers) {
      const noise = this.generateNoise(x, y, layer.type, layer.config)
      total += noise * layer.weight
      totalWeight += layer.weight
    }
    
    return totalWeight > 0 ? total / totalWeight : 0
  }

  public setSeed(seed: number): void {
    this.seed = seed
    this.initializePermutationTable()
    this.initializeGradients()
  }

  public getSeed(): number {
    return this.seed
  }
} 