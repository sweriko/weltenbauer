import { AdvancedNoiseSystem, NoiseType, NoiseConfig, RidgedNoiseConfig, FBMConfig } from './AdvancedNoiseSystem'

export enum BlendMode {
  ADD = 'add',
  MULTIPLY = 'multiply', 
  OVERLAY = 'overlay',
  SCREEN = 'screen',
  SUBTRACT = 'subtract',
  MASK_ELEVATION = 'mask_elevation', // New: Only apply to specific elevation ranges
  MASK_SLOPE = 'mask_slope',         // New: Only apply to specific slope ranges
  VORONOI_ISLANDS = 'voronoi_islands' // New: Voronoi-based island generation
}

export interface TerrainLayer {
  type: NoiseType
  config: any
  weight: number
  blendMode: BlendMode
  maskType?: NoiseType
  maskConfig?: any
  elevationRange?: { min: number; max: number } // For elevation-based masking
  slopeRange?: { min: number; max: number }     // For slope-based masking
}

export interface AdvancedTerrainConfig {
  size: number
  resolution: number
  seed: number
  
  // Redesigned advanced terrain controls
  geologicalComplexity?: number // 0.0-2.0: Controls multi-scale noise layering intensity
  domainWarping?: number // 0.0-1.0: Controls natural terrain flow and organic appearance  
  reliefAmplitude?: number // 0.2-4.0: Master height scaling with geological context
  featureScale?: number // 0.1-3.0: Controls size/frequency of geological features
  
  // Advanced blending controls
  useAdvancedBlending?: boolean // Enable advanced blending modes from demo
  
  // Legacy terrain controls (deprecated but kept for compatibility)
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
      
      // Redesigned advanced terrain controls
      geologicalComplexity: 1.0,
      domainWarping: 0.5,
      reliefAmplitude: 2.0,
      featureScale: 1.5,
      
              // Advanced blending controls
        useAdvancedBlending: true,
      
      // Legacy terrain controls (deprecated but kept for compatibility)
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
    
    // Get redesigned terrain control parameters with fallbacks to legacy values
    const geologicalComplexity = this.config.geologicalComplexity ?? (this.config.mountainIntensity || 0.8)
    const domainWarping = this.config.domainWarping ?? 0.5
    const reliefAmplitude = this.config.reliefAmplitude ?? (this.config.heightScale || 1.0)
    const featureScale = this.config.featureScale ?? 1.5
    
    // Generate base layers based on terrain type and scale them by geological complexity
    const layers = this.getTerrainTypeLayers(type, geologicalComplexity, featureScale)
    
    // Update geological feature configs based on new controls
    const adjustedConfig = { ...this.config }
    adjustedConfig.mountainRanges.ridgeStrength = geologicalComplexity * 0.8
    adjustedConfig.mountainRanges.peakHeight *= reliefAmplitude * 0.5
    adjustedConfig.valleys.depth *= (this.config.valleyDepth || 0.5) * reliefAmplitude * 0.3
    adjustedConfig.valleys.networkDensity = geologicalComplexity * 0.6
    adjustedConfig.plateaus.height *= reliefAmplitude * 0.4
    
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const index = y * resolution + x
        
        // Improved coordinate transformation with slight offset to avoid center artifacts
        const nx = (x / (resolution - 1)) * 2 - 1 + 0.001
        const ny = (y / (resolution - 1)) * 2 - 1 + 0.001
        
        // Advanced domain warping controlled by domainWarping parameter
        const warpStrength = domainWarping * 0.6 // 0.0 to 0.36
        const warpScale = 0.3 + featureScale * 0.4 // Scale warp frequency with feature scale
        
        const warpX = this.noiseSystem.perlin(nx * warpScale + 100, ny * warpScale + 200) * warpStrength
        const warpY = this.noiseSystem.perlin(nx * warpScale + 300, ny * warpScale + 400) * warpStrength
        
        // Apply secondary warping for ultra-natural terrain when domain warping is high
        let warpedX = nx + warpX
        let warpedY = ny + warpY
        
        if (domainWarping > 0.7) {
          const secondaryWarp = (domainWarping - 0.7) * 0.3
          const secondaryScale = warpScale * 2
          warpedX += this.noiseSystem.perlin(warpedX * secondaryScale + 500, warpedY * secondaryScale + 600) * secondaryWarp
          warpedY += this.noiseSystem.perlin(warpedX * secondaryScale + 700, warpedY * secondaryScale + 800) * secondaryWarp
        }
        
        let height: number
        
        // Use advanced blending if enabled, otherwise use original method
        if (this.config.useAdvancedBlending) {
          height = this.generateAdvancedTerrain(warpedX, warpedY, type, layers, geologicalComplexity, featureScale)
        } else {
          // Original terrain generation using multi-scale composition
          height = this.noiseSystem.multiScaleNoise(warpedX, warpedY, layers)
        }
        
        // Apply geological features with new parameter control
        if (adjustedConfig.mountainRanges.enabled) {
          height += this.generateMountainRanges(warpedX, warpedY, featureScale) * geologicalComplexity
        }
        
        if (adjustedConfig.valleys.enabled) {
          height = this.carveValleys(warpedX, warpedY, height, geologicalComplexity * 0.7, featureScale)
        }
        
        if (adjustedConfig.plateaus.enabled) {
          height = this.addPlateaus(warpedX, warpedY, height, featureScale)
        }
        
        if (adjustedConfig.coastalFeatures.enabled) {
          height = this.addCoastalFeatures(warpedX, warpedY, height, featureScale)
        }
        
        // Apply custom layers with intelligent scaling
        for (const layer of adjustedConfig.layers) {
          height = this.applyLayer(warpedX, warpedY, height, layer)
        }
        
        // Intelligent micro-detail that scales with geological complexity and feature scale
        const microDetailFreq = 6 + featureScale * 4 // 6.4 to 18 frequency range
        const microDetailAmp = (1 + geologicalComplexity) * featureScale * 0.8 // Smarter amplitude scaling
        const microDetail = this.noiseSystem.perlin(warpedX * microDetailFreq, warpedY * microDetailFreq) * microDetailAmp
        height += microDetail
        
        // Apply master relief amplitude scaling
        height *= reliefAmplitude
        
        heightData[index] = height
      }
    }

    return this.postProcess(heightData)
  }

  public getTerrainTypeLayers(type: TerrainType, geologicalComplexity: number, featureScale: number): Array<{ type: NoiseType; config: any; weight: number }> {
    const baseConfig: NoiseConfig = {
      octaves: Math.round(6 + geologicalComplexity * 2), // 6-10 octaves based on complexity
      frequency: 0.8 / featureScale, // Inverse relationship with feature scale
      amplitude: 1.0,
      persistence: 0.4 + geologicalComplexity * 0.2, // More persistent detail at higher complexity
      lacunarity: 2.0,
      seed: this.config.seed,
      offset: { x: 0, y: 0 }
    }

    const fbmConfig: FBMConfig = {
      ...baseConfig,
      warpStrength: 0.2 + geologicalComplexity * 0.2, // More warping with complexity
      warpFrequency: 0.5 / featureScale,
      turbulence: false
    }

    const ridgedConfig: RidgedNoiseConfig = {
      ...baseConfig,
      ridgeOffset: 1.0,
      gain: 1.5 + geologicalComplexity * 0.8, // More dramatic ridges with complexity
      threshold: 0.0
    }

    // Scale amplitudes based on relief amplitude control
    const amplitudeScale = 1.0 + geologicalComplexity * 0.5

    switch (type) {
      case TerrainType.CONTINENTAL:
        return [
          // Base continental shape with rolling hills
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.2 / featureScale, amplitude: 120 * amplitudeScale, octaves: Math.round(8 + geologicalComplexity) }, weight: 0.6 },
          // Mountain ridges scaled by complexity
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.4 / featureScale, amplitude: 80 * amplitudeScale, gain: 1.5 + geologicalComplexity }, weight: 0.25 },
          // Fine detail that increases with complexity
          { type: NoiseType.BILLOW, config: { ...baseConfig, frequency: 2.0 / featureScale, amplitude: 15 * (1 + geologicalComplexity * 0.3), octaves: Math.round(4 + geologicalComplexity) }, weight: 0.15 }
        ]

      case TerrainType.ISLAND_CHAIN:
        return [
          // Volcanic island cores
          { type: NoiseType.VORONOI, config: { frequency: 0.15 / featureScale }, weight: 0.4 },
          // Island terrain detail enhanced by complexity
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.8 / featureScale, amplitude: 60 * amplitudeScale, warpStrength: 0.3 + geologicalComplexity * 0.3 }, weight: 0.4 },
          // Coastal variation
          { type: NoiseType.TURBULENCE, config: { ...fbmConfig, frequency: 1.5 / featureScale, amplitude: 20 * (1 + geologicalComplexity * 0.2), turbulence: true }, weight: 0.2 }
        ]

      case TerrainType.MOUNTAIN_RANGE:
        return [
          // Primary mountain ridges enhanced by complexity
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.3 / featureScale, amplitude: 300 * amplitudeScale, gain: 2.0 + geologicalComplexity * 2.0, octaves: Math.round(8 + geologicalComplexity) }, weight: 0.7 },
          // Secondary ridges and peaks
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.8 / featureScale, amplitude: 150 * amplitudeScale, gain: 1.5 + geologicalComplexity }, weight: 0.2 },
          // Valley floor detail
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 1.5 / featureScale, amplitude: 30 * (1 + geologicalComplexity * 0.2) }, weight: 0.1 }
        ]

      case TerrainType.VALLEY_SYSTEM:
        return [
          // Gentle rolling base with enhanced warping
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.3 / featureScale, amplitude: 80 * amplitudeScale, warpStrength: 0.3 + geologicalComplexity * 0.2 }, weight: 0.7 },
          // Valley cutting patterns
          { type: NoiseType.BILLOW, config: { ...baseConfig, frequency: 0.6 / featureScale, amplitude: 40 * amplitudeScale, octaves: Math.round(6 + geologicalComplexity) }, weight: 0.3 }
        ]

      case TerrainType.PLATEAU:
        return [
          // Plateau base with sharp edges
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.15 / featureScale, amplitude: 200 * amplitudeScale, octaves: Math.round(4 + geologicalComplexity * 0.5) }, weight: 0.8 },
          // Mesa formations enhanced by complexity
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.5 / featureScale, amplitude: 50 * amplitudeScale, ridgeOffset: 0.8, gain: 1.5 + geologicalComplexity * 0.5 }, weight: 0.2 }
        ]

      case TerrainType.VOLCANIC:
        return [
          // Volcanic peaks and ridges with dramatic complexity scaling
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.4 / featureScale, amplitude: 250 * amplitudeScale, gain: 3.0 + geologicalComplexity * 2.0, octaves: Math.round(6 + geologicalComplexity) }, weight: 0.6 },
          // Lava flow patterns
          { type: NoiseType.VORONOI, config: { frequency: 0.3 / featureScale }, weight: 0.2 },
          // Ash and rough terrain enhanced by complexity
          { type: NoiseType.TURBULENCE, config: { ...fbmConfig, frequency: 2.0 / featureScale, amplitude: 40 * (1 + geologicalComplexity * 0.3), turbulence: true }, weight: 0.2 }
        ]

      case TerrainType.DESERT:
        return [
          // Sand dune base with enhanced warping
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.4 / featureScale, amplitude: 60 * amplitudeScale, warpStrength: 0.4 + geologicalComplexity * 0.3, octaves: Math.round(6 + geologicalComplexity) }, weight: 0.6 },
          // Rocky outcrops
          { type: NoiseType.BILLOW, config: { ...baseConfig, frequency: 0.8 / featureScale, amplitude: 30 * amplitudeScale, octaves: Math.round(4 + geologicalComplexity * 0.5) }, weight: 0.25 },
          // Fine sand detail
          { type: NoiseType.TURBULENCE, config: { ...fbmConfig, frequency: 3.0 / featureScale, amplitude: 8 * (1 + geologicalComplexity * 0.2), turbulence: true }, weight: 0.15 }
        ]

      case TerrainType.GLACIER:
        return [
          // Glacial valleys (U-shaped) with complexity enhancement
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 0.2 / featureScale, amplitude: 150 * amplitudeScale, octaves: Math.round(6 + geologicalComplexity) }, weight: 0.7 },
          // Moraines and ridges
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.6 / featureScale, amplitude: 60 * amplitudeScale, gain: 1.2 + geologicalComplexity * 0.6 }, weight: 0.3 }
        ]

      case TerrainType.CANYON:
        return [
          // Deep canyon cutting enhanced by complexity
          { type: NoiseType.RIDGED, config: { ...ridgedConfig, frequency: 0.3 / featureScale, amplitude: 200 * amplitudeScale, ridgeOffset: 0.3, gain: 2.0 + geologicalComplexity * 1.0 }, weight: 0.8 },
          // Canyon floor variation
          { type: NoiseType.FBM, config: { ...fbmConfig, frequency: 1.0 / featureScale, amplitude: 25 * (1 + geologicalComplexity * 0.2) }, weight: 0.2 }
        ]

      default:
        return [
          { type: NoiseType.FBM, config: { ...fbmConfig, amplitude: 100 * amplitudeScale, octaves: Math.round(8 + geologicalComplexity) }, weight: 1.0 }
        ]
    }
  }

  /**
   * Advanced terrain generation using techniques from AdvancedNoiseDemo
   * Includes elevation-based masking, overlay blending, and specialized terrain generation
   */
  private generateAdvancedTerrain(
    x: number, 
    y: number, 
    type: TerrainType, 
    layers: Array<{ type: NoiseType; config: any; weight: number }>,
    geologicalComplexity: number,
    featureScale: number
  ): number {
    // Special handling for island chains using Voronoi technique from demo
    if (type === TerrainType.ISLAND_CHAIN) {
      return this.generateVoronoiIslands(x, y, featureScale, geologicalComplexity)
    }
    
    // Generate separate layers for advanced blending (inspired by demo's generateMultiLayerTerrain)
    let baseHeight = 0
    let ridgeHeight = 0
    let detailHeight = 0
    
    // Base layer (primary terrain shape)
    if (layers.length > 0) {
      const baseLayer = layers[0]
      baseHeight = this.noiseSystem.generateNoise(x, y, baseLayer.type, baseLayer.config) * baseLayer.weight
    }
    
    // Ridge layer (mountain ridges and dramatic features)
    if (layers.length > 1) {
      const ridgeLayer = layers[1]
      ridgeHeight = this.noiseSystem.generateNoise(x, y, ridgeLayer.type, ridgeLayer.config) * ridgeLayer.weight
    }
    
    // Detail layer (fine surface details)
    if (layers.length > 2) {
      const detailLayer = layers[2]
      detailHeight = this.noiseSystem.generateNoise(x, y, detailLayer.type, detailLayer.config) * detailLayer.weight
    }
    
    // Start with base terrain
    let height = baseHeight
    
    // Add ridges with elevation-based masking (only add ridges to higher areas)
    // This technique from demo prevents ridges in low valleys
    const elevationMask = Math.max(0, Math.min(1, (baseHeight + 100) / 200)) // Normalize base height for masking
    height += ridgeHeight * elevationMask * 0.6
    
    // Apply overlay blending for detail layer (technique from demo)
    const normalizedHeight = Math.max(0, Math.min(1, (height + 200) / 400))
    const detailBlend = detailHeight / 20
    
    if (normalizedHeight < 0.5) {
      // Screen blend for lower elevations
      height += 2 * normalizedHeight * detailBlend
    } else {
      // Overlay blend for higher elevations  
      height += (1 - 2 * (1 - normalizedHeight) * (1 - detailBlend)) * 20
    }
    
    // Apply remaining layers with standard multi-scale approach
    if (layers.length > 3) {
      const remainingLayers = layers.slice(3)
      height += this.noiseSystem.multiScaleNoise(x, y, remainingLayers)
    }
    
    return height
  }

  /**
   * Generate Voronoi-based island chains (technique from demo)
   */
  private generateVoronoiIslands(x: number, y: number, featureScale: number, geologicalComplexity: number): number {
    // Voronoi for island placement (from demo's generateIslandChain)
    const voronoi = this.noiseSystem.voronoiNoise(x, y, 0.4 / featureScale)
    const islandMask = Math.max(0, 0.6 - voronoi) / 0.6
    
    // Ridged noise for volcanic peaks
    const volcanic = this.noiseSystem.ridgedNoise(x, y, {
      octaves: Math.round(6 + geologicalComplexity),
      frequency: 1.0 / featureScale,
      amplitude: 200,
      persistence: 0.6,
      lacunarity: 2.3,
      seed: this.config.seed + 500,
      offset: { x: 0, y: 0 },
      ridgeOffset: 0.8,
      gain: 4.0 + geologicalComplexity * 2.0,
      threshold: 0.0
    })
    
    // Turbulence for coastal variation
    const coastal = this.noiseSystem.fbm(x, y, {
      octaves: Math.round(4 + geologicalComplexity * 0.5),
      frequency: 1.5 / featureScale,
      amplitude: 30,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: this.config.seed + 600,
      offset: { x: 200, y: 300 },
      warpStrength: 0.4 + geologicalComplexity * 0.2,
      warpFrequency: 0.6,
      turbulence: true
    })
    
    // Replace circular ocean depth with noise-based sea level variation
    const seaLevel = this.noiseSystem.fbm(x * 0.3, y * 0.3, {
      octaves: 3,
      frequency: 0.2 / featureScale,
      amplitude: 80,
      persistence: 0.4,
      lacunarity: 2.0,
      seed: this.config.seed + 700,
      offset: { x: 1000, y: 1000 },
      warpStrength: 0.1,
      warpFrequency: 0.1,
      turbulence: false
    })
    
    // Add subtle noise-based depth variation instead of circular falloff
    const depthVariation = this.noiseSystem.perlin(x * 0.1, y * 0.1) * 40
    
    // Combine layers using demo technique without circular artifacts
    let height = volcanic * islandMask + coastal * 0.3 + seaLevel + depthVariation
    
    return height
  }

  private generateMountainRanges(x: number, y: number, featureScale: number): number {
    const { mountainRanges } = this.config
    let mountainHeight = 0
    
    for (let i = 0; i < mountainRanges.count; i++) {
      const ridgeConfig: RidgedNoiseConfig = {
        octaves: 5,
        frequency: (0.5 + i * 0.2) / featureScale, // Scale frequency by featureScale
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

  private carveValleys(x: number, y: number, height: number, valleyIntensity: number, featureScale: number): number {
    const { valleys } = this.config
    
    const valleyMask = this.noiseSystem.generateNoise(x * (0.3 / featureScale), y * (0.3 / featureScale), NoiseType.FBM, {
      octaves: 4,
      frequency: 1.0 / featureScale, // Scale valley network frequency
      amplitude: 1.0,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: this.config.seed + 100,
      offset: { x: 0, y: 0 },
      warpStrength: 0.2 * valleyIntensity, // More warping with higher intensity
      warpFrequency: 0.5 / featureScale,
      turbulence: false
    } as FBMConfig)
    
    const valleyDepth = Math.max(0, -valleyMask) * valleys.depth * valleyIntensity
    return height - valleyDepth
  }

  private addPlateaus(x: number, y: number, height: number, featureScale: number): number {
    const { plateaus } = this.config
    
    const plateauMask = this.noiseSystem.voronoiNoise(x, y, 0.4 / featureScale) // Scale plateau frequency
    const smoothedPlateau = Math.pow(Math.max(0, 0.5 - plateauMask), plateaus.edgeSharpness)
    
    return height + smoothedPlateau * plateaus.height
  }

  private addCoastalFeatures(_x: number, _y: number, height: number, _featureScale: number): number {
    // Use only height-based coastal effects to avoid circular artifacts
    // No distance calculations from center point
    if (height > -10 && height < 10) {
      // Beach/shoreline area - make it flatter and add coastal detail
      const coastalVariation = this.noiseSystem.perlin(_x * 3.0, _y * 3.0) * 2.0
      height = height * 0.4 + coastalVariation
    }
    
    // Add subtle coastal erosion patterns for areas near sea level
    if (height > -20 && height < 20) {
      const erosionPattern = this.noiseSystem.fbm(_x, _y, {
        octaves: 3,
        frequency: 2.0,
        amplitude: 3.0,
        persistence: 0.5,
        lacunarity: 2.0,
        seed: this.config.seed + 900,
        offset: { x: 4000, y: 4000 },
        warpStrength: 0.1,
        warpFrequency: 1.0,
        turbulence: false
      } as FBMConfig)
      height += erosionPattern * 0.3
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
      case BlendMode.ADD:
        return height + layerValue * layer.weight
      case BlendMode.MULTIPLY:
        return height * (1 + layerValue * layer.weight)
      case BlendMode.OVERLAY:
        // Enhanced overlay blending inspired by demo techniques
        const normalizedHeight = Math.max(0, Math.min(1, (height + 200) / 400))
        const detail = (layerValue * layer.weight) / 20
        
        if (normalizedHeight < 0.5) {
          return height + 2 * normalizedHeight * detail
        } else {
          return height + (1 - 2 * (1 - normalizedHeight) * (1 - detail)) * 20
        }
      case BlendMode.SCREEN:
        return 1 - (1 - height) * (1 - layerValue * layer.weight)
      case BlendMode.SUBTRACT:
        return height - layerValue * layer.weight
      case BlendMode.MASK_ELEVATION:
        if (layer.elevationRange) {
          if (height >= layer.elevationRange.min && height <= layer.elevationRange.max) {
            return height + layerValue * layer.weight
          }
        }
        return height
      case BlendMode.MASK_SLOPE:
        // This blend mode requires slope data, which is not directly available here.
        // For now, we'll just apply the layer value as is, or handle slope masking separately.
        // If slope data were available, you'd calculate slope here and check against layer.slopeRange
        return height + layerValue * layer.weight
      case BlendMode.VORONOI_ISLANDS:
        // Generate Voronoi-based island masking
        const voronoi = this.noiseSystem.voronoiNoise(x, y, 0.4)
        const islandMask = Math.max(0, 0.6 - voronoi) / 0.6
        
        // Replace circular ocean depth with noise-based sea level
        const seaLevelNoise = this.noiseSystem.fbm(x * 0.15, y * 0.15, {
          octaves: 4,
          frequency: 0.3,
          amplitude: 120,
          persistence: 0.5,
          lacunarity: 2.0,
          seed: this.config.seed + 800,
          offset: { x: 500, y: 500 },
          warpStrength: 0.2,
          warpFrequency: 0.1,
          turbulence: false
        } as FBMConfig)
        
        // Add organic depth variation
        const depthNoise = this.noiseSystem.perlin(x * 0.05 + 2000, y * 0.05 + 3000) * 60
        
        return height * islandMask + layerValue * layer.weight * islandMask + seaLevelNoise + depthNoise
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

  public getNoiseSystem(): AdvancedNoiseSystem {
    return this.noiseSystem
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