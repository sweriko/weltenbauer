import * as THREE from 'three/webgpu'
import { 
  texture, 
  mix,
  smoothstep,
  uniform,
  Fn,
  positionWorld,
  normalWorld,
  dot,
  vec3,
  vec2,
  mx_noise_float,
  sin,
  floor,
  fract,
  min,
  abs,
  float
} from 'three/tsl'

export class TerrainMaterial {
  private material: THREE.MeshStandardMaterial
  private textures: { [key: string]: THREE.Texture } = {}
  private noiseTexture!: THREE.Texture
  private bombingNoiseTexture!: THREE.Texture
  private simplexNoiseTexture!: THREE.Texture
  
  // TSL uniforms for material parameters
  private materialUniforms: any = {}
  
  constructor() {
    this.createNoiseTexture()
    this.loadTextures()
    this.material = this.createAdvancedTSLMaterial()
  }

  private createNoiseTexture(): void {
    // Create a high-quality noise texture for texture bombing
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')!
    
    const imageData = ctx.createImageData(512, 512)
    const data = imageData.data
    
    // Generate smooth noise using multiple octaves
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        let noise = 0
        let amplitude = 1
        let frequency = 0.01
        
        // Multiple octaves for better noise
        for (let octave = 0; octave < 4; octave++) {
          noise += this.simpleNoise(x * frequency, y * frequency) * amplitude
          amplitude *= 0.5
          frequency *= 2
        }
        
        // Normalize to 0-1 range
        noise = (noise + 1) * 0.5
        noise = Math.max(0, Math.min(1, noise))
        
        const value = Math.floor(noise * 255)
        const index = (y * 512 + x) * 4
        
        data[index] = value     // R
        data[index + 1] = value // G
        data[index + 2] = value // B
        data[index + 3] = 255   // A
      }
    }
    
    ctx.putImageData(imageData, 0, 0)
    this.noiseTexture = new THREE.CanvasTexture(canvas)
    this.noiseTexture.wrapS = THREE.RepeatWrapping
    this.noiseTexture.wrapT = THREE.RepeatWrapping
    this.noiseTexture.needsUpdate = true
  }

  private simpleNoise(x: number, y: number): number {
    // Simple pseudo-random noise function
    const a = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    return 2 * (a - Math.floor(a)) - 1
  }

  private loadTextures(): void {
    const loader = new THREE.TextureLoader()
    
    // Create fallback textures first
    this.createFallbackTextures()
    
    // Load terrain textures
    const terrainTypes = ['soil', 'grass', 'rock', 'snow']
    const textureTypes = ['diffuse', 'normal']
    
    terrainTypes.forEach(terrain => {
      textureTypes.forEach(type => {
        const texturePath = `src/textures/${terrain}_${type}.jpg`
        
        loader.load(
          texturePath,
          (texture) => {
            console.log(`Loaded texture: ${texturePath}`)
            this.textures[`${terrain}_${type}`] = texture
            this.configureTexture(texture)
          },
          undefined,
          (_error) => {
            console.warn(`Failed to load texture: ${texturePath}, using fallback`)
          }
        )
      })
    })
    
    // Load noise textures
    loader.load('noise/bombingnoise.png', (texture) => {
      this.bombingNoiseTexture = texture
      this.configureNoiseTexture(texture)
      console.log('Loaded bombing noise texture')
    }, undefined, () => {
      console.warn('Failed to load bombing noise, using fallback')
      this.bombingNoiseTexture = this.noiseTexture
    })
    
    loader.load('noise/simplex.png', (texture) => {
      this.simplexNoiseTexture = texture
      this.configureNoiseTexture(texture)
      console.log('Loaded simplex noise texture')
    }, undefined, () => {
      console.warn('Failed to load simplex noise, using fallback')
      this.simplexNoiseTexture = this.noiseTexture
    })
  }

  private createFallbackTextures(): void {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    
    // Soil texture
    this.createNoiseTexture2D(ctx, '#8B4513', '#654321')
    this.textures.soil_diffuse = new THREE.CanvasTexture(canvas)
    this.configureTexture(this.textures.soil_diffuse)
    
    this.createNormalTexture2D(ctx)
    this.textures.soil_normal = new THREE.CanvasTexture(canvas)
    this.configureTexture(this.textures.soil_normal)
    
    // Grass texture
    this.createNoiseTexture2D(ctx, '#228B22', '#006400')
    this.textures.grass_diffuse = new THREE.CanvasTexture(canvas)
    this.configureTexture(this.textures.grass_diffuse)
    
    this.createNormalTexture2D(ctx)
    this.textures.grass_normal = new THREE.CanvasTexture(canvas)
    this.configureTexture(this.textures.grass_normal)
    
    // Rock texture
    this.createNoiseTexture2D(ctx, '#696969', '#2F4F4F')
    this.textures.rock_diffuse = new THREE.CanvasTexture(canvas)
    this.configureTexture(this.textures.rock_diffuse)
    
    this.createNormalTexture2D(ctx)
    this.textures.rock_normal = new THREE.CanvasTexture(canvas)
    this.configureTexture(this.textures.rock_normal)
    
    // Snow texture
    this.createNoiseTexture2D(ctx, '#FFFAFA', '#F0F8FF')
    this.textures.snow_diffuse = new THREE.CanvasTexture(canvas)
    this.configureTexture(this.textures.snow_diffuse)
    
    this.createNormalTexture2D(ctx)
    this.textures.snow_normal = new THREE.CanvasTexture(canvas)
    this.configureTexture(this.textures.snow_normal)
    
    // Set fallback noise textures
    this.bombingNoiseTexture = this.noiseTexture
    this.simplexNoiseTexture = this.noiseTexture
  }

  private createNoiseTexture2D(ctx: CanvasRenderingContext2D, color1: string, color2: string): void {
    const imageData = ctx.createImageData(256, 256)
    const data = imageData.data
    
    const c1 = this.hexToRgb(color1)
    const c2 = this.hexToRgb(color2)
    
    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.random()
      const r = Math.floor(c1.r + (c2.r - c1.r) * noise)
      const g = Math.floor(c1.g + (c2.g - c1.g) * noise)
      const b = Math.floor(c1.b + (c2.b - c1.b) * noise)
      
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
    
    ctx.putImageData(imageData, 0, 0)
  }

  private createNormalTexture2D(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#8080FF'
    ctx.fillRect(0, 0, 256, 256)
  }

  private hexToRgb(hex: string): { r: number, g: number, b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 128, g: 128, b: 128 }
  }

  private configureTexture(texture: THREE.Texture): void {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
  }
  
  private configureNoiseTexture(texture: THREE.Texture): void {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
  }

  private createAdvancedTSLMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      metalness: 0,
      roughness: 0.8
    })
    
    // TSL uniforms matching the reference code
    const grassDirtHeight = uniform(30.0)      // 0-30% - mixed dirt/grass layer
    const rockHeight = uniform(25.0)           // 25-85% - rock layer starts early  
    const snowHeight = uniform(85.0)           // 85-100% - snow layer (top 15%)
    const slopeThreshold = uniform(0.6)        // Slope threshold for rock emphasis
    const triplanarScale = uniform(100.0)      // Triplanar mapping scale
    const bombingScale = uniform(0.0025)       // Texture bombing scale
    const simplexScale = uniform(0.002)        // Simplex noise scale for larger dirt/grass patches
    
    // Store uniforms for later access
    this.materialUniforms = {
      grassDirtHeight,
      rockHeight,
      snowHeight,
      slopeThreshold,
      triplanarScale,
      bombingScale,
      simplexScale
    }
    
    // Advanced terrain shader with proper triplanar mapping and texture bombing
    material.colorNode = Fn(() => {
      const worldPos = positionWorld
      const worldNormal = normalWorld
      const height = worldPos.y  // Use Y for height, following reference code
      
      // Calculate slope factor (0 = flat, 1 = steep)
      const upVector = vec3(0, 1, 0)
      const slopeFactor = dot(worldNormal, upVector).oneMinus()
      
      // Texture bombing implementation - sample bombing noise for variation
      const bombingNoise = texture(this.bombingNoiseTexture, worldPos.xz.mul(bombingScale)).x
      const bombingOffset = bombingNoise.mul(8.0)
      const bombingFrac = fract(bombingOffset)
      
      // Generate texture coordinate offsets for bombing
      const offset1 = sin(vec2(3.0, 7.0).mul(floor(bombingOffset.add(0.5))))
      const offset2 = sin(vec2(3.0, 7.0).mul(floor(bombingOffset)))
      const bombingBlend = min(bombingFrac, bombingFrac.oneMinus()).mul(2.0)
      
      // Simplex noise for dirt variation on grass
      const simplexNoise = texture(this.simplexNoiseTexture, worldPos.xz.mul(simplexScale)).x
      const dirtVariationNoise = simplexNoise.mul(2.0).sub(1.0) // Convert to -1 to 1 range
      
      // Triplanar mapping scale
      const scale = triplanarScale
      
      // Calculate triplanar weights
      const triplanarWeights = abs(worldNormal)
      const normalizedWeights = triplanarWeights.div(
        triplanarWeights.x.add(triplanarWeights.y).add(triplanarWeights.z)
      )
      
      // Sample dirt texture with triplanar mapping and bombing
      const dirtX = mix(
        texture(this.textures.soil_diffuse, worldPos.zy.div(scale).add(offset1)),
        texture(this.textures.soil_diffuse, worldPos.zy.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const dirtY = mix(
        texture(this.textures.soil_diffuse, worldPos.xz.div(scale).add(offset1)),
        texture(this.textures.soil_diffuse, worldPos.xz.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const dirtZ = mix(
        texture(this.textures.soil_diffuse, worldPos.xy.div(scale).add(offset1)),
        texture(this.textures.soil_diffuse, worldPos.xy.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const dirtColor = dirtX.mul(normalizedWeights.x)
                       .add(dirtY.mul(normalizedWeights.y))
                       .add(dirtZ.mul(normalizedWeights.z))
      
      // Sample grass texture with triplanar mapping and bombing
      const grassX = mix(
        texture(this.textures.grass_diffuse, worldPos.zy.div(scale).add(offset1)),
        texture(this.textures.grass_diffuse, worldPos.zy.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const grassY = mix(
        texture(this.textures.grass_diffuse, worldPos.xz.div(scale).add(offset1)),
        texture(this.textures.grass_diffuse, worldPos.xz.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const grassZ = mix(
        texture(this.textures.grass_diffuse, worldPos.xy.div(scale).add(offset1)),
        texture(this.textures.grass_diffuse, worldPos.xy.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const grassColor = grassX.mul(normalizedWeights.x)
                        .add(grassY.mul(normalizedWeights.y))
                        .add(grassZ.mul(normalizedWeights.z))
      
      // Sample rock texture with triplanar mapping and bombing
      const rockX = mix(
        texture(this.textures.rock_diffuse, worldPos.zy.div(scale).add(offset1)),
        texture(this.textures.rock_diffuse, worldPos.zy.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const rockY = mix(
        texture(this.textures.rock_diffuse, worldPos.xz.div(scale).add(offset1)),
        texture(this.textures.rock_diffuse, worldPos.xz.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const rockZ = mix(
        texture(this.textures.rock_diffuse, worldPos.xy.div(scale).add(offset1)),
        texture(this.textures.rock_diffuse, worldPos.xy.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const rockColor = rockX.mul(normalizedWeights.x)
                       .add(rockY.mul(normalizedWeights.y))
                       .add(rockZ.mul(normalizedWeights.z))
      
      // Sample snow texture with triplanar mapping and bombing
      const snowX = mix(
        texture(this.textures.snow_diffuse, worldPos.zy.div(scale).add(offset1)),
        texture(this.textures.snow_diffuse, worldPos.zy.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const snowY = mix(
        texture(this.textures.snow_diffuse, worldPos.xz.div(scale).add(offset1)),
        texture(this.textures.snow_diffuse, worldPos.xz.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const snowZ = mix(
        texture(this.textures.snow_diffuse, worldPos.xy.div(scale).add(offset1)),
        texture(this.textures.snow_diffuse, worldPos.xy.div(scale).add(offset2)),
        smoothstep(float(0.2), float(0.8), bombingBlend)
      )
      const snowColor = snowX.mul(normalizedWeights.x)
                       .add(snowY.mul(normalizedWeights.y))
                       .add(snowZ.mul(normalizedWeights.z))
      
      // Noise for natural variation at boundaries
      const heightNoise = mx_noise_float(worldPos.xz.mul(0.05)).mul(3.0)
      const slopeNoise = mx_noise_float(worldPos.xz.mul(0.1)).mul(0.1)
      const snowNoise = mx_noise_float(worldPos.xz.mul(0.02)).mul(5.0)
      
      // Create dirt/grass base layer (0-30% height) using noise patches
      smoothstep(
        grassDirtHeight.add(heightNoise).sub(5.0),
        grassDirtHeight.add(heightNoise).add(5.0),
        height
      ).oneMinus() // 1.0 at low terrain, 0.0 at high terrain
      
      // Use simplex noise to create patches of dirt and grass
      const dirtGrassNoise = dirtVariationNoise.sub(0.4) // Shift range to favor grass 3x more than dirt
      const dirtPatchWeight = smoothstep(float(-0.6), float(0.4), dirtGrassNoise)
      
      // Create the base dirt/grass layer
      const baseDirtGrassColor = mix(grassColor, dirtColor, dirtPatchWeight)
      
      // Start with the dirt/grass base layer
      const finalColor = baseDirtGrassColor.toVar()
      
      // Rock blending (25-85% height range, enhanced on slopes)
      const adjustedRockHeight = rockHeight.add(heightNoise)
      const rockHeightWeight = smoothstep(
        adjustedRockHeight.sub(3.0),
        adjustedRockHeight.add(8.0),
        height
      )
      
      // Enhanced rock appearance on slopes throughout height range
      const adjustedSlopeThreshold = slopeThreshold.add(slopeNoise)
      const slopeRockWeight = smoothstep(
        adjustedSlopeThreshold.sub(0.1),
        adjustedSlopeThreshold.add(0.1),
        slopeFactor
      )
      
      // Combine height-based and slope-based rock weights
      const combinedRockWeight = mix(
        rockHeightWeight.mul(0.8), // Strong rock weight based on height
        rockHeightWeight,          // Full rock weight when on slope
        slopeRockWeight
      )
      
      // Apply rock with stronger presence
      finalColor.assign(mix(finalColor, rockColor, combinedRockWeight))
      
      // Snow/Rock patching in high elevation zones (80-100% height)
      const highElevationThreshold = uniform(80.0)
      const isHighElevation = smoothstep(
        highElevationThreshold.sub(5.0),
        highElevationThreshold.add(5.0),
        height
      )
      
      // Use noise to create snow/rock patches at high elevation
      const snowRockNoise = mx_noise_float(worldPos.xz.mul(0.008)).add(snowNoise.mul(0.1))
      const snowPatchWeight = smoothstep(float(-0.2), float(0.6), snowRockNoise).mul(
        // Avalanche effect - less snow on very steep slopes
        smoothstep(slopeThreshold.add(0.4), slopeThreshold, slopeFactor)
      )
      
      // Create snow/rock mixed layer for high elevations
      const snowRockMix = mix(rockColor, snowColor, snowPatchWeight)
      
      // Apply snow/rock patches only at high elevations
      finalColor.assign(mix(finalColor, snowRockMix, isHighElevation))
      
      return finalColor
    })()
    
    return material
  }
  
  public getMaterial(): THREE.MeshStandardMaterial {
    return this.material
  }
  
  public updateHeightRange(minHeight: number, maxHeight: number): void {
    // Update height-based thresholds based on actual terrain range
    const heightRange = maxHeight - minHeight
    
    if (this.materialUniforms.grassDirtHeight) {
      this.materialUniforms.grassDirtHeight.value = minHeight + heightRange * 0.3 // 30% of range
    }
    if (this.materialUniforms.rockHeight) {
      this.materialUniforms.rockHeight.value = minHeight + heightRange * 0.25 // 25% of range
    }
    if (this.materialUniforms.snowHeight) {
      this.materialUniforms.snowHeight.value = minHeight + heightRange * 0.85 // 85% of range
    }
  }

  public setTriplanarEnabled(_enabled: boolean): void {
    // Triplanar is always enabled in this advanced implementation
    console.log(`Triplanar mapping is always enabled in advanced terrain material`)
  }

  public setTextureBombingEnabled(_enabled: boolean): void {
    // Texture bombing is always enabled in this advanced implementation
    console.log(`Texture bombing is always enabled in advanced terrain material`)
  }

  public setMicroMacroEnabled(_enabled: boolean): void {
    // Advanced layering is always enabled in this implementation
    console.log(`Advanced layering is always enabled in advanced terrain material`)
  }

  public setTextureScale(scale: number): void {
    if (this.materialUniforms.triplanarScale) {
      this.materialUniforms.triplanarScale.value = scale
    }
  }

  public setDetailScale(scale: number): void {
    if (this.materialUniforms.bombingScale) {
      this.materialUniforms.bombingScale.value = scale
    }
  }

  public setNormalScale(scale: number): void {
    // Normal scale functionality preserved for API compatibility
    console.log(`Normal scale set to: ${scale}`)
  }
  
  public dispose(): void {
    this.material.dispose()
    this.noiseTexture.dispose()
    this.bombingNoiseTexture?.dispose()
    this.simplexNoiseTexture?.dispose()
    Object.values(this.textures).forEach(texture => texture.dispose())
  }
} 