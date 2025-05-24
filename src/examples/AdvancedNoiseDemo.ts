import { AdvancedTerrainGenerator, TerrainType } from '../core/AdvancedTerrainGenerator'
import { TerrainPresets } from '../core/TerrainPresets'
import { AdvancedNoiseSystem, NoiseType } from '../core/AdvancedNoiseSystem'

/**
 * Advanced Noise System Demo
 * 
 * This demonstrates the powerful new noise capabilities including:
 * - Fractal Brownian Motion (fBm) with domain warping
 * - Ridged multifractal noise for mountain ranges
 * - Multi-layer compositing with blend modes
 * - Geological feature generation
 * - Preset terrain types
 */

export class AdvancedNoiseDemo {
  private terrainGenerator: AdvancedTerrainGenerator
  private noiseSystem: AdvancedNoiseSystem

  constructor() {
    this.terrainGenerator = new AdvancedTerrainGenerator()
    this.noiseSystem = new AdvancedNoiseSystem()
  }

  /**
   * Demo 1: Basic advanced noise types comparison
   */
  public generateNoiseComparison(): { [key: string]: Float32Array } {
    const resolution = 256
    const results: { [key: string]: Float32Array } = {}

    // Test different noise types at the same coordinates
    const noiseTypes = [
      NoiseType.PERLIN,
      NoiseType.FBM,
      NoiseType.RIDGED,
      NoiseType.BILLOW,
      NoiseType.TURBULENCE,
      NoiseType.VORONOI
    ]

    const baseConfig = {
      octaves: 6,
      frequency: 0.8,
      amplitude: 1.0,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: 42,
      offset: { x: 0, y: 0 }
    }

    for (const type of noiseTypes) {
      const data = new Float32Array(resolution * resolution)
      
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const nx = (x / resolution) * 4 - 2
          const ny = (y / resolution) * 4 - 2
          
          let config: any = baseConfig
          if (type === NoiseType.RIDGED) {
            config = { ...baseConfig, ridgeOffset: 1.0, gain: 2.0, threshold: 0.0 }
          } else if (type === NoiseType.FBM || type === NoiseType.TURBULENCE) {
            config = { ...baseConfig, warpStrength: 0.3, warpFrequency: 0.5, turbulence: type === NoiseType.TURBULENCE }
          }
          
          const value = this.noiseSystem.generateNoise(nx, ny, type, config)
          data[y * resolution + x] = value
        }
      }
      
      results[type] = data
    }

    return results
  }

  /**
   * Demo 2: Multi-layer terrain with different blend modes
   */
  public generateMultiLayerTerrain(): Float32Array {
    const resolution = 512
    const heightData = new Float32Array(resolution * resolution)

    // Layer 1: Base FBM terrain
    const baseLayer = new Float32Array(resolution * resolution)
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = (x / resolution) * 2 - 1
        const ny = (y / resolution) * 2 - 1
        
        const value = this.noiseSystem.fbm(nx, ny, {
          octaves: 6,
          frequency: 0.5,
          amplitude: 100,
          persistence: 0.6,
          lacunarity: 2.0,
          seed: 100,
          offset: { x: 0, y: 0 },
          warpStrength: 0.2,
          warpFrequency: 0.3,
          turbulence: false
        })
        
        baseLayer[y * resolution + x] = value
      }
    }

    // Layer 2: Mountain ridges (additive)
    const ridgeLayer = new Float32Array(resolution * resolution)
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = (x / resolution) * 2 - 1
        const ny = (y / resolution) * 2 - 1
        
        const value = this.noiseSystem.ridgedNoise(nx, ny, {
          octaves: 5,
          frequency: 0.8,
          amplitude: 150,
          persistence: 0.7,
          lacunarity: 2.2,
          seed: 200,
          offset: { x: 50, y: 75 },
          ridgeOffset: 1.0,
          gain: 3.0,
          threshold: 0.0
        })
        
        ridgeLayer[y * resolution + x] = value
      }
    }

    // Layer 3: Detail noise (overlay blend)
    const detailLayer = new Float32Array(resolution * resolution)
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = (x / resolution) * 2 - 1
        const ny = (y / resolution) * 2 - 1
        
        const value = this.noiseSystem.billowNoise(nx, ny, {
          octaves: 8,
          frequency: 2.0,
          amplitude: 20,
          persistence: 0.4,
          lacunarity: 2.0,
          seed: 300,
          offset: { x: 100, y: 150 }
        })
        
        detailLayer[y * resolution + x] = value
      }
    }

    // Composite layers
    for (let i = 0; i < heightData.length; i++) {
      // Start with base
      let height = baseLayer[i]
      
      // Add ridges with mask
      const maskValue = Math.max(0, baseLayer[i] / 100) // Only add ridges to higher areas
      height += ridgeLayer[i] * maskValue * 0.6
      
      // Overlay detail
      const normalizedHeight = Math.max(0, Math.min(1, (height + 200) / 400))
      const detail = detailLayer[i] / 20
      if (normalizedHeight < 0.5) {
        height += 2 * normalizedHeight * detail
      } else {
        height += (1 - 2 * (1 - normalizedHeight) * (1 - detail)) * 20
      }
      
      heightData[i] = height
    }

    return heightData
  }

  /**
   * Demo 3: Procedural island chain using Voronoi + ridged noise
   */
  public generateIslandChain(): Float32Array {
    const resolution = 512
    const heightData = new Float32Array(resolution * resolution)

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = (x / resolution) * 2 - 1
        const ny = (y / resolution) * 2 - 1
        
        // Voronoi for island placement
        const voronoi = this.noiseSystem.voronoiNoise(nx, ny, 0.4)
        const islandMask = Math.max(0, 0.6 - voronoi) / 0.6
        
        // Ridged noise for volcanic peaks
        const volcanic = this.noiseSystem.ridgedNoise(nx, ny, {
          octaves: 6,
          frequency: 1.0,
          amplitude: 200,
          persistence: 0.6,
          lacunarity: 2.3,
          seed: 500,
          offset: { x: 0, y: 0 },
          ridgeOffset: 0.8,
          gain: 4.0,
          threshold: 0.0
        })
        
        // Turbulence for coastal variation
        const coastal = this.noiseSystem.fbm(nx, ny, {
          octaves: 4,
          frequency: 1.5,
          amplitude: 30,
          persistence: 0.5,
          lacunarity: 2.0,
          seed: 600,
          offset: { x: 200, y: 300 },
          warpStrength: 0.4,
          warpFrequency: 0.6,
          turbulence: true
        })
        
        // Ocean depth falloff
        const distance = Math.sqrt(nx * nx + ny * ny)
        const oceanDepth = Math.max(0, (distance - 0.8) * 300)
        
        // Combine layers
        let height = volcanic * islandMask + coastal * 0.3 - oceanDepth
        
        heightData[y * resolution + x] = height
      }
    }

    return heightData
  }

  /**
   * Demo 4: Test all terrain presets
   */
  public generateAllPresets(): { [key: string]: Float32Array } {
    const results: { [key: string]: Float32Array } = {}
    const presetNames = TerrainPresets.getPresetNames()

    for (const presetName of presetNames) {
      const preset = TerrainPresets.getPreset(presetName)
      if (preset) {
        // Use smaller resolution for demo
        preset.resolution = 256
        
        this.terrainGenerator.updateConfig(preset)
        const heightData = this.terrainGenerator.generateTerrain()
        results[presetName] = heightData
      }
    }

    return results
  }

  /**
   * Demo 5: Domain warping showcase
   */
  public generateDomainWarpShowcase(): { original: Float32Array; warped: Float32Array } {
    const resolution = 256
    const original = new Float32Array(resolution * resolution)
    const warped = new Float32Array(resolution * resolution)

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = (x / resolution) * 4 - 2
        const ny = (y / resolution) * 4 - 2
        
        // Original FBM without warping
        const originalValue = this.noiseSystem.fbm(nx, ny, {
          octaves: 6,
          frequency: 0.8,
          amplitude: 1.0,
          persistence: 0.5,
          lacunarity: 2.0,
          seed: 700,
          offset: { x: 0, y: 0 },
          warpStrength: 0,
          warpFrequency: 0,
          turbulence: false
        })
        
        // Same FBM with heavy domain warping
        const warpedValue = this.noiseSystem.fbm(nx, ny, {
          octaves: 6,
          frequency: 0.8,
          amplitude: 1.0,
          persistence: 0.5,
          lacunarity: 2.0,
          seed: 700,
          offset: { x: 0, y: 0 },
          warpStrength: 1.0,
          warpFrequency: 0.4,
          turbulence: false
        })
        
        original[y * resolution + x] = originalValue
        warped[y * resolution + x] = warpedValue
      }
    }

    return { original, warped }
  }

  /**
   * Demo 6: Custom hybrid terrain using multiple techniques
   */
  public generateCustomHybridTerrain(): Float32Array {
    const resolution = 512
    
    // Define custom terrain layers
    const layers = [
      {
        type: NoiseType.FBM,
        config: {
          octaves: 6,
          frequency: 0.3,
          amplitude: 80,
          persistence: 0.6,
          lacunarity: 2.0,
          seed: 1000,
          offset: { x: 0, y: 0 },
          warpStrength: 0.2,
          warpFrequency: 0.4,
          turbulence: false
        },
        weight: 0.5
      },
      {
        type: NoiseType.RIDGED,
        config: {
          octaves: 5,
          frequency: 0.7,
          amplitude: 120,
          persistence: 0.7,
          lacunarity: 2.2,
          seed: 1001,
          offset: { x: 100, y: 150 },
          ridgeOffset: 1.0,
          gain: 2.5,
          threshold: 0.0
        },
        weight: 0.4
      },
      {
        type: NoiseType.TURBULENCE,
        config: {
          octaves: 8,
          frequency: 1.5,
          amplitude: 25,
          persistence: 0.4,
          lacunarity: 2.0,
          seed: 1002,
          offset: { x: 200, y: 300 },
          warpStrength: 0.3,
          warpFrequency: 0.8,
          turbulence: true
        },
        weight: 0.2
      }
    ]

    const heightData = new Float32Array(resolution * resolution)

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = (x / resolution) * 2 - 1
        const ny = (y / resolution) * 2 - 1
        
        const height = this.noiseSystem.multiScaleNoise(nx, ny, layers)
        heightData[y * resolution + x] = height
      }
    }

    return heightData
  }

  /**
   * Generate a preview image from height data for visualization
   */
  public heightDataToImageURL(heightData: Float32Array, resolution: number): string {
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

  /**
   * Run all demos and return results
   */
  public runAllDemos(): any {
    console.log('🏔️ Advanced Noise System Demo')
    console.log('================================')
    
    console.log('1. Generating noise type comparison...')
    const noiseComparison = this.generateNoiseComparison()
    
    console.log('2. Generating multi-layer terrain...')
    const multiLayer = this.generateMultiLayerTerrain()
    
    console.log('3. Generating island chain...')
    const islands = this.generateIslandChain()
    
    console.log('4. Generating all presets...')
    const presets = this.generateAllPresets()
    
    console.log('5. Generating domain warp showcase...')
    const domainWarp = this.generateDomainWarpShowcase()
    
    console.log('6. Generating custom hybrid terrain...')
    const hybrid = this.generateCustomHybridTerrain()
    
    console.log('✅ All demos completed!')
    
    return {
      noiseComparison,
      multiLayer,
      islands,
      presets,
      domainWarp,
      hybrid
    }
  }
} 