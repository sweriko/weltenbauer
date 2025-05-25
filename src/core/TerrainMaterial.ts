import * as THREE from 'three'

export class TerrainMaterial {
  private material: THREE.ShaderMaterial
  private textures: { [key: string]: THREE.Texture } = {}
  private noiseTexture!: THREE.Texture
  
  constructor() {
    this.createNoiseTexture()
    this.loadTextures()
    this.material = this.createAdvancedMaterial()
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
            
            // Update material uniforms if material exists
            if (this.material && this.material.uniforms[`${terrain}${type.charAt(0).toUpperCase() + type.slice(1)}`]) {
              this.material.uniforms[`${terrain}${type.charAt(0).toUpperCase() + type.slice(1)}`].value = texture
            }
          },
          undefined,
          (error) => {
            console.warn(`Failed to load texture: ${texturePath}, using fallback`)
          }
        )
      })
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

  private createAdvancedMaterial(): THREE.ShaderMaterial {
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying mat3 vNormalMatrix;
      varying float vHeight;

      void main() {
        vUv = uv;
        vHeight = position.z;
        vNormal = normalize(normalMatrix * normal);
        // Calculate world-space normal for triplanar mapping
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vPosition = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -modelViewPosition.xyz;
        vNormalMatrix = normalMatrix;
        
        gl_Position = projectionMatrix * modelViewPosition;
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
      uniform sampler2D noiseTexture;

      uniform float minHeight;
      uniform float maxHeight;
      uniform float textureScale;
      uniform float detailScale;
      uniform float normalScale;
      uniform bool enableTriplanar;
      uniform bool enableTextureBombing;
      uniform bool enableMicroMacro;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying mat3 vNormalMatrix;
      varying float vHeight;

      // Advanced triplanar mapping function
      vec4 triplanarMapping(sampler2D tex, vec3 worldPos, vec3 worldNormal, float scale) {
        // Use absolute world-space normal for blending weights
        vec3 blending = abs(worldNormal);
        
        // Apply sharper blending with proper falloff to reduce seams
        blending = max(blending - 0.2, 0.0);
        blending = pow(blending, vec3(4.0));
        blending = blending / (blending.x + blending.y + blending.z + 0.00001);
        
        // Sample textures with world coordinates
        vec3 scaledPos = worldPos * scale;
        
        // X-axis projection (YZ plane)
        vec4 xProjection = texture2D(tex, scaledPos.yz);
        
        // Y-axis projection (XZ plane) 
        vec4 yProjection = texture2D(tex, scaledPos.xz);
        
        // Z-axis projection (XY plane)
        vec4 zProjection = texture2D(tex, scaledPos.xy);
        
        // Blend the projections
        return xProjection * blending.x + yProjection * blending.y + zProjection * blending.z;
      }

      // Texture bombing (micro-detail variation)
      vec4 textureBomb(sampler2D tex, vec2 uv, float scale) {
        // Get noise value at reduced frequency
        vec2 noiseCoord = uv * 0.3;
        vec2 offset = texture2D(noiseTexture, noiseCoord).xy * 2.0 - 1.0;
        
        // Adjust offset based on scale
        offset *= 0.05;
        
        // Apply random offset
        vec2 bombUv = uv * scale + offset;
        
        return texture2D(tex, bombUv);
      }

      // Height-based blend function
      float heightBlend(float height1, float height2, float blend) {
        return smoothstep(height1 - blend, height1 + blend, height2);
      }

      // Combined texture sampling with all techniques
      vec4 getTexture(sampler2D tex, vec3 worldPos, vec3 worldNormal, float scale, vec2 uv) {
        if (enableTriplanar) {
          return triplanarMapping(tex, worldPos, worldNormal, scale);
        } else if (enableTextureBombing) {
          return textureBomb(tex, uv, scale);
        } else {
          return texture2D(tex, uv * scale);
        }
      }

      // Advanced normal mapping
      vec3 getNormal(sampler2D normalMap, vec3 pos, vec3 normal, float scale, vec2 uv) {
        vec4 packedNormal;
        
        if (enableTriplanar) {
          packedNormal = triplanarMapping(normalMap, pos, vWorldNormal, scale);
        } else if (enableTextureBombing) {
          packedNormal = textureBomb(normalMap, uv, scale);
        } else {
          packedNormal = texture2D(normalMap, uv * scale);
        }
        
        vec3 normalFromMap = normalize(packedNormal.rgb * 2.0 - 1.0);
        
        // Calculate tangent space
        vec3 N = normalize(normal);
        vec3 T = normalize(cross(N, vec3(0.0, 0.0, 1.0)));
        if (length(T) < 0.1) {
          T = normalize(cross(N, vec3(1.0, 0.0, 0.0)));
        }
        vec3 B = normalize(cross(N, T));
        mat3 TBN = mat3(T, B, N);
        
        return normalize(TBN * normalFromMap);
      }

      void main() {
        // Normalize height
        float heightRange = maxHeight - minHeight;
        float normalizedHeight = heightRange > 0.0 ? (vHeight - minHeight) / heightRange : 0.5;
        normalizedHeight = clamp(normalizedHeight, 0.0, 1.0);
        
        // Blend factors for material transitions
        float blendRange = 0.1;
        
        // Calculate blend weights
        float snowWeight = heightBlend(0.85, normalizedHeight, blendRange);
        float rockWeight = heightBlend(0.6, normalizedHeight, blendRange) * (1.0 - snowWeight);
        float grassWeight = heightBlend(0.3, normalizedHeight, blendRange) * (1.0 - snowWeight) * (1.0 - rockWeight);
        float soilWeight = heightBlend(0.1, normalizedHeight, blendRange) * (1.0 - snowWeight) * (1.0 - rockWeight) * (1.0 - grassWeight);
        
        // Normalize weights
        float totalWeight = snowWeight + rockWeight + grassWeight + soilWeight;
        if (totalWeight > 0.0) {
          snowWeight /= totalWeight;
          rockWeight /= totalWeight;
          grassWeight /= totalWeight;
          soilWeight /= totalWeight;
        } else {
          soilWeight = 1.0;
        }
        
        // Micro-macro texturing
        vec4 soilColor, grassColor, rockColor, snowColor;
        
        if (enableMicroMacro) {
          // Macro texture (overall appearance)
          vec4 soilMacro = getTexture(soilDiffuse, vWorldPosition, vWorldNormal, textureScale, vUv);
          vec4 grassMacro = getTexture(grassDiffuse, vWorldPosition, vWorldNormal, textureScale, vUv);
          vec4 rockMacro = getTexture(rockDiffuse, vWorldPosition, vWorldNormal, textureScale, vUv);
          vec4 snowMacro = getTexture(snowDiffuse, vWorldPosition, vWorldNormal, textureScale, vUv);
          
          // Detail texture (fine details)
          vec4 soilDetail = getTexture(soilDiffuse, vWorldPosition, vWorldNormal, detailScale, vUv);
          vec4 grassDetail = getTexture(grassDiffuse, vWorldPosition, vWorldNormal, detailScale, vUv);
          vec4 rockDetail = getTexture(rockDiffuse, vWorldPosition, vWorldNormal, detailScale, vUv);
          vec4 snowDetail = getTexture(snowDiffuse, vWorldPosition, vWorldNormal, detailScale, vUv);
          
          // Blend macro and micro details
          float detailBlend = 0.3;
          soilColor = mix(soilMacro, soilDetail, detailBlend);
          grassColor = mix(grassMacro, grassDetail, detailBlend);
          rockColor = mix(rockMacro, rockDetail, detailBlend);
          snowColor = mix(snowMacro, snowDetail, detailBlend);
        } else {
          // Single scale texturing
          soilColor = getTexture(soilDiffuse, vWorldPosition, vWorldNormal, textureScale, vUv);
          grassColor = getTexture(grassDiffuse, vWorldPosition, vWorldNormal, textureScale, vUv);
          rockColor = getTexture(rockDiffuse, vWorldPosition, vWorldNormal, textureScale, vUv);
          snowColor = getTexture(snowDiffuse, vWorldPosition, vWorldNormal, textureScale, vUv);
        }
        
        // Final color blend
        vec4 finalColor = 
          soilColor * soilWeight +
          grassColor * grassWeight +
          rockColor * rockWeight +
          snowColor * snowWeight;
          
        // Slope-based blending for more realism
        float slope = 1.0 - vWorldNormal.y;
        float slopeBlend = 0.4;
        float slopeRockWeight = smoothstep(0.4, 0.7, slope);
        finalColor = mix(finalColor, rockColor, slopeRockWeight * slopeBlend);
        
        // Get blended normal maps
        vec3 soilNormalMap = getNormal(soilNormal, vWorldPosition, vNormal, textureScale, vUv);
        vec3 grassNormalMap = getNormal(grassNormal, vWorldPosition, vNormal, textureScale, vUv);
        vec3 rockNormalMap = getNormal(rockNormal, vWorldPosition, vNormal, textureScale, vUv);
        vec3 snowNormalMap = getNormal(snowNormal, vWorldPosition, vNormal, textureScale, vUv);
        
        vec3 blendedNormal = normalize(
          soilNormalMap * soilWeight +
          grassNormalMap * grassWeight +
          rockNormalMap * rockWeight +
          snowNormalMap * snowWeight
        );
        
        // Enhanced lighting
        vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
        float diffuse = max(dot(blendedNormal, lightDir), 0.0);
        vec3 ambient = vec3(0.3);
        
        // Specular reflection
        vec3 viewDir = normalize(vViewPosition);
        vec3 halfDir = normalize(lightDir + viewDir);
        float specular = pow(max(dot(blendedNormal, halfDir), 0.0), 64.0) * 0.2;
        
        // Apply lighting
        vec3 lighting = ambient + diffuse * vec3(1.0) + specular * vec3(1.0);
        vec3 litColor = finalColor.rgb * lighting;
        
        gl_FragColor = vec4(litColor, 1.0);
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
        noiseTexture: { value: this.noiseTexture },
        
        minHeight: { value: 0 },
        maxHeight: { value: 100 },
        textureScale: { value: 0.1 },
        detailScale: { value: 0.5 },
        normalScale: { value: 1.0 },
        
        enableTriplanar: { value: true },
        enableTextureBombing: { value: false },
        enableMicroMacro: { value: true }
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

  public setTriplanarEnabled(enabled: boolean): void {
    this.material.uniforms.enableTriplanar.value = enabled
    this.material.uniforms.enableTextureBombing.value = false
  }

  public setTextureBombingEnabled(enabled: boolean): void {
    this.material.uniforms.enableTextureBombing.value = enabled
    this.material.uniforms.enableTriplanar.value = false
  }

  public setMicroMacroEnabled(enabled: boolean): void {
    this.material.uniforms.enableMicroMacro.value = enabled
  }

  public setTextureScale(scale: number): void {
    this.material.uniforms.textureScale.value = scale
  }

  public setDetailScale(scale: number): void {
    this.material.uniforms.detailScale.value = scale
  }

  public setNormalScale(scale: number): void {
    this.material.uniforms.normalScale.value = scale
  }
  
  public dispose(): void {
    this.material.dispose()
    this.noiseTexture.dispose()
    Object.values(this.textures).forEach(texture => texture.dispose())
  }
} 