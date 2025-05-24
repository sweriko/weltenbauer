import * as THREE from 'three'
import { OrbitControls } from 'three-stdlib'
import { TerrainGenerator } from './TerrainGenerator'
import { AdvancedTerrainGenerator, TerrainType } from './AdvancedTerrainGenerator'
import { TerrainPresets } from './TerrainPresets'
import { BrushSystem } from './BrushSystem'
import { ErosionSystem, ErosionConfig } from './ErosionSystem'
import { AdvancedErosionSystem, AdvancedErosionConfig } from './AdvancedErosionSystem'

export interface TerrainConfig {
  size: number // Size in kilometers
  resolution: number // Vertices per side
  seed: number
  // New terrain controls
  heightScale: number
  mountainIntensity: number
  valleyDepth: number
  terrainType: TerrainType
  // Advanced mode settings
  advancedMode: boolean
  presetName?: string
}

export type EditorMode = 'orbit' | 'brush'

export class TerrainBuilder {
  private canvas: HTMLCanvasElement
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  
  private terrain: THREE.Mesh | null = null
  private terrainGenerator: TerrainGenerator
  private advancedTerrainGenerator: AdvancedTerrainGenerator
  private brushSystem: BrushSystem
  private erosionSystem: ErosionSystem
  private advancedErosionSystem: AdvancedErosionSystem
  private gridHelper: THREE.GridHelper | null = null
  
  private mode: EditorMode = 'orbit'
  private noisePreviewCanvas: HTMLCanvasElement
  
  private config: TerrainConfig = {
    size: 5, // 5km
    resolution: 256, // Reduced for better performance
    seed: Math.floor(Math.random() * 1000000),
    // New terrain controls
    heightScale: 1.0,
    mountainIntensity: 0.8,
    valleyDepth: 0.5,
    terrainType: TerrainType.CONTINENTAL,
    // Advanced mode settings
    advancedMode: true
  }

  private updateTimeout: number | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(
      75,
      (window.innerWidth - 300) / window.innerHeight,
      0.1,
      10000
    )
    
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    })
    
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.terrainGenerator = new TerrainGenerator(this.config.seed)
    this.advancedTerrainGenerator = new AdvancedTerrainGenerator({
      size: this.config.size,
      resolution: this.config.resolution,
      seed: this.config.seed
    })
    this.brushSystem = new BrushSystem()
    this.erosionSystem = new ErosionSystem()
    this.advancedErosionSystem = new AdvancedErosionSystem()
    
    // Create noise preview canvas
    this.noisePreviewCanvas = this.createNoisePreviewCanvas()
    
    this.init()
  }

  private init(): void {
    // Renderer setup
    this.renderer.setSize(window.innerWidth - 300, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x87CEEB, 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Camera setup
    this.camera.position.set(100, 150, 100)
    this.camera.lookAt(0, 0, 0)

    // Controls setup
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 10
    this.controls.maxDistance = 1000
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1
    this.controls.target.set(0, 0, 0)

    // Scene setup
    this.setupLights()
    this.setupGrid()
    
    // Add Tab key listener for mode switching
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault()
        const currentMode = this.getMode()
        const newMode: EditorMode = currentMode === 'orbit' ? 'brush' : 'orbit'
        this.setMode(newMode)
        
        // Update the mode toggle button if it exists
        const modeToggle = document.getElementById('modeToggle') as HTMLButtonElement
        if (modeToggle) {
          modeToggle.textContent = `Mode: ${newMode.charAt(0).toUpperCase() + newMode.slice(1)}`
          modeToggle.style.background = newMode === 'orbit' ? '#0066cc' : '#cc6600'
        }
      }
    })
    
    // Start render loop
    this.animate()
  }

  private setupLights(): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4)
    this.scene.add(ambientLight)

    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(100, 200, 50)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 500
    directionalLight.shadow.camera.left = -200
    directionalLight.shadow.camera.right = 200
    directionalLight.shadow.camera.top = 200
    directionalLight.shadow.camera.bottom = -200
    this.scene.add(directionalLight)
  }

  private setupGrid(): void {
    const gridHelper = new THREE.GridHelper(
      this.config.size * 1000,
      50,
      0x888888,
      0x444444
    )
    gridHelper.position.y = -0.1
    this.scene.add(gridHelper)
    this.gridHelper = gridHelper
  }

  private createNoisePreviewCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 150
    canvas.height = 150
    canvas.style.position = 'absolute'
    canvas.style.top = '10px'
    canvas.style.left = '10px'
    canvas.style.border = '2px solid #444'
    canvas.style.borderRadius = '8px'
    canvas.style.zIndex = '1000'
    canvas.style.background = '#222'
    
    document.body.appendChild(canvas)
    return canvas
  }

  private updateNoisePreview(): void {
    const ctx = this.noisePreviewCanvas.getContext('2d')!
    const imageData = ctx.createImageData(150, 150)
    const data = imageData.data

    // If we have terrain data, sample from it directly for accurate preview
    if (this.terrain && this.brushSystem.getHeightData) {
      const heightData = this.brushSystem.getHeightData()
      const sourceRes = this.config.resolution
      const scale = sourceRes / 150
      
      // Find min/max for proper normalization
      let min = Infinity
      let max = -Infinity
      for (let i = 0; i < heightData.length; i++) {
        min = Math.min(min, heightData[i])
        max = Math.max(max, heightData[i])
      }
      const range = max - min
      
      for (let y = 0; y < 150; y++) {
        for (let x = 0; x < 150; x++) {
          const sourceX = Math.min(sourceRes - 1, Math.floor(x * scale))
          const sourceY = Math.min(sourceRes - 1, Math.floor(y * scale))
          const sourceIndex = sourceY * sourceRes + sourceX
          
          const height = heightData[sourceIndex] || 0
          
          // Normalize height for display
          const normalized = range > 0 ? (height - min) / range : 0.5
          const value = Math.floor(Math.max(0, Math.min(1, normalized)) * 255)
          
          const index = (y * 150 + x) * 4
          data[index] = value
          data[index + 1] = value
          data[index + 2] = value
          data[index + 3] = 255
        }
      }
    } else {
      // Simple fallback preview
      for (let y = 0; y < 150; y++) {
        for (let x = 0; x < 150; x++) {
          const value = Math.floor(Math.random() * 128 + 64) // Random gray pattern
          const index = (y * 150 + x) * 4
          data[index] = value
          data[index + 1] = value
          data[index + 2] = value
          data[index + 3] = 255
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0)
  }

  public generateTerrain(): void {
    // Remove existing terrain with proper cleanup
    if (this.terrain) {
      this.scene.remove(this.terrain)
      
      // Dispose geometry
      if (this.terrain.geometry) {
        this.terrain.geometry.dispose()
      }
      
      // Dispose materials
      if (Array.isArray(this.terrain.material)) {
        this.terrain.material.forEach((mat: THREE.Material) => mat.dispose())
      } else if (this.terrain.material) {
        (this.terrain.material as THREE.Material).dispose()
      }
      
      this.terrain = null
    }

    let heightData: Float32Array

    if (this.config.advancedMode) {
      // Use advanced terrain generator
      this.advancedTerrainGenerator.updateConfig({
        size: this.config.size,
        resolution: this.config.resolution,
        seed: this.config.seed,
        heightScale: this.config.heightScale,
        mountainIntensity: this.config.mountainIntensity,
        valleyDepth: this.config.valleyDepth
      })
      
      // Apply preset if specified
      if (this.config.presetName) {
        const preset = TerrainPresets.getPreset(this.config.presetName)
        if (preset) {
          this.advancedTerrainGenerator.updateConfig(preset)
        }
      }
      
      heightData = this.advancedTerrainGenerator.generateTerrain(this.config.terrainType)
    } else {
      // Basic mode not supported anymore - use advanced with default settings
      heightData = this.advancedTerrainGenerator.generateTerrain(this.config.terrainType)
    }

    // Create terrain geometry
    const geometry = new THREE.PlaneGeometry(
      this.config.size * 1000,
      this.config.size * 1000,
      this.config.resolution - 1,
      this.config.resolution - 1
    )

    // Apply height data to vertices
    const vertices = geometry.attributes.position.array as Float32Array
    for (let i = 0; i < heightData.length; i++) {
      vertices[i * 3 + 2] = heightData[i] // Z coordinate (height)
    }

    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()

    // Create vertex colors for height-based terrain splatting
    const colors = new Float32Array(vertices.length)
    const minHeight = Math.min(...heightData)
    const maxHeight = Math.max(...heightData)
    
    for (let i = 0; i < heightData.length; i++) {
      const normalizedHeight = (heightData[i] - minHeight) / (maxHeight - minHeight)
      const color = this.calculateTerrainColor(normalizedHeight, heightData[i])
      
      colors[i * 3] = color.r     // R
      colors[i * 3 + 1] = color.g // G
      colors[i * 3 + 2] = color.b // B
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // Create material with vertex colors
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      wireframe: false
    })

    // Create mesh
    this.terrain = new THREE.Mesh(geometry, material)
    this.terrain.rotation.x = -Math.PI / 2
    
    // Center the terrain properly relative to the grid
    // Calculate the average height to center the terrain vertically
    const avgHeight = heightData.reduce((sum, h) => sum + h, 0) / heightData.length
    this.terrain.position.y = -avgHeight * 0.5 // Center terrain around average height
    
    this.terrain.receiveShadow = true
    this.scene.add(this.terrain)

    // Update grid position to align with terrain center
    if (this.gridHelper) {
      this.gridHelper.position.y = -avgHeight * 0.5 - 0.1 // Slightly below terrain center
    }

    // Update brush system
    this.brushSystem.setTerrain(this.terrain, heightData, this.config.resolution)
    
    // Force initial color update in brush system
    this.brushSystem.updateTerrainColors()
    
    // Update noise preview to match current mode
    this.updateNoisePreview()
  }

  public setMode(mode: EditorMode): void {
    this.mode = mode
    this.controls.enabled = mode === 'orbit'
    
    if (mode === 'orbit') {
      this.canvas.style.cursor = 'grab'
      this.brushSystem.setActive(false)
    } else {
      this.canvas.style.cursor = 'crosshair'
      this.brushSystem.setActive(true)
    }
  }

  public getMode(): EditorMode {
    return this.mode
  }

  public updateConfig(newConfig: Partial<TerrainConfig>): void {
    // Update config immediately for UI responsiveness
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...newConfig }
    
    // Update seeds if changed
    if (newConfig.seed !== undefined && newConfig.seed !== oldConfig.seed) {
      this.terrainGenerator.setSeed(newConfig.seed)
      this.advancedTerrainGenerator.setSeed(newConfig.seed)
    }
    
    // Clear existing timeout
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
    }
    
    // Debounce terrain regeneration to avoid excessive updates
    this.updateTimeout = setTimeout(() => {
      try {
        this.generateTerrain()
      } catch (error) {
        console.error('Error generating terrain:', error)
        // Revert to old config on error
        this.config = oldConfig
      } finally {
        this.updateTimeout = null
      }
    }, 100) // Reduced to 100ms for more responsive updates
  }

  public getConfig(): TerrainConfig {
    return { ...this.config }
  }

  public getBrushSystem(): BrushSystem {
    return this.brushSystem
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  public resize(): void {
    const width = window.innerWidth - 300
    const height = window.innerHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  public exportHeightmap(): string {
    return this.terrainGenerator.exportHeightmapAsImage(
      this.brushSystem.getHeightData(),
      this.config.resolution
    )
  }

  public exportProject(): string {
    const projectData = {
      config: this.config,
      heightData: Array.from(this.brushSystem.getHeightData()),
      seed: this.terrainGenerator.getSeed(),
      timestamp: Date.now(),
      version: '1.0.0'
    }
    return JSON.stringify(projectData, null, 2)
  }

  public randomizeSeed(): void {
    this.config.seed = Math.floor(Math.random() * 1000000)
    this.terrainGenerator.setSeed(this.config.seed)
    this.advancedTerrainGenerator.setSeed(this.config.seed)
    this.generateTerrain()
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate)
    
    this.controls.update()
    this.brushSystem.update(this.camera)
    
    this.renderer.render(this.scene, this.camera)
  }

  public dispose(): void {
    // Clear any pending update timeouts
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
      this.updateTimeout = null
    }
    
    // Clean up terrain
    if (this.terrain) {
      this.scene.remove(this.terrain)
      if (this.terrain.geometry) {
        this.terrain.geometry.dispose()
      }
      if (Array.isArray(this.terrain.material)) {
        this.terrain.material.forEach((mat: THREE.Material) => mat.dispose())
      } else if (this.terrain.material) {
        (this.terrain.material as THREE.Material).dispose()
      }
    }
    
    // Clean up preview canvas
    if (this.noisePreviewCanvas && this.noisePreviewCanvas.parentNode) {
      document.body.removeChild(this.noisePreviewCanvas)
    }
    
    this.controls.dispose()
  }

  public toggleGrid(visible?: boolean): void {
    if (this.gridHelper) {
      this.gridHelper.visible = visible !== undefined ? visible : !this.gridHelper.visible
    }
  }

  public isGridVisible(): boolean {
    return this.gridHelper ? this.gridHelper.visible : false
  }

  // Erosion System Methods
  public applyErosion(erosionConfig?: Partial<ErosionConfig>): void {
    if (!this.terrain) {
      console.warn('No terrain available for erosion')
      return
    }

    // Update erosion config if provided
    if (erosionConfig) {
      this.erosionSystem.updateConfig(erosionConfig)
    }

    // Get current height data from brush system
    const currentHeightData = this.brushSystem.getHeightData()
    
    // Apply erosion
    this.erosionSystem.setHeightData(currentHeightData, this.config.resolution)
    const erodedHeightData = this.erosionSystem.applyErosion()
    
    // Update terrain with eroded data
    this.updateTerrainGeometry(erodedHeightData)
    
    // Update brush system with new height data
    this.brushSystem.setTerrain(this.terrain!, erodedHeightData, this.config.resolution)
    this.brushSystem.updateTerrainColors()
  }

  public getErosionSystem(): ErosionSystem {
    return this.erosionSystem
  }

  public updateErosionConfig(config: Partial<ErosionConfig>): void {
    this.erosionSystem.updateConfig(config)
  }

  public getErosionConfig(): ErosionConfig {
    return this.erosionSystem.getConfig()
  }

  public createRiver(startX: number, startY: number, endX: number, endY: number): void {
    if (!this.terrain) {
      console.warn('No terrain available for river creation')
      return
    }

    // Convert world coordinates to grid coordinates
    const gridStartX = ((startX / (this.config.size * 1000)) + 0.5) * this.config.resolution
    const gridStartY = ((startY / (this.config.size * 1000)) + 0.5) * this.config.resolution
    const gridEndX = ((endX / (this.config.size * 1000)) + 0.5) * this.config.resolution
    const gridEndY = ((endY / (this.config.size * 1000)) + 0.5) * this.config.resolution

    // Apply river erosion
    const currentHeightData = this.brushSystem.getHeightData()
    this.erosionSystem.setHeightData(currentHeightData, this.config.resolution)
    this.erosionSystem.createRiverErosion(gridStartX, gridStartY, gridEndX, gridEndY)
    
    // Get updated height data and update terrain
    const erodedHeightData = this.erosionSystem.applyErosion()
    this.updateTerrainGeometry(erodedHeightData)
    
    // Update brush system
    this.brushSystem.setTerrain(this.terrain!, erodedHeightData, this.config.resolution)
    this.brushSystem.updateTerrainColors()
  }

  public getWaterFlowVisualization(): Float32Array {
    return this.erosionSystem.getWaterFlow()
  }

  public getSedimentVisualization(): Float32Array {
    return this.erosionSystem.getSedimentMap()
  }

  private updateTerrainGeometry(heightData: Float32Array): void {
    if (!this.terrain) return

    const geometry = this.terrain.geometry as THREE.PlaneGeometry
    const vertices = geometry.attributes.position.array as Float32Array

    // Update vertex heights
    for (let i = 0; i < heightData.length; i++) {
      vertices[i * 3 + 2] = heightData[i] // Z coordinate (height)
    }

    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()

    // Update vertex colors based on new heights
    const colors = geometry.attributes.color.array as Float32Array
    const minHeight = Math.min(...heightData)
    const maxHeight = Math.max(...heightData)
    
    for (let i = 0; i < heightData.length; i++) {
      const normalizedHeight = (heightData[i] - minHeight) / (maxHeight - minHeight)
      const color = this.calculateTerrainColor(normalizedHeight, heightData[i])
      
      colors[i * 3] = color.r     // R
      colors[i * 3 + 1] = color.g // G
      colors[i * 3 + 2] = color.b // B
    }
    
    geometry.attributes.color.needsUpdate = true
  }

  // Preset erosion configurations
  public applyGentleErosion(): void {
    this.applyErosion({
      rainStrength: 0.01,
      erosionStrength: 0.1,
      iterations: 50,
      thermalRate: 0.05
    })
  }

  public applyModerateErosion(): void {
    this.applyErosion({
      rainStrength: 0.02,
      erosionStrength: 0.3,
      iterations: 100,
      thermalRate: 0.1
    })
  }

  public applyIntenseErosion(): void {
    this.applyErosion({
      rainStrength: 0.04,
      erosionStrength: 0.5,
      iterations: 200,
      thermalRate: 0.2
    })
  }

  public applyDesertErosion(): void {
    this.applyErosion({
      rainStrength: 0.005,
      erosionStrength: 0.1,
      thermalRate: 0.3,
      angleOfRepose: 45,
      iterations: 150
    })
  }

  public applyTropicalErosion(): void {
    this.applyErosion({
      rainStrength: 0.06,
      erosionStrength: 0.4,
      vegetationProtection: true,
      riverbedErosion: 2.0,
      iterations: 120
    })
  }

  // Advanced Erosion System Methods - Ultra Realistic Geomorphology
  public applyAdvancedErosion(config?: Partial<AdvancedErosionConfig>): void {
    if (!this.terrain) {
      console.warn('No terrain available for advanced erosion')
      return
    }

    // Update config if provided
    if (config) {
      this.advancedErosionSystem.updateConfig(config)
    }

    // Get current height data
    const currentHeightData = this.brushSystem.getHeightData()
    
    // Apply advanced geomorphological erosion
    this.advancedErosionSystem.setHeightData(currentHeightData, this.config.resolution, this.config.size * 1000)
    const erodedHeightData = this.advancedErosionSystem.applyAdvancedErosion()
    
    // Update terrain with eroded data
    this.updateTerrainGeometry(erodedHeightData)
    
    // Update brush system with new height data
    this.brushSystem.setTerrain(this.terrain!, erodedHeightData, this.config.resolution)
    this.brushSystem.updateTerrainColors()
  }

  public getAdvancedErosionSystem(): AdvancedErosionSystem {
    return this.advancedErosionSystem
  }

  public updateAdvancedErosionConfig(config: Partial<AdvancedErosionConfig>): void {
    this.advancedErosionSystem.updateConfig(config)
  }

  public getAdvancedErosionConfig(): AdvancedErosionConfig {
    return this.advancedErosionSystem.getConfig()
  }

  // Realistic geological preset erosions
  public applyRealisticMountainEvolution(): void {
    this.applyAdvancedErosion({
      streamPowerLaw: {
        incisionConstant: 2e-6,
        areaExponent: 0.5,
        slopeExponent: 1.0,
        criticalDrainage: 500
      },
      tectonics: {
        upliftRate: 0.5, // active mountain building
        upliftPattern: 'dome',
        faultLines: []
      },
      climate: {
        precipitation: 1500,
        temperature: 5, // alpine climate
        vegetationCover: 0.3,
        seasonality: 0.3
      },
      advanced: {
        enableMeandering: false, // mountains don't have large meandering rivers
        enableMassWasting: true,
        enableGlacialErosion: false,
        enableChemicalWeathering: true,
        enableKnickpointMigration: true,
        timeStep: 50,
        totalTime: 50000 // 50,000 years of evolution
      }
    })
  }

  public applyRealisticRiverSystemEvolution(): void {
    this.applyAdvancedErosion({
      streamPowerLaw: {
        incisionConstant: 1e-6,
        areaExponent: 0.5,
        slopeExponent: 1.0,
        criticalDrainage: 1000
      },
      tectonics: {
        upliftRate: 0.1, // slow, stable region
        upliftPattern: 'uniform',
        faultLines: []
      },
      climate: {
        precipitation: 1200,
        temperature: 15,
        vegetationCover: 0.7,
        seasonality: 0.2
      },
      advanced: {
        enableMeandering: true,
        enableMassWasting: false,
        enableGlacialErosion: false,
        enableChemicalWeathering: true,
        enableKnickpointMigration: true,
        timeStep: 100,
        totalTime: 100000 // 100,000 years - longer for river development
      }
    })
  }

  public applyRealisticDesertEvolution(): void {
    this.applyAdvancedErosion({
      streamPowerLaw: {
        incisionConstant: 0.5e-6, // limited water erosion
        areaExponent: 0.4,
        slopeExponent: 1.2,
        criticalDrainage: 2000 // larger drainage required for channels
      },
      diffusion: {
        soilDiffusivity: 0.005, // limited soil
        thermalDiffusivity: 0.002, // more thermal erosion
        criticalSlope: 45 * Math.PI / 180 // steeper stable slopes
      },
      tectonics: {
        upliftRate: 0.05, // very slow
        upliftPattern: 'uniform',
        faultLines: []
      },
      climate: {
        precipitation: 200, // arid
        temperature: 25,
        vegetationCover: 0.1,
        seasonality: 0.4 // high seasonality in desert
      },
      advanced: {
        enableMeandering: false,
        enableMassWasting: true,
        enableGlacialErosion: false,
        enableChemicalWeathering: false, // limited chemical weathering
        enableKnickpointMigration: false,
        timeStep: 200,
        totalTime: 200000 // long-term arid evolution
      }
    })
  }

  public applyRealisticCoastalEvolution(): void {
    this.applyAdvancedErosion({
      streamPowerLaw: {
        incisionConstant: 3e-6, // strong marine erosion
        areaExponent: 0.6,
        slopeExponent: 0.8,
        criticalDrainage: 200
      },
      tectonics: {
        upliftRate: 0.2,
        upliftPattern: 'ridge', // coastal range
        faultLines: []
      },
      climate: {
        precipitation: 2000, // wet maritime climate
        temperature: 12,
        vegetationCover: 0.8,
        seasonality: 0.1 // low seasonality in maritime climate
      },
      advanced: {
        enableMeandering: true,
        enableMassWasting: true,
        enableGlacialErosion: false,
        enableChemicalWeathering: true,
        enableKnickpointMigration: true,
        timeStep: 75,
        totalTime: 75000
      }
    })
  }

  public applyRealisticGlacialValleyEvolution(): void {
    this.applyAdvancedErosion({
      streamPowerLaw: {
        incisionConstant: 5e-6, // enhanced by glacial processes
        areaExponent: 0.3, // glacial flow is different
        slopeExponent: 1.5,
        criticalDrainage: 100
      },
      diffusion: {
        soilDiffusivity: 0.02, // freeze-thaw enhanced
        thermalDiffusivity: 0.005,
        criticalSlope: 25 * Math.PI / 180 // glacial oversteepening
      },
      tectonics: {
        upliftRate: 0.3,
        upliftPattern: 'ridge',
        faultLines: []
      },
      climate: {
        precipitation: 1000,
        temperature: -2, // below freezing
        vegetationCover: 0.1,
        seasonality: 0.5 // high seasonal variation
      },
      advanced: {
        enableMeandering: false,
        enableMassWasting: true,
        enableGlacialErosion: true,
        enableChemicalWeathering: false, // limited in cold
        enableKnickpointMigration: false,
        timeStep: 100,
        totalTime: 100000
      }
    })
  }

  // Create realistic fault systems
  public addRealisticFaultSystem(): void {
    const config = this.advancedErosionSystem.getConfig()
    const resolution = this.config.resolution
    
    // Add a major fault line across the terrain
    const majorFault = {
      x1: resolution * 0.1,
      y1: resolution * 0.2,
      x2: resolution * 0.9,
      y2: resolution * 0.8,
      offset: 20 // 20m offset
    }
    
    // Add some secondary faults
    const secondaryFaults = [
      {
        x1: resolution * 0.3,
        y1: resolution * 0.1,
        x2: resolution * 0.7,
        y2: resolution * 0.6,
        offset: -8
      },
      {
        x1: resolution * 0.1,
        y1: resolution * 0.7,
        x2: resolution * 0.4,
        y2: resolution * 0.9,
        offset: 5
      }
    ]
    
    config.tectonics.faultLines = [majorFault, ...secondaryFaults]
    this.advancedErosionSystem.updateConfig(config)
  }

  // Get advanced erosion data for visualization
  public getAdvancedErosionData() {
    return this.advancedErosionSystem.getErosionResults()
  }

  // Create realistic drainage networks
  public generateRealisticDrainageNetwork(): void {
    this.advancedErosionSystem.createRealisticRiverNetwork()
  }

  // Export advanced erosion data
  public exportAdvancedErosionData(): string {
    const results = this.advancedErosionSystem.getErosionResults()
    const exportData = {
      config: this.config,
      erosionConfig: this.advancedErosionSystem.getConfig(),
      elevation: Array.from(results.elevation),
      drainageArea: Array.from(results.drainageArea),
      streamPower: Array.from(results.streamPower),
      sedimentThickness: Array.from(results.sedimentThickness),
      vegetationCover: Array.from(results.vegetationCover),
      timeEvolved: results.timeEvolved,
      riverNetwork: results.riverNetwork,
      knickpoints: results.knickpoints,
      timestamp: Date.now(),
      version: '2.0.0-advanced'
    }
    return JSON.stringify(exportData, null, 2)
  }

  private calculateTerrainColor(normalizedHeight: number, height: number): { r: number, g: number, b: number } {
    // Define terrain height thresholds and colors
    const soilColor = { r: 0.4, g: 0.3, b: 0.15 }    // Brown soil
    const grassColor = { r: 0.3, g: 0.6, b: 0.2 }    // Green grass
    const rockColor = { r: 0.5, g: 0.45, b: 0.4 }    // Gray rock
    const snowColor = { r: 0.9, g: 0.95, b: 1.0 }    // White snow
    
    // Height thresholds (normalized 0-1)
    const grassStart = 0.1   // Grass starts above soil level
    const rockStart = 0.6    // Rock starts at higher elevations
    const snowStart = 0.85   // Snow appears at highest peaks
    
    // Transition smoothness
    const transitionWidth = 0.08
    
    let finalColor = { ...soilColor }
    
    // Soil to Grass transition
    if (normalizedHeight > grassStart - transitionWidth) {
      const grassBlend = this.smoothstep(grassStart - transitionWidth, grassStart + transitionWidth, normalizedHeight)
      finalColor = this.mixColors(soilColor, grassColor, grassBlend)
    }
    
    // Grass to Rock transition
    if (normalizedHeight > rockStart - transitionWidth) {
      const rockBlend = this.smoothstep(rockStart - transitionWidth, rockStart + transitionWidth, normalizedHeight)
      finalColor = this.mixColors(finalColor, rockColor, rockBlend)
    }
    
    // Rock to Snow transition
    if (normalizedHeight > snowStart - transitionWidth) {
      const snowBlend = this.smoothstep(snowStart - transitionWidth, snowStart + transitionWidth, normalizedHeight)
      finalColor = this.mixColors(finalColor, snowColor, snowBlend)
    }
    
    // Add slight height-based lighting variation
    const lightingFactor = 0.85 + normalizedHeight * 0.3
    
    return {
      r: Math.min(1.0, finalColor.r * lightingFactor),
      g: Math.min(1.0, finalColor.g * lightingFactor),
      b: Math.min(1.0, finalColor.b * lightingFactor)
    }
  }
  
  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
  }
  
  private mixColors(
    color1: { r: number, g: number, b: number }, 
    color2: { r: number, g: number, b: number }, 
    factor: number
  ): { r: number, g: number, b: number } {
    return {
      r: color1.r + (color2.r - color1.r) * factor,
      g: color1.g + (color2.g - color1.g) * factor,
      b: color1.b + (color2.b - color1.b) * factor
    }
  }

  // Advanced Terrain Methods
  public setAdvancedMode(advanced: boolean): void {
    this.config.advancedMode = advanced
    this.generateTerrain()
  }

  public isAdvancedMode(): boolean {
    return this.config.advancedMode
  }

  public setTerrainType(type: TerrainType): void {
    this.config.terrainType = type
    if (this.config.advancedMode) {
      this.generateTerrain()
    }
  }

  public getTerrainType(): TerrainType {
    return this.config.terrainType
  }

  public applyPreset(presetName: string): void {
    const preset = TerrainPresets.getPreset(presetName)
    if (preset) {
      this.config.presetName = presetName
      this.config.advancedMode = true
      this.advancedTerrainGenerator.updateConfig(preset)
      this.updateConfig({
        size: preset.size,
        resolution: preset.resolution,
        seed: preset.seed
      })
    }
  }

  public getAvailablePresets(): string[] {
    return TerrainPresets.getPresetNames()
  }

  public getAdvancedTerrainGenerator(): AdvancedTerrainGenerator {
    return this.advancedTerrainGenerator
  }

  public exportAdvancedHeightmap(): string {
    if (this.config.advancedMode && this.terrain) {
      return this.advancedTerrainGenerator.exportHeightmapAsImage(
        this.brushSystem.getHeightData()
      )
    }
    return this.exportHeightmap()
  }
} 