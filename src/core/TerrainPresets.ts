import { AdvancedTerrainConfig, TerrainLayer, TerrainType } from './AdvancedTerrainGenerator'
import { NoiseType } from './AdvancedNoiseSystem'

export class TerrainPresets {
  
  /**
   * Realistic mountain range with multiple ridged noise layers
   */
  static getAlpineMountainRange(): AdvancedTerrainConfig {
    return {
      size: 10,
      resolution: 512,
      seed: 42,
      
      continentalShelf: {
        enabled: false,
        depth: 0,
        falloff: 0
      },
      
      mountainRanges: {
        enabled: true,
        count: 4,
        ridgeStrength: 1.2,
        peakHeight: 450
      },
      
      valleys: {
        enabled: true,
        depth: 80,
        width: 0.08,
        networkDensity: 0.7
      },
      
      plateaus: {
        enabled: false,
        height: 0,
        edgeSharpness: 1.0
      },
      
      coastalFeatures: {
        enabled: false,
        beachWidth: 0,
        cliffHeight: 0
      },
      
      climate: {
        aridZones: false,
        temperateZones: true,
        alpineZones: true
      },
      
      layers: [
        {
          type: NoiseType.RIDGED,
          config: {
            octaves: 6,
            frequency: 0.4,
            amplitude: 200,
            persistence: 0.7,
            lacunarity: 2.2,
            seed: 42,
            offset: { x: 0, y: 0 },
            ridgeOffset: 1.0,
            gain: 3.5,
            threshold: 0.0
          },
          weight: 0.8,
          blendMode: 'add' as const
        },
        {
          type: NoiseType.FBM,
          config: {
            octaves: 8,
            frequency: 1.5,
            amplitude: 40,
            persistence: 0.4,
            lacunarity: 2.0,
            seed: 43,
            offset: { x: 100, y: 200 },
            warpStrength: 0.2,
            warpFrequency: 0.8,
            turbulence: false
          },
          weight: 0.3,
          blendMode: 'add' as const
        },
        {
          type: NoiseType.TURBULENCE,
          config: {
            octaves: 4,
            frequency: 2.5,
            amplitude: 15,
            persistence: 0.5,
            lacunarity: 2.1,
            seed: 44,
            offset: { x: 50, y: 75 },
            warpStrength: 0.1,
            warpFrequency: 1.0,
            turbulence: true
          },
          weight: 0.15,
          blendMode: 'add' as const
        }
      ]
    }
  }

  /**
   * Volcanic island chain with Voronoi patterns
   */
  static getVolcanicIslandChain(): AdvancedTerrainConfig {
    return {
      size: 8,
      resolution: 512,
      seed: 123,
      
      continentalShelf: {
        enabled: true,
        depth: -300,
        falloff: 0.5
      },
      
      mountainRanges: {
        enabled: false,
        count: 0,
        ridgeStrength: 0,
        peakHeight: 0
      },
      
      valleys: {
        enabled: false,
        depth: 0,
        width: 0,
        networkDensity: 0
      },
      
      plateaus: {
        enabled: false,
        height: 0,
        edgeSharpness: 1.0
      },
      
      coastalFeatures: {
        enabled: true,
        beachWidth: 0.03,
        cliffHeight: 25
      },
      
      climate: {
        aridZones: false,
        temperateZones: true,
        alpineZones: false
      },
      
      layers: [
        {
          type: NoiseType.VORONOI,
          config: {
            frequency: 0.3
          },
          weight: 120,
          blendMode: 'add' as const
        },
        {
          type: NoiseType.RIDGED,
          config: {
            octaves: 5,
            frequency: 0.8,
            amplitude: 180,
            persistence: 0.6,
            lacunarity: 2.3,
            seed: 124,
            offset: { x: 0, y: 0 },
            ridgeOffset: 0.8,
            gain: 4.0,
            threshold: 0.0
          },
          weight: 0.6,
          maskType: NoiseType.VORONOI,
          maskConfig: { frequency: 0.3 },
          blendMode: 'multiply' as const
        },
        {
          type: NoiseType.TURBULENCE,
          config: {
            octaves: 6,
            frequency: 1.2,
            amplitude: 60,
            persistence: 0.5,
            lacunarity: 2.0,
            seed: 125,
            offset: { x: 200, y: 300 },
            warpStrength: 0.4,
            warpFrequency: 0.6,
            turbulence: true
          },
          weight: 0.4,
          blendMode: 'add' as const
        }
      ]
    }
  }

  /**
   * Desert with dune systems using FBM with heavy warping
   */
  static getDesertDuneSystem(): AdvancedTerrainConfig {
    return {
      size: 15,
      resolution: 512,
      seed: 789,
      
      continentalShelf: {
        enabled: false,
        depth: 0,
        falloff: 0
      },
      
      mountainRanges: {
        enabled: false,
        count: 0,
        ridgeStrength: 0,
        peakHeight: 0
      },
      
      valleys: {
        enabled: false,
        depth: 0,
        width: 0,
        networkDensity: 0
      },
      
      plateaus: {
        enabled: true,
        height: 80,
        edgeSharpness: 1.5
      },
      
      coastalFeatures: {
        enabled: false,
        beachWidth: 0,
        cliffHeight: 0
      },
      
      climate: {
        aridZones: true,
        temperateZones: false,
        alpineZones: false
      },
      
      layers: [
        {
          type: NoiseType.FBM,
          config: {
            octaves: 4,
            frequency: 0.6,
            amplitude: 30,
            persistence: 0.6,
            lacunarity: 2.0,
            seed: 789,
            offset: { x: 0, y: 0 },
            warpStrength: 0.8,
            warpFrequency: 0.4,
            turbulence: false
          },
          weight: 1.0,
          blendMode: 'add' as const
        },
        {
          type: NoiseType.BILLOW,
          config: {
            octaves: 6,
            frequency: 1.2,
            amplitude: 15,
            persistence: 0.5,
            lacunarity: 2.1,
            seed: 790,
            offset: { x: 150, y: 225 }
          },
          weight: 0.6,
          blendMode: 'add' as const
        },
        {
          type: NoiseType.FBM,
          config: {
            octaves: 8,
            frequency: 2.0,
            amplitude: 8,
            persistence: 0.4,
            lacunarity: 2.2,
            seed: 791,
            offset: { x: 300, y: 400 },
            warpStrength: 1.2,
            warpFrequency: 0.8,
            turbulence: false
          },
          weight: 0.4,
          blendMode: 'overlay' as const
        }
      ]
    }
  }

  /**
   * Grand Canyon-style terrain with deep ridged valleys
   */
  static getGrandCanyonSystem(): AdvancedTerrainConfig {
    return {
      size: 12,
      resolution: 512,
      seed: 456,
      
      continentalShelf: {
        enabled: false,
        depth: 0,
        falloff: 0
      },
      
      mountainRanges: {
        enabled: false,
        count: 0,
        ridgeStrength: 0,
        peakHeight: 0
      },
      
      valleys: {
        enabled: true,
        depth: 120,
        width: 0.05,
        networkDensity: 0.8
      },
      
      plateaus: {
        enabled: true,
        height: 180,
        edgeSharpness: 3.0
      },
      
      coastalFeatures: {
        enabled: false,
        beachWidth: 0,
        cliffHeight: 0
      },
      
      climate: {
        aridZones: true,
        temperateZones: false,
        alpineZones: false
      },
      
      layers: [
        {
          type: NoiseType.RIDGED,
          config: {
            octaves: 5,
            frequency: 0.3,
            amplitude: 200,
            persistence: 0.8,
            lacunarity: 2.0,
            seed: 456,
            offset: { x: 0, y: 0 },
            ridgeOffset: 0.3,
            gain: 2.0,
            threshold: 0.0
          },
          weight: 1.0,
          blendMode: 'subtract' as const
        },
        {
          type: NoiseType.FBM,
          config: {
            octaves: 6,
            frequency: 0.8,
            amplitude: 120,
            persistence: 0.6,
            lacunarity: 2.1,
            seed: 457,
            offset: { x: 0, y: 0 },
            warpStrength: 0.1,
            warpFrequency: 0.3,
            turbulence: false
          },
          weight: 0.8,
          blendMode: 'add' as const
        },
        {
          type: NoiseType.BILLOW,
          config: {
            octaves: 4,
            frequency: 1.5,
            amplitude: 25,
            persistence: 0.5,
            lacunarity: 2.0,
            seed: 458,
            offset: { x: 100, y: 150 }
          },
          weight: 0.3,
          blendMode: 'add' as const
        }
      ]
    }
  }

  /**
   * Glacial valley system with carved features
   */
  static getGlacialValleySystem(): AdvancedTerrainConfig {
    return {
      size: 8,
      resolution: 512,
      seed: 999,
      
      continentalShelf: {
        enabled: false,
        depth: 0,
        falloff: 0
      },
      
      mountainRanges: {
        enabled: true,
        count: 2,
        ridgeStrength: 0.6,
        peakHeight: 250
      },
      
      valleys: {
        enabled: true,
        depth: 100,
        width: 0.12,
        networkDensity: 0.6
      },
      
      plateaus: {
        enabled: false,
        height: 0,
        edgeSharpness: 1.0
      },
      
      coastalFeatures: {
        enabled: false,
        beachWidth: 0,
        cliffHeight: 0
      },
      
      climate: {
        aridZones: false,
        temperateZones: false,
        alpineZones: true
      },
      
      layers: [
        {
          type: NoiseType.FBM,
          config: {
            octaves: 5,
            frequency: 0.4,
            amplitude: 150,
            persistence: 0.7,
            lacunarity: 2.0,
            seed: 999,
            offset: { x: 0, y: 0 },
            warpStrength: 0.2,
            warpFrequency: 0.3,
            turbulence: false
          },
          weight: 0.7,
          blendMode: 'add' as const
        },
        {
          type: NoiseType.RIDGED,
          config: {
            octaves: 4,
            frequency: 0.6,
            amplitude: 80,
            persistence: 0.6,
            lacunarity: 2.1,
            seed: 1000,
            offset: { x: 50, y: 75 },
            ridgeOffset: 0.7,
            gain: 1.8,
            threshold: 0.0
          },
          weight: 0.4,
          blendMode: 'add' as const
        },
        {
          type: NoiseType.BILLOW,
          config: {
            octaves: 6,
            frequency: 1.0,
            amplitude: 20,
            persistence: 0.4,
            lacunarity: 2.0,
            seed: 1001,
            offset: { x: 200, y: 300 }
          },
          weight: 0.2,
          blendMode: 'overlay' as const
        }
      ]
    }
  }

  /**
   * Complex hybrid terrain mixing multiple geological features
   */
  static getHybridComplexTerrain(): AdvancedTerrainConfig {
    return {
      size: 20,
      resolution: 1024,
      seed: 2024,
      
      continentalShelf: {
        enabled: true,
        depth: -150,
        falloff: 0.4
      },
      
      mountainRanges: {
        enabled: true,
        count: 5,
        ridgeStrength: 1.0,
        peakHeight: 400
      },
      
      valleys: {
        enabled: true,
        depth: 60,
        width: 0.06,
        networkDensity: 0.5
      },
      
      plateaus: {
        enabled: true,
        height: 120,
        edgeSharpness: 2.5
      },
      
      coastalFeatures: {
        enabled: true,
        beachWidth: 0.04,
        cliffHeight: 30
      },
      
      climate: {
        aridZones: true,
        temperateZones: true,
        alpineZones: true
      },
      
      layers: [
        // Base continental noise
        {
          type: NoiseType.FBM,
          config: {
            octaves: 6,
            frequency: 0.2,
            amplitude: 100,
            persistence: 0.6,
            lacunarity: 2.0,
            seed: 2024,
            offset: { x: 0, y: 0 },
            warpStrength: 0.3,
            warpFrequency: 0.4,
            turbulence: false
          },
          weight: 0.5,
          blendMode: 'add' as const
        },
        // Mountain ridges
        {
          type: NoiseType.RIDGED,
          config: {
            octaves: 8,
            frequency: 0.5,
            amplitude: 200,
            persistence: 0.7,
            lacunarity: 2.2,
            seed: 2025,
            offset: { x: 100, y: 150 },
            ridgeOffset: 1.0,
            gain: 3.0,
            threshold: 0.0
          },
          weight: 0.6,
          maskType: NoiseType.FBM,
          maskConfig: {
            octaves: 3,
            frequency: 0.3,
            amplitude: 1.0,
            persistence: 0.5,
            lacunarity: 2.0,
            seed: 2026,
            offset: { x: 0, y: 0 },
            warpStrength: 0,
            warpFrequency: 0,
            turbulence: false
          },
          blendMode: 'add' as const
        },
        // Desert dunes
        {
          type: NoiseType.BILLOW,
          config: {
            octaves: 5,
            frequency: 1.0,
            amplitude: 25,
            persistence: 0.5,
            lacunarity: 2.1,
            seed: 2027,
            offset: { x: 300, y: 400 }
          },
          weight: 0.3,
          maskType: NoiseType.VORONOI,
          maskConfig: { frequency: 0.2 },
          blendMode: 'overlay' as const
        },
        // Coastal variation
        {
          type: NoiseType.TURBULENCE,
          config: {
            octaves: 4,
            frequency: 1.5,
            amplitude: 30,
            persistence: 0.4,
            lacunarity: 2.0,
            seed: 2028,
            offset: { x: 500, y: 600 },
            warpStrength: 0.6,
            warpFrequency: 0.8,
            turbulence: true
          },
          weight: 0.2,
          blendMode: 'screen' as const
        },
        // Fine detail layer
        {
          type: NoiseType.FBM,
          config: {
            octaves: 10,
            frequency: 3.0,
            amplitude: 8,
            persistence: 0.3,
            lacunarity: 2.0,
            seed: 2029,
            offset: { x: 700, y: 800 },
            warpStrength: 0.1,
            warpFrequency: 2.0,
            turbulence: false
          },
          weight: 0.15,
          blendMode: 'add' as const
        }
      ]
    }
  }

  /**
   * Get all available preset names
   */
  static getPresetNames(): string[] {
    return [
      'Alpine Mountain Range',
      'Volcanic Island Chain', 
      'Desert Dune System',
      'Grand Canyon System',
      'Glacial Valley System',
      'Hybrid Complex Terrain'
    ]
  }

  /**
   * Get a preset by name
   */
  static getPreset(name: string): AdvancedTerrainConfig | null {
    switch (name) {
      case 'Alpine Mountain Range':
        return this.getAlpineMountainRange()
      case 'Volcanic Island Chain':
        return this.getVolcanicIslandChain()
      case 'Desert Dune System':
        return this.getDesertDuneSystem()
      case 'Grand Canyon System':
        return this.getGrandCanyonSystem()
      case 'Glacial Valley System':
        return this.getGlacialValleySystem()
      case 'Hybrid Complex Terrain':
        return this.getHybridComplexTerrain()
      default:
        return null
    }
  }
} 