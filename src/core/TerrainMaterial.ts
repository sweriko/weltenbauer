import * as THREE from 'three'

export class TerrainMaterial {
  private material: THREE.ShaderMaterial
  private textures: { [key: string]: THREE.Texture } = {}
  
  constructor() {
    this.loadTextures()
    // Create material after textures are set up
    this.material = this.createMaterial()
  }

  private loadTextures(): void {
    const loader = new THREE.TextureLoader()
    
    // Create fallback textures (procedural)
    this.createFallbackTextures()
    
    // Load terrain textures with fallback
    const terrainTypes = ['soil', 'grass', 'rock', 'snow']
    const textureTypes = ['diffuse', 'normal']
    
    terrainTypes.forEach(terrain => {
      textureTypes.forEach(type => {
        const texturePath = `src/textures/${terrain}_${type}.jpg`
        
        // Try to load texture, fall back to procedural if it fails
        loader.load(
          texturePath,
          (texture) => {
            // Success - replace fallback with loaded texture
            this.textures[`${terrain}_${type}`] = texture
            texture.wrapS = THREE.RepeatWrapping
            texture.wrapT = THREE.RepeatWrapping
            texture.repeat.set(16, 16)
            
            // Update material uniforms
            if (this.material.uniforms[`${terrain}${type.charAt(0).toUpperCase() + type.slice(1)}`]) {
              this.material.uniforms[`${terrain}${type.charAt(0).toUpperCase() + type.slice(1)}`].value = texture
            }
          },
          undefined,
          (error) => {
            console.warn(`Failed to load texture: ${texturePath}, using fallback`)
            // Keep the fallback texture that was already set
          }
        )
      })
    })
  }

  private createFallbackTextures(): void {
    // Create simple procedural textures as fallbacks
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    
    // Soil texture (brown noise)
    this.createNoiseTexture(ctx, '#8B4513', '#654321')
    this.textures.soil_diffuse = new THREE.CanvasTexture(canvas)
    this.setupTexture(this.textures.soil_diffuse)
    
    // Soil normal (flat blue)
    this.createNormalTexture(ctx)
    this.textures.soil_normal = new THREE.CanvasTexture(canvas)
    this.setupTexture(this.textures.soil_normal)
    
    // Grass texture (green noise)
    this.createNoiseTexture(ctx, '#228B22', '#006400')
    this.textures.grass_diffuse = new THREE.CanvasTexture(canvas)
    this.setupTexture(this.textures.grass_diffuse)
    
    this.createNormalTexture(ctx)
    this.textures.grass_normal = new THREE.CanvasTexture(canvas)
    this.setupTexture(this.textures.grass_normal)
    
    // Rock texture (gray noise)
    this.createNoiseTexture(ctx, '#696969', '#2F4F4F')
    this.textures.rock_diffuse = new THREE.CanvasTexture(canvas)
    this.setupTexture(this.textures.rock_diffuse)
    
    this.createNormalTexture(ctx)
    this.textures.rock_normal = new THREE.CanvasTexture(canvas)
    this.setupTexture(this.textures.rock_normal)
    
    // Snow texture (white with slight blue tint)
    this.createNoiseTexture(ctx, '#FFFAFA', '#F0F8FF')
    this.textures.snow_diffuse = new THREE.CanvasTexture(canvas)
    this.setupTexture(this.textures.snow_diffuse)
    
    this.createNormalTexture(ctx)
    this.textures.snow_normal = new THREE.CanvasTexture(canvas)
    this.setupTexture(this.textures.snow_normal)
  }

  private createNoiseTexture(ctx: CanvasRenderingContext2D, color1: string, color2: string): void {
    const imageData = ctx.createImageData(256, 256)
    const data = imageData.data
    
    // Parse colors
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

  private createNormalTexture(ctx: CanvasRenderingContext2D): void {
    // Create a flat normal map (pointing up)
    ctx.fillStyle = '#8080FF' // 128,128,255 = pointing up in tangent space
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

  private setupTexture(texture: THREE.Texture): void {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(16, 16)
    texture.generateMipmaps = true
    texture.needsUpdate = true
  }

  private createMaterial(): THREE.ShaderMaterial {
    const vertexShader = `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vHeight;
      
      void main() {
        vPosition = position;
        vNormal = normal;
        vUv = uv;
        vHeight = position.z;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `
    
    const fragmentShader = `
      uniform sampler2D soilDiffuse;
      uniform sampler2D soilNormal;
      uniform sampler2D grassDiffuse;
      uniform sampler2D grassNormal;
      uniform sampler2D rockDiffuse;
      uniform sampler2D rockNormal;
      uniform sampler2D snowDiffuse;
      uniform sampler2D snowNormal;
      
      uniform float minHeight;
      uniform float maxHeight;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vHeight;
      
      void main() {
        // Normalize height (0-1) with safety check
        float heightRange = maxHeight - minHeight;
        float normalizedHeight = heightRange > 0.0 ? (vHeight - minHeight) / heightRange : 0.5;
        normalizedHeight = clamp(normalizedHeight, 0.0, 1.0);
        
        // Height thresholds
        float grassStart = 0.1;
        float rockStart = 0.6;
        float snowStart = 0.85;
        float transitionWidth = 0.08;
        
        // Sample textures with proper UV coordinates
        vec2 tiledUv = vUv * 16.0;
        
        vec3 soilColor = texture2D(soilDiffuse, tiledUv).rgb;
        vec3 grassColor = texture2D(grassDiffuse, tiledUv).rgb;
        vec3 rockColor = texture2D(rockDiffuse, tiledUv).rgb;
        vec3 snowColor = texture2D(snowDiffuse, tiledUv).rgb;
        
        // Sample normal maps
        vec3 soilNormalMap = normalize(texture2D(soilNormal, tiledUv).rgb * 2.0 - 1.0);
        vec3 grassNormalMap = normalize(texture2D(grassNormal, tiledUv).rgb * 2.0 - 1.0);
        vec3 rockNormalMap = normalize(texture2D(rockNormal, tiledUv).rgb * 2.0 - 1.0);
        vec3 snowNormalMap = normalize(texture2D(snowNormal, tiledUv).rgb * 2.0 - 1.0);
        
        // Start with soil
        vec3 finalColor = soilColor;
        vec3 finalNormal = soilNormalMap;
        
        // Blend to grass
        if (normalizedHeight > grassStart - transitionWidth) {
          float grassBlend = smoothstep(grassStart - transitionWidth, grassStart + transitionWidth, normalizedHeight);
          finalColor = mix(finalColor, grassColor, grassBlend);
          finalNormal = normalize(mix(finalNormal, grassNormalMap, grassBlend));
        }
        
        // Blend to rock
        if (normalizedHeight > rockStart - transitionWidth) {
          float rockBlend = smoothstep(rockStart - transitionWidth, rockStart + transitionWidth, normalizedHeight);
          finalColor = mix(finalColor, rockColor, rockBlend);
          finalNormal = normalize(mix(finalNormal, rockNormalMap, rockBlend));
        }
        
        // Blend to snow
        if (normalizedHeight > snowStart - transitionWidth) {
          float snowBlend = smoothstep(snowStart - transitionWidth, snowStart + transitionWidth, normalizedHeight);
          finalColor = mix(finalColor, snowColor, snowBlend);
          finalNormal = normalize(mix(finalNormal, snowNormalMap, snowBlend));
        }
        
        // Basic lighting using the blended normal
        vec3 lightDir = normalize(vec3(1.0, 2.0, 0.5));
        vec3 normal = normalize(vNormal);
        float diff = max(dot(normal + finalNormal * 0.3, lightDir), 0.0);
        
        // Apply lighting with ambient
        finalColor = finalColor * (0.4 + diff * 0.6);
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
    
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        soilDiffuse: { value: this.textures.soil_diffuse },
        soilNormal: { value: this.textures.soil_normal },
        grassDiffuse: { value: this.textures.grass_diffuse },
        grassNormal: { value: this.textures.grass_normal },
        rockDiffuse: { value: this.textures.rock_diffuse },
        rockNormal: { value: this.textures.rock_normal },
        snowDiffuse: { value: this.textures.snow_diffuse },
        snowNormal: { value: this.textures.snow_normal },
        minHeight: { value: 0 },
        maxHeight: { value: 100 }
      },
      side: THREE.DoubleSide
    })
    
    return material
  }
  
  public getMaterial(): THREE.ShaderMaterial {
    return this.material
  }
  
  public updateHeightRange(minHeight: number, maxHeight: number): void {
    this.material.uniforms.minHeight.value = minHeight
    this.material.uniforms.maxHeight.value = maxHeight
  }
  
  public dispose(): void {
    this.material.dispose()
    Object.values(this.textures).forEach(texture => texture.dispose())
  }
} 