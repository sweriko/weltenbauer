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

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const index = y * resolution + x
        
        // Improved coordinate transformation to prevent artifacts
        // Use full range without centering to avoid center-point artifacts
        const nx = (x / (resolution - 1)) * 2 - 1  // Map to [-1, 1]
        const ny = (y / (resolution - 1)) * 2 - 1  // Map to [-1, 1]
        
        let height = 0
        let frequency = scale
        let maxValue = 0
        
        // Generate octaves of noise with improved scaling
        for (let i = 0; i < octaves; i++) {
          const octaveAmplitude = Math.pow(0.5, i)
          
          // Better offset strategy to prevent line artifacts
          const offsetX = i * 1000.0  // Large offsets to avoid correlation
          const offsetY = i * 1731.0  // Prime-like numbers for better distribution
          
          const noiseValue = this.noise2D(
            nx * frequency + offsetX, 
            ny * frequency + offsetY
          )
          
          height += noiseValue * octaveAmplitude
          maxValue += octaveAmplitude
          frequency *= 2.0
        }
        
        // Normalize and apply amplitude
        height = (height / maxValue) * amplitude
        
        // NO distance-based falloff - completely natural terrain
        
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