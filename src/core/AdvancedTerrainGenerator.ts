import { AdvancedNoiseSystem, NoiseType, NoiseConfig, RidgedNoiseConfig, FBMConfig, HybridConfig } from './AdvancedNoiseSystem'

export interface TerrainLayer {
  type: NoiseType
  config: any
  weight: number
  maskType?: NoiseType
  maskConfig?: any
  blendMode: 'add' | 'multiply' | 'overlay' | 'screen' | 'subtract'
}

export interface AdvancedTerrainConfig {
  size: number
  resolution: number
  seed: number
  
  // New terrain controls
  heightScale?: number
  mountainIntensity?: number
  valleyDepth?: number
  
  // Basic noise parameters for compatibility (deprecated)
  noiseScale?: number
  amplitude?: number
  octaves?: number
  
  // Geological features
  continentalShelf: {
    enabled: boolean
    depth: number
    falloff: number
  }
  
  mountainRanges: {
    enabled: boolean
    count: number
    ridgeStrength: number
    peakHeight: number
  }
  
  valleys: {
    enabled: boolean
    depth: number
    width: number
    networkDensity: number
  }
  
  plateaus: {
    enabled: boolean
    height: number
    edgeSharpness: number
  }
  
  coastalFeatures: {
    enabled: boolean
    beachWidth: number
    cliffHeight: number
  }
  
  // Climate zones
  climate: {
    aridZones: boolean
    temperateZones: boolean
    alpineZones: boolean
  }
  
  // Detail layers
  layers: TerrainLayer[]
}

export enum TerrainType {
  CONTINENTAL = 'continental',
  ISLAND_CHAIN = 'island_chain', 
  MOUNTAIN_RANGE = 'mountain_range',
  VALLEY_SYSTEM = 'valley_system',
  PLATEAU = 'plateau',
  COASTAL = 'coastal',
  DESERT = 'desert',
  VOLCANIC = 'volcanic',
  GLACIER = 'glacier',
  CANYON = 'canyon'
}

export class AdvancedTerrainGenerator {
  private noiseSystem: AdvancedNoiseSystem
  private config: AdvancedTerrainConfig

  constructor(config?: Partial<AdvancedTerrainConfig>) {
    this.config = this.getDefaultConfig()
    this.noiseSystem = new AdvancedNoiseSystem(this.config.seed)
    
    if (config) {
      this.updateConfig(config)
    }
  }

  private getDefaultConfig(): AdvancedTerrainConfig {
    return {
      size: 5,
      resolution: 512,
      seed: Date.now(),
      
      // New terrain controls
      heightScale: 1.0,
      mountainIntensity: 0.8,
      valleyDepth: 0.5,
      
      // Basic noise compatibility settings (deprecated)
      noiseScale: 0.02,
      amplitude: 50,
      octaves: 4,
      
      continentalShelf: {
        enabled: false,
        depth: -200,
        falloff: 0.3
      },
      
      mountainRanges: {
        enabled: true,
        count: 3,
        ridgeStrength: 0.8,
        peakHeight: 300
      },
      
      valleys: {
        enabled: true,
        depth: 50,
        width: 0.1,
        networkDensity: 0.5
      },
      
      plateaus: {
        enabled: true,
        height: 100,
        edgeSharpness: 2.0
      },
      
      coastalFeatures: {
        enabled: true,
        beachWidth: 0.05,
        cliffHeight: 20
      },
      
      climate: {
        aridZones: true,
        temperateZones: true,
        alpineZones: true
      },
      
      layers: []
    }
  }

  public generateTerrain(type: TerrainType = TerrainType.CONTINENTAL): Float32Array {
    const { resolution } = this.config
    const heightData = new Float32Array(resolution * resolution)
    
    // Get new terrain control parameters
    const heightScale = this.config.heightScale || 1.0
    const mountainIntensity = this.config.mountainIntensity || 0.8
    const valleyDepth = this.config.valleyDepth || 0.5
    
    // Generate base layers based on terrain type
    const layers = this.getTerrainTypeLayers(type)
    
    // Update mountain and valley configs based on user controls
    const adjustedConfig = { ...this.config }
    adjustedConfig.mountainRanges.ridgeStrength = mountainIntensity
    adjustedConfig.valleys.depth *= valleyDepth
    adjustedConfig.valleys.networkDensity = valleyDepth
    
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const index = y * resolution + x
        
        // Improved coordinate transformation - no center artifacts
        const nx = (x / (resolution - 1)) * 2 - 1
        const ny = (y / (resolution - 1)) * 2 - 1
        
        // Domain warping for AAA quality natural terrain
        const warpStrength = 0.3
        const warpScale = 0.5
        
        const warpX = this.noiseSystem.perlin(nx * warpScale + 100, ny * warpScale + 200) * warpStrength
        const warpY = this.noiseSystem.perlin(nx * warpScale + 300, ny * warpScale + 400) * warpStrength
        
        const warpedX = nx + warpX
        const warpedY = ny + warpY
        
        // Generate base terrain using multi-scale composition with warped coordinates
        let height = this.noiseSystem.multiScaleNoise(warpedX, warpedY, layers)
        
        // Apply geological features with warped coordinates for natural look
        if (adjustedConfig.mountainRanges.enabled) {
          height += this.generateMountainRanges(warpedX, warpedY) * mountainIntensity
        }
        
        if (adjustedConfig.valleys.enabled) {
          height = this.carveValleys(warpedX, warpedY, height, valleyDepth)
        }
        
        if (adjustedConfig.plateaus.enabled) {
          height = this.addPlateaus(warpedX, warpedY, height)
        }
        
        if (adjustedConfig.coastalFeatures.enabled) {
          height = this.addCoastalFeatures(warpedX, warpedY, height)
        }
        
        // Apply custom layers with warped coordinates
        for (const layer of adjustedConfig.layers) {
          height = this.applyLayer(warpedX, warpedY, height, layer)
        }
        
        // Add micro-detail for AAA quality
        const microDetail = this.noiseSystem.perlin(warpedX * 8, warpedY * 8) * 2
        height += microDetail
        
        // Apply height scaling
        height *= heightScale
        
        heightData[index] = height
      }
    }

    return this.postProcess(heightData)
  }

  private getTerrainTypeLayers(type: TerrainType): Array<{ type: NoiseType; config: any; weight: number }> {
    const baseConfig: NoiseConfig = {
      octaves: 6,
      frequency: 0.8,
      amplitude: 1.0,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: this.config.seed,
      offset: { x: 0, y: 0 }
    }

    const fbmConfig: FBMConfig = {
      ...baseConfig,
      warpStrength: 0.3,
      warpFrequency: 0.5,
      turbulence: false
    }

    const ridgedConfig: RidgedNoiseConfig = {
      ...baseConfig,
      ridgeOffset: 1.0,
      gain: 2.0,
      threshold: 0.0
    }

    switch (type) {
      case TerrainType.CONTINENTAL:
        return [
          // Base continental shape with rolling hills
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.2, amplitude: 120, octaves: 8 }, weight: 0.6 },
          // Mountain ridges
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.4, amplitude: 80, gain: 1.5 }, weight: 0.25 },
          // Fine detail
          { type: NoiseType.BILLOW, config: { ...baseConfig, frequency: 2.0, amplitude: 15, octaves: 4 }, weight: 0.15 }
        ]

      case TerrainType.ISLAND_CHAIN:
        return [
          // Volcanic island cores
          { type: NoiseType.VORONOI, config: { frequency: 0.15 }, weight: 0.4 },
          // Island terrain detail
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.8, amplitude: 60, warpStrength: 0.5 }, weight: 0.4 },
          // Coastal variation
          { type: NoiseType.TURBULENCE, config: { ...fbmConfig, frequency: 1.5, amplitude: 20, turbulence: true }, weight: 0.2 }
        ]

      case TerrainType.MOUNTAIN_RANGE:
        return [
          // Primary mountain ridges
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.3, amplitude: 300, gain: 3.0, octaves: 8 }, weight: 0.7 },
          // Secondary ridges and peaks
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.8, amplitude: 150, gain: 2.0 }, weight: 0.2 },
          // Valley floor detail
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 1.5, amplitude: 30 }, weight: 0.1 }
        ]

      case TerrainType.VALLEY_SYSTEM:
        return [
          // Gentle rolling base
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.3, amplitude: 80, warpStrength: 0.4 }, weight: 0.7 },
          // Valley cutting patterns
          { type: NoiseType.BILLOW, config: { ...baseConfig, frequency: 0.6, amplitude: 40, octaves: 6 }, weight: 0.3 }
        ]

      case TerrainType.PLATEAU:
        return [
          // Plateau base with sharp edges
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.15, amplitude: 200, octaves: 4 }, weight: 0.8 },
          // Mesa formations
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.5, amplitude: 50, ridgeOffset: 0.8 }, weight: 0.2 }
        ]

      case TerrainType.VOLCANIC:
        return [
          // Volcanic peaks and ridges
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.4, amplitude: 250, gain: 4.0, octaves: 6 }, weight: 0.6 },
          // Lava flow patterns
          { type: NoiseType.VORONOI, config: { frequency: 0.3 }, weight: 0.2 },
          // Ash and rough terrain
          { type: NoiseType.TURBULENCE, config: { ...fbmConfig, frequency: 2.0, amplitude: 40, turbulence: true }, weight: 0.2 }
        ]

      case TerrainType.DESERT:
        return [
          // Sand dune base
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.4, amplitude: 60, warpStrength: 0.6, octaves: 6 }, weight: 0.6 },
          // Rocky outcrops
          { type: NoiseType.BILLOW, config: { ...baseConfig, frequency: 0.8, amplitude: 30, octaves: 4 }, weight: 0.25 },
          // Fine sand detail
          { type: NoiseType.TURBULENCE, config: { ...fbmConfig, frequency: 3.0, amplitude: 8, turbulence: true }, weight: 0.15 }
        ]

      case TerrainType.GLACIER:
        return [
          // Glacial valleys (U-shaped)
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.2, amplitude: 150, octaves: 6 }, weight: 0.7 },
          // Moraines and ridges
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.6, amplitude: 60, gain: 1.5 }, weight: 0.3 }
        ]

      case TerrainType.CANYON:
        return [
          // Deep canyon cutting
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.3, amplitude: 200, ridgeOffset: 0.3, gain: 2.5 }, weight: 0.8 },
          // Canyon floor variation
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 1.0, amplitude: 25 }, weight: 0.2 }
        ]

      default:
        return [
          { type: NoiseType.FBM, config: { ...fbmConfig, amplitude: 100, octaves: 8 }, weight: 1.0 }
        ]
    }
  }

  private applyContinentalShelf(x: number, y: number, height: number): number {
    // Completely removed to eliminate ring artifacts
    return height
  }

  private generateMountainRanges(x: number, y: number): number {
    const { mountainRanges } = this.config
    let mountainHeight = 0
    
    for (let i = 0; i < mountainRanges.count; i++) {
      const ridgeConfig: RidgedNoiseConfig = {
        octaves: 5,
        frequency: 0.5 + i * 0.2,
        amplitude: mountainRanges.peakHeight,
        persistence: 0.6,
        lacunarity: 2.1,
        seed: this.config.seed + i,
        offset: { x: i * 50, y: i * 73 },
        ridgeOffset: 1.0,
        gain: 2.5,
        threshold: 0.0
      }
      
      const ridge = this.noiseSystem.ridgedNoise(x, y, ridgeConfig)
      mountainHeight += ridge * mountainRanges.ridgeStrength * (1.0 / (i + 1))
    }
    
    return mountainHeight
  }

  private carveValleys(x: number, y: number, height: number, valleyIntensity: number): number {
    const { valleys } = this.config
    
    const valleyMask = this.noiseSystem.generateNoise(x * 0.3, y * 0.3, NoiseType.FBM, {
      octaves: 4,
      frequency: 1.0,
      amplitude: 1.0,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: this.config.seed + 100,
      offset: { x: 0, y: 0 },
      warpStrength: 0.2,
      warpFrequency: 0.5,
      turbulence: false
    } as FBMConfig)
    
    const valleyDepth = Math.max(0, -valleyMask) * valleys.depth * valleyIntensity
    return height - valleyDepth
  }

  private addPlateaus(x: number, y: number, height: number): number {
    const { plateaus } = this.config
    
    const plateauMask = this.noiseSystem.voronoiNoise(x, y, 0.4)
    const smoothedPlateau = Math.pow(Math.max(0, 0.5 - plateauMask), plateaus.edgeSharpness)
    
    return height + smoothedPlateau * plateaus.height
  }

  private addCoastalFeatures(x: number, y: number, height: number): number {
    // Removed distance-based coastal features to eliminate rings
    // Instead use height-based coastal effects
    if (height > -5 && height < 5) {
      // Beach/shoreline area - make it flatter
      height = height * 0.3
    }
    
    return height
  }

  private applyLayer(x: number, y: number, height: number, layer: TerrainLayer): number {
    let layerValue = this.noiseSystem.generateNoise(x, y, layer.type, layer.config)
    
    // Apply mask if specified
    if (layer.maskType && layer.maskConfig) {
      const mask = this.noiseSystem.generateNoise(x, y, layer.maskType, layer.maskConfig)
      layerValue *= Math.max(0, mask)
    }
    
    // Apply blend mode
    switch (layer.blendMode) {
      case 'add':
        return height + layerValue * layer.weight
      case 'multiply':
        return height * (1 + layerValue * layer.weight)
      case 'overlay':
        return height < 0.5 
          ? 2 * height * (layerValue * layer.weight)
          : 1 - 2 * (1 - height) * (1 - layerValue * layer.weight)
      case 'screen':
        return 1 - (1 - height) * (1 - layerValue * layer.weight)
      case 'subtract':
        return height - layerValue * layer.weight
      default:
        return height + layerValue * layer.weight
    }
  }

  private postProcess(heightData: Float32Array): Float32Array {
    // Smooth extreme values
    const processed = new Float32Array(heightData.length)
    const resolution = this.config.resolution
    
    for (let i = 0; i < heightData.length; i++) {
      const y = Math.floor(i / resolution)
      const x = i % resolution
      
      // Simple 3x3 smoothing for extreme outliers
      let sum = heightData[i]
      let count = 1
      
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          
          if (nx >= 0 && nx < resolution && ny >= 0 && ny < resolution && (dx !== 0 || dy !== 0)) {
            const neighborIndex = ny * resolution + nx
            sum += heightData[neighborIndex]
            count++
          }
        }
      }
      
      const average = sum / count
      const current = heightData[i]
      
      // Only smooth if the value is drastically different from neighbors
      if (Math.abs(current - average) > 50) {
        processed[i] = current * 0.7 + average * 0.3
      } else {
        processed[i] = current
      }
    }
    
    return processed
  }

  public updateConfig(newConfig: Partial<AdvancedTerrainConfig>): void {
    this.config = { ...this.config, ...newConfig }
    if (newConfig.seed !== undefined) {
      this.noiseSystem.setSeed(newConfig.seed)
    }
  }

  public getConfig(): AdvancedTerrainConfig {
    return { ...this.config }
  }

  public addLayer(layer: TerrainLayer): void {
    this.config.layers.push(layer)
  }

  public removeLayer(index: number): void {
    this.config.layers.splice(index, 1)
  }

  public setSeed(seed: number): void {
    this.config.seed = seed
    this.noiseSystem.setSeed(seed)
  }

  public getSeed(): number {
    return this.config.seed
  }

  public exportHeightmapAsImage(heightData: Float32Array): string {
    const { resolution } = this.config
    const canvas = document.createElement('canvas')
    canvas.width = resolution
    canvas.height = resolution
    const ctx = canvas.getContext('2d')!
    
    const imageData = ctx.createImageData(resolution, resolution)
    const data = imageData.data

    // Find min/max for normalization
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < heightData.length; i++) {
      min = Math.min(min, heightData[i])
      max = Math.max(max, heightData[i])
    }

    const range = max - min

    // Convert height data to grayscale image
    for (let i = 0; i < heightData.length; i++) {
      const normalized = range > 0 ? (heightData[i] - min) / range : 0
      const value = Math.floor(normalized * 255)
      
      const pixelIndex = i * 4
      data[pixelIndex] = value     // Red
      data[pixelIndex + 1] = value // Green  
      data[pixelIndex + 2] = value // Blue
      data[pixelIndex + 3] = 255   // Alpha
    }

    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  }
} 