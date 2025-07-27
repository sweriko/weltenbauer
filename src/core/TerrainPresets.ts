import { AdvancedTerrainConfig } from './AdvancedTerrainGenerator'

export interface TerrainPreset extends AdvancedTerrainConfig {
  name: string
  description: string
}

export class TerrainPresets {
  private static presets: Map<string, TerrainPreset> = new Map([
    [
      'rolling_hills',
      {
        name: 'Rolling Hills',
        description: 'Gentle rolling countryside with soft hills and valleys',
        size: 5,
        resolution: 512,
        seed: 42,
        geologicalComplexity: 0.6,
        domainWarping: 0.3,
        reliefAmplitude: 0.8,
        featureScale: 2.0,
        continentalShelf: {
          enabled: false,
          depth: -200,
          falloff: 0.3
        },
        mountainRanges: {
          enabled: false,
          count: 0,
          ridgeStrength: 0.0,
          peakHeight: 0
        },
        valleys: {
          enabled: true,
          depth: 30,
          width: 0.15,
          networkDensity: 0.3
        },
        plateaus: {
          enabled: false,
          height: 0,
          edgeSharpness: 1.0
        },
        coastalFeatures: {
          enabled: false,
          beachWidth: 0.05,
          cliffHeight: 20
        },
        climate: {
          aridZones: false,
          temperateZones: true,
          alpineZones: false
        },
        layers: []
      }
    ],
    [
      'alpine_peaks',
      {
        name: 'Alpine Peaks',
        description: 'Dramatic mountain ranges with sharp ridges and deep valleys',
        size: 5,
        resolution: 512,
        seed: 123,
        geologicalComplexity: 1.8,
        domainWarping: 0.7,
        reliefAmplitude: 3.5,
        featureScale: 1.2,
        continentalShelf: {
          enabled: false,
          depth: -200,
          falloff: 0.3
        },
        mountainRanges: {
          enabled: true,
          count: 5,
          ridgeStrength: 1.2,
          peakHeight: 800
        },
        valleys: {
          enabled: true,
          depth: 150,
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
          beachWidth: 0.05,
          cliffHeight: 20
        },
        climate: {
          aridZones: false,
          temperateZones: true,
          alpineZones: true
        },
        layers: []
      }
    ],
    [
      'volcanic_island',
      {
        name: 'Volcanic Island',
        description: 'Tropical volcanic island with steep cliffs and coastal features',
        size: 5,
        resolution: 512,
        seed: 456,
        geologicalComplexity: 1.4,
        domainWarping: 0.8,
        reliefAmplitude: 2.5,
        featureScale: 0.8,
        continentalShelf: {
          enabled: true,
          depth: -300,
          falloff: 0.4
        },
        mountainRanges: {
          enabled: true,
          count: 2,
          ridgeStrength: 0.9,
          peakHeight: 500
        },
        valleys: {
          enabled: true,
          depth: 80,
          width: 0.12,
          networkDensity: 0.6
        },
        plateaus: {
          enabled: false,
          height: 0,
          edgeSharpness: 1.0
        },
        coastalFeatures: {
          enabled: true,
          beachWidth: 0.03,
          cliffHeight: 50
        },
        climate: {
          aridZones: false,
          temperateZones: true,
          alpineZones: false
        },
        layers: []
      }
    ],
    [
      'desert_mesa',
      {
        name: 'Desert Mesa',
        description: 'Arid landscape with flat-topped plateaus and rocky canyons',
        size: 5,
        resolution: 512,
        seed: 789,
        geologicalComplexity: 1.0,
        domainWarping: 0.4,
        reliefAmplitude: 1.8,
        featureScale: 1.8,
        continentalShelf: {
          enabled: false,
          depth: -200,
          falloff: 0.3
        },
        mountainRanges: {
          enabled: false,
          count: 0,
          ridgeStrength: 0.0,
          peakHeight: 0
        },
        valleys: {
          enabled: true,
          depth: 120,
          width: 0.06,
          networkDensity: 0.4
        },
        plateaus: {
          enabled: true,
          height: 200,
          edgeSharpness: 3.0
        },
        coastalFeatures: {
          enabled: false,
          beachWidth: 0.05,
          cliffHeight: 20
        },
        climate: {
          aridZones: true,
          temperateZones: false,
          alpineZones: false
        },
        layers: []
      }
    ],
    [
      'coastal_cliffs',
      {
        name: 'Coastal Cliffs',
        description: 'Dramatic coastline with high cliffs and rocky shores',
        size: 5,
        resolution: 512,
        seed: 101112,
        geologicalComplexity: 1.2,
        domainWarping: 0.6,
        reliefAmplitude: 2.2,
        featureScale: 1.5,
        continentalShelf: {
          enabled: true,
          depth: -250,
          falloff: 0.5
        },
        mountainRanges: {
          enabled: true,
          count: 2,
          ridgeStrength: 0.6,
          peakHeight: 300
        },
        valleys: {
          enabled: true,
          depth: 60,
          width: 0.1,
          networkDensity: 0.5
        },
        plateaus: {
          enabled: false,
          height: 0,
          edgeSharpness: 1.0
        },
        coastalFeatures: {
          enabled: true,
          beachWidth: 0.02,
          cliffHeight: 80
        },
        climate: {
          aridZones: false,
          temperateZones: true,
          alpineZones: false
        },
        layers: []
      }
    ],
    [
      'grand_canyon',
      {
        name: 'Grand Canyon',
        description: 'Deep canyon system with layered rock formations',
        size: 5,
        resolution: 512,
        seed: 131415,
        geologicalComplexity: 0.8,
        domainWarping: 0.3,
        reliefAmplitude: 2.8,
        featureScale: 2.5,
        continentalShelf: {
          enabled: false,
          depth: -200,
          falloff: 0.3
        },
        mountainRanges: {
          enabled: false,
          count: 0,
          ridgeStrength: 0.0,
          peakHeight: 0
        },
        valleys: {
          enabled: true,
          depth: 400,
          width: 0.04,
          networkDensity: 0.8
        },
        plateaus: {
          enabled: true,
          height: 150,
          edgeSharpness: 4.0
        },
        coastalFeatures: {
          enabled: false,
          beachWidth: 0.05,
          cliffHeight: 20
        },
        climate: {
          aridZones: true,
          temperateZones: false,
          alpineZones: false
        },
        layers: []
      }
    ]
  ])

  public static getPresetNames(): string[] {
    return Array.from(this.presets.keys())
  }

  public static getPreset(name: string): TerrainPreset | undefined {
    return this.presets.get(name)
  }

  public static getAllPresets(): TerrainPreset[] {
    return Array.from(this.presets.values())
  }

  public static addPreset(preset: TerrainPreset): void {
    this.presets.set(preset.name.toLowerCase().replace(/\s+/g, '_'), preset)
  }

  public static removePreset(name: string): boolean {
    return this.presets.delete(name)
  }

  public static hasPreset(name: string): boolean {
    return this.presets.has(name)
  }
} 