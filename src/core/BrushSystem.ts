import * as THREE from 'three'

export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten'

export interface BrushSettings {
  size: number
  strength: number
  mode: BrushMode
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
    const material = new THREE.MeshBasicMaterial({
      color: 0xff6600,
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
    
    if (settings.size && this.brushPreview) {
      this.brushPreview.geometry.dispose()
      const geometry = new THREE.RingGeometry(0, this.brushSettings.size, 32)
      this.brushPreview.geometry = geometry
    }
  }

  public getBrushSettings(): BrushSettings {
    return { ...this.brushSettings }
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
        }

        // Clamp height values to reasonable bounds
        this.heightData[index] = Math.max(-150, Math.min(300, this.heightData[index]))
      }
    }
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