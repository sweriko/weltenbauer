import * as THREE from 'three'

export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten' | 'mountain'

export interface MountainPreset {
  name: string
  size: number
  strength: number
  octaves: number
  persistence: number
  frequency: number
  ridgeSharpness: number
  type: 'alpine' | 'desert'
}

export interface BrushSettings {
  size: number
  strength: number
  mode: BrushMode
  mountainPreset?: MountainPreset
}

// Mountain presets for different mountain types
export const MOUNTAIN_PRESETS: { [key: string]: MountainPreset } = {
  alaskan: {
    name: 'Alaskan/Everest',
    size: 250,
    strength: 0.8,
    octaves: 8,
    persistence: 0.6,
    frequency: 0.004,
    ridgeSharpness: 2.4,
    type: 'alpine'
  },
  desert: {
    name: 'Nevada/New Mexico',
    size: 200,
    strength: 0.6,
    octaves: 6,
    persistence: 0.5,
    frequency: 0.006,
    ridgeSharpness: 1.8,
    type: 'desert'
  }
}

export class BrushSystem {
  private terrain: THREE.Mesh | null = null
  private heightData: Float32Array | null = null
  private originalHeightData: Float32Array | null = null
  private resolution: number = 0
  private terrainSize: number = 1000
  
  private brushSettings: BrushSettings = {
    size: 10,
    strength: 0.5,
    mode: 'raise'
  }

  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()
  private isMouseDown = false
  private isActive = false
  
  // Brush state for better flatten behavior
  private flattenHeight: number = 0
  private brushStarted = false
  
  // Brush preview
  private brushPreview: THREE.Mesh | null = null
  private scene: THREE.Scene | null = null

  public setTerrain(terrain: THREE.Mesh, heightData: Float32Array, resolution: number): void {
    this.terrain = terrain
    this.heightData = heightData.slice() // Make a copy
    this.originalHeightData = heightData.slice() // Keep original for reference
    this.resolution = resolution
    this.scene = terrain.parent as THREE.Scene
    
    // Calculate terrain size from geometry
    const geometry = terrain.geometry as THREE.PlaneGeometry
    this.terrainSize = geometry.parameters.width
    
    this.createBrushPreview()
  }

  private createBrushPreview(): void {
    if (this.brushPreview) {
      this.scene?.remove(this.brushPreview)
      this.brushPreview.geometry.dispose()
      ;(this.brushPreview.material as THREE.Material).dispose()
    }

    const geometry = new THREE.RingGeometry(0, this.brushSettings.size, 32)
    
    // Different color for mountain mode
    const color = this.brushSettings.mode === 'mountain' ? 0x8B4513 : 0xff6600
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    })

    this.brushPreview = new THREE.Mesh(geometry, material)
    this.brushPreview.rotation.x = -Math.PI / 2
    this.brushPreview.visible = false
    
    if (this.scene) {
      this.scene.add(this.brushPreview)
    }
  }

  public setBrushSettings(settings: Partial<BrushSettings>): void {
    this.brushSettings = { ...this.brushSettings, ...settings }
    
    if ((settings.size || settings.mode) && this.brushPreview) {
      this.createBrushPreview()
    }
  }

  public getBrushSettings(): BrushSettings {
    return { ...this.brushSettings }
  }

  public applyMountainPreset(presetKey: string): void {
    const preset = MOUNTAIN_PRESETS[presetKey]
    if (preset) {
      this.setBrushSettings({
        mode: 'mountain',
        size: preset.size,
        strength: preset.strength,
        mountainPreset: preset
      })
    }
  }

  public getHeightData(): Float32Array {
    return this.heightData || new Float32Array(0)
  }

  public setActive(active: boolean): void {
    this.isActive = active
    if (this.brushPreview) {
      this.brushPreview.visible = active
    }
  }

  public handleMouseDown(event: MouseEvent, camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    if (!this.isActive) return
    
    this.isMouseDown = true
    this.brushStarted = true
    this.updateMousePosition(event, canvas)
    
    // For flatten mode, set the target height based on the center point
    if (this.brushSettings.mode === 'flatten') {
      this.setFlattenHeight(camera)
    }
    
    this.applyBrush(camera)
  }

  public handleMouseMove(event: MouseEvent, camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    if (!this.isActive) return
    
    this.updateMousePosition(event, canvas)
    this.updateBrushPreview(camera)
    
    if (this.isMouseDown) {
      this.applyBrush(camera)
    }
  }

  public handleMouseUp(): void {
    this.isMouseDown = false
    this.brushStarted = false
  }

  private updateMousePosition(event: MouseEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  private updateBrushPreview(camera: THREE.Camera): void {
    if (!this.terrain || !this.brushPreview) return

    this.raycaster.setFromCamera(this.mouse, camera)
    const intersects = this.raycaster.intersectObject(this.terrain)
    
    if (intersects.length > 0) {
      const intersect = intersects[0]
      this.brushPreview.position.copy(intersect.point)
      this.brushPreview.position.y += 0.1 // Slightly above terrain
      this.brushPreview.visible = true
    } else {
      this.brushPreview.visible = false
    }
  }

  private setFlattenHeight(camera: THREE.Camera): void {
    if (!this.terrain || !this.heightData) return

    this.raycaster.setFromCamera(this.mouse, camera)
    const intersects = this.raycaster.intersectObject(this.terrain)
    
    if (intersects.length === 0) return

    const intersect = intersects[0]
    const worldPosition = intersect.point

    // Convert world position to heightmap coordinates
    const halfSize = this.terrainSize / 2
    const hmapX = Math.floor(((worldPosition.x + halfSize) / this.terrainSize) * this.resolution)
    const hmapZ = Math.floor(((worldPosition.z + halfSize) / this.terrainSize) * this.resolution)

    // Clamp coordinates
    const clampedX = Math.max(0, Math.min(this.resolution - 1, hmapX))
    const clampedZ = Math.max(0, Math.min(this.resolution - 1, hmapZ))
    
    // Set flatten height to the height at the center point where the mouse clicked
    const index = clampedZ * this.resolution + clampedX
    this.flattenHeight = this.heightData[index]
  }

  private applyBrush(camera: THREE.Camera): void {
    if (!this.terrain || !this.heightData) return

    this.raycaster.setFromCamera(this.mouse, camera)
    const intersects = this.raycaster.intersectObject(this.terrain)
    
    if (intersects.length === 0) return

    const intersect = intersects[0]
    const worldPosition = intersect.point

    // Convert world position to heightmap coordinates
    const halfSize = this.terrainSize / 2
    const hmapX = Math.floor(((worldPosition.x + halfSize) / this.terrainSize) * this.resolution)
    const hmapZ = Math.floor(((worldPosition.z + halfSize) / this.terrainSize) * this.resolution)

    // Apply brush effect
    this.modifyHeightmap(hmapX, hmapZ)
    this.updateTerrainMesh()
  }

  private modifyHeightmap(centerX: number, centerZ: number): void {
    if (!this.heightData) return

    const brushRadius = (this.brushSettings.size / this.terrainSize) * this.resolution
    const baseStrength = this.brushSettings.strength * 1.5 // Base strength multiplier

    for (let z = Math.max(0, centerZ - Math.ceil(brushRadius)); 
         z < Math.min(this.resolution, centerZ + Math.ceil(brushRadius)); 
         z++) {
      for (let x = Math.max(0, centerX - Math.ceil(brushRadius)); 
           x < Math.min(this.resolution, centerX + Math.ceil(brushRadius)); 
           x++) {
        
        const distance = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2)
        if (distance > brushRadius) continue

        // Improved falloff with smoother curve
        const normalizedDistance = distance / brushRadius
        const falloff = Math.pow(1 - normalizedDistance, 2.2) // Smooth, more natural falloff
        const effectiveStrength = baseStrength * falloff

        const index = z * this.resolution + x
        const currentHeight = this.heightData[index]

        switch (this.brushSettings.mode) {
          case 'raise':
            this.heightData[index] = currentHeight + effectiveStrength
            break
            
          case 'lower':
            this.heightData[index] = currentHeight - effectiveStrength
            break
            
          case 'smooth':
            const smoothedHeight = this.getSmoothedHeight(x, z)
            this.heightData[index] = this.lerp(currentHeight, smoothedHeight, effectiveStrength * 0.3)
            break
            
          case 'flatten':
            // Move towards the flatten height with improved interpolation
            const heightDiff = this.flattenHeight - currentHeight
            this.heightData[index] = currentHeight + heightDiff * effectiveStrength * 0.4
            break

          case 'mountain':
            if (this.brushSettings.mountainPreset) {
              const mountainHeight = this.generateMountainHeight(x, z, centerX, centerZ, distance, brushRadius)
              // Gentle mountain building with proper scaling
              if (mountainHeight > 0.1) { // Only apply if meaningful height
                const blendFactor = effectiveStrength * 0.4 // Reduced blend factor
                const newHeight = currentHeight + mountainHeight * blendFactor
                // Smooth blending - allow small decreases for natural terrain flow
                const heightDifference = newHeight - currentHeight
                if (heightDifference > -2) { // Prevent major lowering, allow minor adjustments
                  this.heightData[index] = newHeight
                } else {
                  this.heightData[index] = currentHeight // Keep original if too much lowering
                }
              }
            }
            break
        }

        // Clamp height values to reasonable bounds
        this.heightData[index] = Math.max(-200, Math.min(800, this.heightData[index]))
      }
    }
  }

  private generateMountainHeight(x: number, z: number, centerX: number, centerZ: number, distance: number, brushRadius: number): number {
    if (!this.brushSettings.mountainPreset) return 0

    const preset = this.brushSettings.mountainPreset
    const normalizedDistance = distance / brushRadius

    // World coordinates for consistent terrain features
    const worldX = (x + centerX * 0.1) * 0.1
    const worldZ = (z + centerZ * 0.1) * 0.1

    // === GEOLOGICAL LAYER SYSTEM ===
    
    // 1. BASE ELEVATION - Foundation layer
    const baseElevation = this.generateBaseElevation(worldX, worldZ, preset)
    
    // 2. RIDGE NETWORK - Primary structural features
    const ridgeSystem = this.generateRidgeNetwork(worldX, worldZ, preset, normalizedDistance)
    
    // 3. SECONDARY FEATURES - Peaks, valleys, plateaus
    const secondaryFeatures = this.generateSecondaryFeatures(worldX, worldZ, preset, normalizedDistance)
    
    // 4. EROSION AND WEATHERING - Natural breakdown patterns
    const erosionEffects = this.generateErosionPatterns(worldX, worldZ, preset, normalizedDistance)
    
    // === MOUNTAIN TYPE SPECIFIC ASSEMBLY ===
    let finalHeight = 0

    if (preset.type === 'alpine') {
      // Alpine: Dramatic ridges, sharp peaks, steep faces
      finalHeight = baseElevation * 0.6 + ridgeSystem * 1.2 + secondaryFeatures * 0.8
      
      // Alpine sharpening - create knife-edge ridges
      const sharpening = Math.pow(finalHeight / (preset.strength * 40), 1 / preset.ridgeSharpness)
      finalHeight = sharpening * preset.strength * 40
      
      // Add alpine-specific features
      finalHeight += this.generateAlpineFeatures(worldX, worldZ, preset, normalizedDistance)
      
      // Apply minimal erosion (alpine mountains are young/active)
      finalHeight -= erosionEffects * 0.3
      
    } else if (preset.type === 'desert') {
      // Desert: Mesas, canyons, stratified layers, heavy erosion
      finalHeight = baseElevation * 0.8 + ridgeSystem * 0.6 + secondaryFeatures * 1.0
      
      // Apply plateau formation and stratification
      finalHeight = this.createMesaFormations(finalHeight, worldX, worldZ, preset)
      
      // Add desert-specific features
      finalHeight += this.generateDesertFeatures(worldX, worldZ, preset, normalizedDistance)
      
      // Apply heavy erosion (desert mountains are old/weathered)
      finalHeight -= erosionEffects * 0.8
      
      // Create canyon systems
      finalHeight = this.carveCanyonSystems(finalHeight, worldX, worldZ, preset, normalizedDistance)
    }

    // Ensure minimum height and natural falloff
    return this.applyAdvancedFalloff(finalHeight, normalizedDistance, worldX, worldZ, preset)
  }

  private generateBaseElevation(worldX: number, worldZ: number, preset: MountainPreset): number {
    // Multi-octave noise for realistic base terrain
    let elevation = 0
    let amplitude = preset.strength * 25
    let frequency = preset.frequency
    let maxValue = 0

    for (let i = 0; i < preset.octaves; i++) {
      const noiseX = worldX * frequency
      const noiseZ = worldZ * frequency
      
      // Improved noise function using multiple sine/cosine combinations
      const n1 = Math.sin(noiseX * Math.PI * 2.1) * Math.cos(noiseZ * Math.PI * 1.7)
      const n2 = Math.sin(noiseX * Math.PI * 1.3) * Math.cos(noiseZ * Math.PI * 2.3)
      const n3 = Math.sin(noiseX * Math.PI * 3.7) * Math.cos(noiseZ * Math.PI * 0.9)
      
      const noise = (n1 + n2 * 0.7 + n3 * 0.4) / 2.1
      
      elevation += Math.abs(noise) * amplitude
      maxValue += amplitude
      amplitude *= preset.persistence
      frequency *= 2.2
    }

    return (elevation / maxValue) * preset.strength * 30
  }

  private generateRidgeNetwork(worldX: number, worldZ: number, preset: MountainPreset, normalizedDistance: number): number {
    // Create interconnected ridge systems
    const ridge1 = Math.sin(worldX * 1.2) * Math.cos(worldZ * 0.8)
    const ridge2 = Math.cos(worldX * 0.9) * Math.sin(worldZ * 1.1)
    const ridge3 = Math.sin(worldX * 1.7 + worldZ * 0.6) * Math.cos(worldX * 0.5 + worldZ * 1.3)
    
    // Combine ridges with varying strengths
    const primaryRidge = Math.abs(ridge1 + ridge2 * 0.6) * 20
    const secondaryRidge = Math.abs(ridge3) * 12
    
    // Ridge intensity falls off with distance but creates natural networks
    const ridgeIntensity = 1 - normalizedDistance * 0.4
    
    return (primaryRidge + secondaryRidge) * ridgeIntensity
  }

  private generateSecondaryFeatures(worldX: number, worldZ: number, preset: MountainPreset, normalizedDistance: number): number {
    // Peak clusters and valley systems
    const peakNoise = Math.sin(worldX * 2.3) * Math.cos(worldZ * 1.9)
    const valleyNoise = Math.cos(worldX * 1.6) * Math.sin(worldZ * 2.1)
    
    // Create peak emphasis in certain areas
    let features = 0
    if (Math.abs(peakNoise) > 0.4) {
      features += Math.abs(peakNoise) * 15 * (1 - normalizedDistance * 0.5)
    }
    
    // Create valley depressions
    if (Math.abs(valleyNoise) > 0.5) {
      features -= Math.abs(valleyNoise) * 8 * (1 - normalizedDistance * 0.3)
    }
    
    return features
  }

  private generateErosionPatterns(worldX: number, worldZ: number, preset: MountainPreset, normalizedDistance: number): number {
    // Simulate natural erosion patterns
    const waterErosion = Math.sin(worldX * 3.1) * Math.cos(worldZ * 2.7) * 6
    const windErosion = Math.cos(worldX * 4.2) * Math.sin(worldZ * 3.8) * 4
    const weathering = Math.sin(worldX * 5.5 + worldZ * 4.1) * 3
    
    return Math.abs(waterErosion + windErosion + weathering) * (1 - normalizedDistance * 0.6)
  }

  private generateAlpineFeatures(worldX: number, worldZ: number, preset: MountainPreset, normalizedDistance: number): number {
    let alpineFeatures = 0
    
    // Cirques and glacial valleys
    const cirquePattern = Math.sin(worldX * 1.8) * Math.cos(worldZ * 1.5)
    if (Math.abs(cirquePattern) > 0.6) {
      alpineFeatures += Math.abs(cirquePattern) * 12 * (1 - normalizedDistance * 0.4)
    }
    
    // Arêtes (sharp ridges between cirques)
    const aretePattern = Math.abs(Math.sin(worldX * 2.4) + Math.cos(worldZ * 2.1))
    if (aretePattern > 1.3) {
      alpineFeatures += (aretePattern - 1.3) * 18 * (1 - normalizedDistance * 0.3)
    }
    
    // Horns (pyramid peaks)
    const hornPattern = Math.sin(worldX * 1.1) * Math.cos(worldZ * 1.3) * Math.sin(worldX * 2.9)
    if (Math.abs(hornPattern) > 0.7) {
      alpineFeatures += Math.abs(hornPattern) * 25 * (1 - normalizedDistance * 0.2)
    }
    
    return alpineFeatures
  }

  private generateDesertFeatures(worldX: number, worldZ: number, preset: MountainPreset, normalizedDistance: number): number {
    let desertFeatures = 0
    
    // Buttes and spires
    const buttePattern = Math.sin(worldX * 3.2) * Math.cos(worldZ * 2.8)
    if (Math.abs(buttePattern) > 0.8) {
      desertFeatures += Math.abs(buttePattern) * 16 * (1 - normalizedDistance * 0.5)
    }
    
    // Hoodoos (rock pillars)
    const hoodooPattern = Math.sin(worldX * 6.1) * Math.cos(worldZ * 5.7)
    if (Math.abs(hoodooPattern) > 0.9) {
      desertFeatures += Math.abs(hoodooPattern) * 8 * (1 - normalizedDistance * 0.7)
    }
    
    return desertFeatures
  }

  private createMesaFormations(height: number, worldX: number, worldZ: number, preset: MountainPreset): number {
    // Create stepped mesa formations with natural variation
    const stepSize = preset.strength * 12
    const steps = Math.floor(height / stepSize)
    
    if (steps > 0) {
      const baseHeight = steps * stepSize
      const capHeight = (height - baseHeight) * 0.3 // Reduce cap rock height
      
      // Add natural variation to mesa edges
      const edgeVariation = Math.sin(worldX * 4.5) * Math.cos(worldZ * 3.9) * 2
      
      return baseHeight + capHeight + edgeVariation
    }
    
    return height
  }

  private carveCanyonSystems(height: number, worldX: number, worldZ: number, preset: MountainPreset, normalizedDistance: number): number {
    // Create realistic canyon systems
    const canyonX = Math.sin(worldX * 0.7) * Math.cos(worldZ * 0.5)
    const canyonZ = Math.cos(worldX * 0.5) * Math.sin(worldZ * 0.8)
    
    // Main canyon channel
    const mainCanyon = Math.abs(canyonX + canyonZ * 0.7)
    
    // Tributary canyons
    const tributary1 = Math.abs(Math.sin(worldX * 1.2) * Math.cos(worldZ * 0.9))
    const tributary2 = Math.abs(Math.cos(worldX * 0.8) * Math.sin(worldZ * 1.4))
    
    // Canyon depth varies with terrain height and distance
    const canyonDepth = (mainCanyon * 0.4 + tributary1 * 0.2 + tributary2 * 0.2) * height * 0.3
    
    // Only carve canyons in specific patterns
    const canyonPattern = Math.sin(worldX * 1.1) * Math.cos(worldZ * 0.9)
    if (Math.abs(canyonPattern) > 0.3) {
      return Math.max(height - canyonDepth, height * 0.4)
    }
    
    return height
  }

  private applyAdvancedFalloff(height: number, normalizedDistance: number, worldX: number, worldZ: number, preset: MountainPreset): number {
    // Natural mountain base falloff with geological variation
    let falloff = 1 - normalizedDistance
    falloff = Math.pow(falloff, 1.3) // More realistic mountain slope
    
    // Add natural irregularity to mountain edges
    const edgeVariation = Math.sin(worldX * 2.8) * Math.cos(worldZ * 3.1) * 0.1
    falloff += edgeVariation * (1 - normalizedDistance)
    falloff = Math.max(0, Math.min(1, falloff))
    
    // Apply foothills effect - gradual elevation change
    const foothillsFactor = Math.max(0.1, falloff)
    
    // Ensure positive height with natural minimum
    const finalHeight = Math.max(height * falloff, height * foothillsFactor * 0.1)
    
    // Scale to appropriate size for terrain
    return Math.max(0, finalHeight * 0.8) // Overall scaling factor
  }

  private getSmoothedHeight(x: number, z: number): number {
    if (!this.heightData) return 0

    let totalHeight = 0
    let totalWeight = 0

    // Sample a 5x5 neighborhood with gaussian-like weighting
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx
        const nz = z + dz
        
        if (nx >= 0 && nx < this.resolution && nz >= 0 && nz < this.resolution) {
          const distance = Math.sqrt(dx * dx + dz * dz)
          const weight = Math.exp(-distance * distance * 0.3) // Gaussian-like weight
          
          totalHeight += this.heightData[nz * this.resolution + nx] * weight
          totalWeight += weight
        }
      }
    }

    return totalWeight > 0 ? totalHeight / totalWeight : this.heightData[z * this.resolution + x]
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t))
  }

  private updateTerrainMesh(): void {
    if (!this.terrain || !this.heightData) return

    const geometry = this.terrain.geometry as THREE.PlaneGeometry
    const vertices = geometry.attributes.position.array as Float32Array

    // Update vertex heights (Z coordinate before rotation)
    for (let i = 0; i < this.heightData.length; i++) {
      vertices[i * 3 + 2] = this.heightData[i]
    }

    this.updateTerrainColors()

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
    geometry.computeVertexNormals()
  }

  public updateTerrainColors(): void {
    if (!this.terrain || !this.heightData) return

    const geometry = this.terrain.geometry as THREE.PlaneGeometry
    
    // Update vertex colors based on new heights
    const colors = geometry.attributes.color.array as Float32Array
    const minHeight = Math.min(...this.heightData)
    const maxHeight = Math.max(...this.heightData)
    
    for (let i = 0; i < this.heightData.length; i++) {
      const normalizedHeight = maxHeight > minHeight ? 
        (this.heightData[i] - minHeight) / (maxHeight - minHeight) : 0.5
      const grayValue = normalizedHeight * 0.8 + 0.2 // Range from 0.2 to 1.0
      
      colors[i * 3] = grayValue     // R
      colors[i * 3 + 1] = grayValue // G
      colors[i * 3 + 2] = grayValue // B
    }

    geometry.attributes.color.needsUpdate = true
  }

  public update(camera: THREE.Camera): void {
    // Update brush preview if active but not brushing
    if (this.isActive && !this.isMouseDown) {
      this.updateBrushPreview(camera)
    }
  }
} 