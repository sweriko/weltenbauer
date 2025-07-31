import { AdvancedNoiseSystem } from './AdvancedNoiseSystem'
import { AdvancedTerrainGenerator, TerrainType, AdvancedTerrainConfig } from './AdvancedTerrainGenerator'

export interface TerrainWorkerMessage {
  type: 'processChunk'
  data: {
    chunkId: string
    startX: number
    startY: number
    endX: number
    endY: number
    resolution: number
    terrainType: TerrainType
    config: AdvancedTerrainConfig
    baseLayerWeightOverrides?: Map<string, number>
    customLayers?: any[]
  }
}

export interface TerrainWorkerResponse {
  type: 'chunkComplete' | 'error'
  data: {
    chunkId: string
    heightData?: Float32Array
    startX?: number
    startY?: number
    endX?: number
    endY?: number
    error?: string
  }
}

class TerrainWorkerInstance {
  private terrainGenerator: AdvancedTerrainGenerator
  private noiseSystem: AdvancedNoiseSystem

  constructor() {
    // Initialize with default config - will be updated per chunk
    this.terrainGenerator = new AdvancedTerrainGenerator()
    this.noiseSystem = this.terrainGenerator.getNoiseSystem()
  }

  public processChunk(message: TerrainWorkerMessage): TerrainWorkerResponse {
    const { chunkId, startX, startY, endX, endY, resolution, terrainType, config } = message.data
    
    // Update terrain generator config
    this.terrainGenerator.updateConfig(config)
    this.noiseSystem = this.terrainGenerator.getNoiseSystem()

    // Create height data for this chunk
    const chunkWidth = endX - startX
    const chunkHeight = endY - startY
    const heightData = new Float32Array(chunkWidth * chunkHeight)

    // Get terrain generation parameters
    const geologicalComplexity = config.geologicalComplexity ?? 0.8
    const domainWarping = config.domainWarping ?? 0.5
    const reliefAmplitude = config.reliefAmplitude ?? 1.0
    const featureScale = config.featureScale ?? 1.5

    // Generate base layers based on terrain type
    const layers = this.terrainGenerator.getTerrainTypeLayers(terrainType, geologicalComplexity, featureScale)

    // Process each point in the chunk
    for (let localY = 0; localY < chunkHeight; localY++) {
      for (let localX = 0; localX < chunkWidth; localX++) {
        const globalX = startX + localX
        const globalY = startY + localY
        const localIndex = localY * chunkWidth + localX

        // Improved coordinate transformation - no center artifacts
              const nx = (globalX / (resolution - 1)) * 2 - 1 + 0.001
      const ny = (globalY / (resolution - 1)) * 2 - 1 + 0.001

        // Advanced domain warping controlled by domainWarping parameter
        const warpStrength = domainWarping * 0.6
        const warpScale = 0.3 + featureScale * 0.4

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

        // Generate terrain height using multi-scale composition
        let height = this.noiseSystem.multiScaleNoise(warpedX, warpedY, layers)

        // Apply geological features
        if (config.mountainRanges.enabled) {
          height += this.generateMountainRanges(warpedX, warpedY, featureScale) * geologicalComplexity
        }

        if (config.valleys.enabled) {
          height = this.carveValleys(warpedX, warpedY, height, geologicalComplexity * 0.7, featureScale)
        }

        if (config.plateaus.enabled) {
          height = this.addPlateaus(warpedX, warpedY, height, featureScale)
        }

        if (config.coastalFeatures.enabled) {
          height = this.addCoastalFeatures(warpedX, warpedY, height, featureScale)
        }

        // Intelligent micro-detail that scales with geological complexity and feature scale
        const microDetailFreq = 6 + featureScale * 4
        const microDetailAmp = (1 + geologicalComplexity) * featureScale * 0.8
        const microDetail = this.noiseSystem.perlin(warpedX * microDetailFreq, warpedY * microDetailFreq) * microDetailAmp
        height += microDetail

        // Apply master relief amplitude scaling
        height *= reliefAmplitude

        heightData[localIndex] = height
      }
    }

    return {
      type: 'chunkComplete',
      data: {
        chunkId,
        heightData,
        startX,
        startY,
        endX,
        endY
      }
    }
  }

  // Geological feature methods copied from TerrainBuilder
  private generateMountainRanges(x: number, y: number, featureScale: number): number {
    const mountainScale = 0.08 * featureScale
    const ridge1 = this.noiseSystem.ridgedNoise(x * mountainScale, y * mountainScale, {
      octaves: 6,
      frequency: 1.0,
      amplitude: 1.0,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: this.terrainGenerator.getConfig().seed + 1000,
      offset: { x: 0, y: 0 },
      ridgeOffset: 1.0,
      gain: 2.0,
      threshold: 0.0
    })

    const ridge2 = this.noiseSystem.ridgedNoise(x * mountainScale * 0.5, y * mountainScale * 0.5, {
      octaves: 4,
      frequency: 1.0,
      amplitude: 0.5,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: this.terrainGenerator.getConfig().seed + 2000,
      offset: { x: 100, y: 100 },
      ridgeOffset: 1.0,
      gain: 2.0,
      threshold: 0.0
    })

    return Math.max(ridge1, ridge2 * 0.8) * 25 * featureScale
  }

  private carveValleys(x: number, y: number, height: number, intensity: number, featureScale: number): number {
    const valleyScale = 0.04 * featureScale
    const valleyNoise = this.noiseSystem.perlin(x * valleyScale, y * valleyScale)
    
    if (valleyNoise > 0.3) {
      const carveAmount = (valleyNoise - 0.3) * intensity * 15 * featureScale
      return height - carveAmount
    }
    
    return height
  }

  private addPlateaus(x: number, y: number, height: number, featureScale: number): number {
    const plateauScale = 0.06 * featureScale
    const plateauNoise = this.noiseSystem.perlin(x * plateauScale, y * plateauScale)
    
    if (plateauNoise > 0.4) {
      const plateauHeight = 20 * featureScale
      const blend = Math.min((plateauNoise - 0.4) * 5, 1)
      return height + plateauHeight * blend
    }
    
    return height
  }

  private addCoastalFeatures(x: number, y: number, height: number, featureScale: number): number {
    // Remove distance-based circular coastal features
    // Use only height-based and noise-based coastal effects
    
    // Apply coastal effects based on elevation, not distance from center
    if (height > -15 && height < 15) {
      // Beach/shoreline area - flatten and add detail
      const coastalNoise = this.noiseSystem.perlin(x * 2.5, y * 2.5) * 3.0
      height = height * 0.5 + coastalNoise
    }
    
    // Add organic coastal variation using noise instead of distance
    const coastalVariation = this.noiseSystem.fbm(x * 0.8, y * 0.8, {
      octaves: 3,
      frequency: 1.5 / featureScale,
      amplitude: 8,
      persistence: 0.4,
      lacunarity: 2.0,
      seed: 12345, // Add seed for consistency
      offset: { x: 0, y: 0 }, // Add required offset
      warpStrength: 0.2,
      warpFrequency: 0.3,
      turbulence: false
    })
    
    if (height > -30 && height < 30) {
      height += coastalVariation * 0.4
    }
    
    return height
  }
}

// Worker instance
const workerInstance = new TerrainWorkerInstance()

// Handle messages from main thread
self.onmessage = (event: MessageEvent<TerrainWorkerMessage>) => {
  try {
    const response = workerInstance.processChunk(event.data)
    self.postMessage(response)
  } catch (error) {
    self.postMessage({
      type: 'error',
      data: {
        chunkId: event.data.data.chunkId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
  }
} 