import { createNoise2D } from 'simplex-noise'

export class TerrainGenerator {
  private noise2D: ReturnType<typeof createNoise2D>
  private seed: number

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 1000000)
    this.noise2D = createNoise2D(() => this.seed / 1000000)
  }

  public generateHeightmap(
    resolution: number,
    scale: number,
    amplitude: number,
    octaves: number
  ): Float32Array {
    const heightData = new Float32Array(resolution * resolution)
    const halfRes = resolution / 2

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const index = y * resolution + x
        
        // Normalize coordinates to terrain space
        const nx = (x - halfRes) / halfRes
        const ny = (y - halfRes) / halfRes
        
        let height = 0
        let frequency = scale
        let maxValue = 0
        
        // Generate octaves of noise
        for (let i = 0; i < octaves; i++) {
          const octaveAmplitude = Math.pow(0.5, i)
          // Use better scaling to reduce repetition and streaking
          const noiseValue = this.noise2D(nx * frequency * 8 + i * 100, ny * frequency * 8 + i * 137)
          height += noiseValue * octaveAmplitude
          maxValue += octaveAmplitude
          frequency *= 2
        }
        
        // Normalize and apply amplitude
        height = (height / maxValue) * amplitude
        
        // Apply distance-based falloff for island effect (optional)
        const distance = Math.sqrt(nx * nx + ny * ny)
        const falloff = Math.max(0, 1 - Math.pow(distance * 0.7, 3)) // Less aggressive falloff
        height *= falloff
        
        heightData[index] = height
      }
    }

    return heightData
  }

  public setSeed(seed: number): void {
    this.seed = seed
    this.noise2D = createNoise2D(() => this.seed / 1000000)
  }

  public getSeed(): number {
    return this.seed
  }

  public sampleNoise(x: number, y: number): number {
    return this.noise2D(x, y)
  }

  public exportHeightmapAsImage(heightData: Float32Array, resolution: number): string {
    // Create canvas for export
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

  public generateRandomSeed(): void {
    this.setSeed(Math.floor(Math.random() * 1000000))
  }
} 