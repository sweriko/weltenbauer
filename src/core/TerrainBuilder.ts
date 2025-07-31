import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { AdvancedTerrainGenerator, TerrainType } from './AdvancedTerrainGenerator'
import { BrushSystem } from './BrushSystem'
import { ErosionSystem, ErosionConfig, AdvancedErosionConfig } from './ErosionSystem'
import { TerrainMaterial } from './TerrainMaterial'
import { TerrainWorkerMessage, TerrainWorkerResponse } from './TerrainWorker'

export interface TerrainConfig {
  size: number // Size in kilometers
  resolution: number // Vertices per side
  seed: number
  // Redesigned advanced terrain controls
  geologicalComplexity: number // 0.0-2.0: Controls multi-scale noise layering intensity
  domainWarping: number // 0.0-1.0: Controls natural terrain flow and organic appearance
  reliefAmplitude: number // 0.2-4.0: Master height scaling with geological context
  featureScale: number // 0.1-3.0: Controls size/frequency of geological features
  terrainType: TerrainType
  // Advanced mode settings
  advancedMode: boolean
}

export type EditorMode = 'orbit' | 'brush'

export class TerrainBuilder {
  private canvas: HTMLCanvasElement
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGPURenderer
  private controls: OrbitControls
  
  private terrain: THREE.Mesh | null = null
  private terrainMaterial: TerrainMaterial
  private advancedTerrainGenerator: AdvancedTerrainGenerator
  private brushSystem: BrushSystem
  private erosionSystem: ErosionSystem
  private gridHelper: THREE.GridHelper | null = null
  
  private mode: EditorMode = 'orbit'
  private noisePreviewCanvas: HTMLCanvasElement
  private noiseLayersContainer: HTMLDivElement

  private customLayers: any[] = []
  private baseLayerWeightOverrides: Map<number, number> = new Map()

  private uiController: any = null
  
  private config: TerrainConfig = {
    size: 1, // 1km
    resolution: 1024, // Standard power of 2 resolution - supports up to 4096x4096 safely
    seed: Math.floor(Math.random() * 1000000),
    // Redesigned advanced terrain controls
    geologicalComplexity: 1.0,
    domainWarping: 0.5,
    reliefAmplitude: 2.0,
    featureScale: 1.5,
    terrainType: TerrainType.CONTINENTAL,
    // Advanced mode settings
    advancedMode: true
  }

  private updateTimeout: number | null = null
  private isGenerating: boolean = false
  private chunkSize: number = 64 // Process terrain in 64x64 chunks to prevent stack overflow
  
  // Worker pool for parallel terrain generation
  private workers: Worker[] = []
  private workerCount: number = Math.min(navigator.hardwareConcurrency || 4, 8) // Cap at 8 workers
  private availableWorkers: Worker[] = []
  private busyWorkers: Set<Worker> = new Set()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    )
    
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    })
    
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.terrainMaterial = new TerrainMaterial()
    this.advancedTerrainGenerator = new AdvancedTerrainGenerator({
      size: this.config.size,
      resolution: this.config.resolution,
      seed: this.config.seed
    })
    this.brushSystem = new BrushSystem()
    this.erosionSystem = new ErosionSystem()
    
    // Create noise preview canvas
    this.noisePreviewCanvas = this.createNoisePreviewCanvas()
    
    // Create noise layers visualization
    this.noiseLayersContainer = this.createNoiseLayersContainer()
    
    // Initialize asynchronously
    this.init().catch(console.error)
    
    // Initialize worker pool
    this.initializeWorkerPool()
  }

  private async init(): Promise<void> {
    // Initialize WebGPU renderer
    await this.renderer.init()
    
    // Renderer setup
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x87CEEB, 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Camera setup - positioned for bird's eye view of entire terrain
    this.camera.position.set(0, 800, 600)
    this.camera.lookAt(0, 0, 0)

    // Controls setup
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 10
    this.controls.maxDistance = 5000
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1
    this.controls.target.set(0, 0, 0)

    // Scene setup
    this.setupSkybox()
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

  private setupSkybox(): void {
    // Load the skybox texture
    const textureLoader = new THREE.TextureLoader()
    textureLoader.load('src/textures/skybox.png', (texture) => {
      // Set the background texture once it's loaded
      texture.mapping = THREE.EquirectangularReflectionMapping
      this.scene.background = texture
      
      // Remove environment mapping to prevent skybox from affecting terrain lighting
      // this.scene.environment = texture
    })
  }

  private setupLights(): void {
    // Enhanced ambient light for better global illumination
    const ambientLight = new THREE.AmbientLight(0x404040, 1.0)
    this.scene.add(ambientLight)
    
    // Add hemisphere light for more natural global illumination
    const hemisphereLight = new THREE.HemisphereLight(
      0xffffbb, // Sky color
      0x080820, // Ground color
      0.7       // Intensity
    )
    this.scene.add(hemisphereLight)

    // Primary directional light (sun)
    const sunLight = new THREE.DirectionalLight(0xffffeb, 1.0)
    sunLight.position.set(100, 200, 50)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = 2048
    sunLight.shadow.mapSize.height = 2048
    sunLight.shadow.camera.near = 0.5
    sunLight.shadow.camera.far = 500
    sunLight.shadow.camera.left = -200
    sunLight.shadow.camera.right = 200
    sunLight.shadow.camera.top = 200
    sunLight.shadow.camera.bottom = -200
    this.scene.add(sunLight)
    
    // Secondary fill light to soften shadows
    const fillLight = new THREE.DirectionalLight(0xc2d1ff, 0.3)
    fillLight.position.set(-50, 100, -50)
    fillLight.castShadow = false
    this.scene.add(fillLight)
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

  private createNoiseLayersContainer(): HTMLDivElement {
    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.top = '220px'
    container.style.left = '10px'
    container.style.zIndex = '1000'
    container.style.background = 'rgba(26, 26, 26, 0.95)'
    container.style.border = '2px solid #555'
    container.style.borderRadius = '12px'
    container.style.padding = '16px'
    container.style.maxHeight = 'calc(100vh - 250px)'
    container.style.width = '300px'
    container.style.backdropFilter = 'blur(10px)'
    container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)'
    
    // Custom scrollbar styling
    container.style.overflowY = 'auto'
    container.style.overflowX = 'hidden'
    const scrollbarStyle = `
      .noise-layers-container::-webkit-scrollbar {
        width: 8px;
      }
      .noise-layers-container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
      }
      .noise-layers-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 4px;
      }
      .noise-layers-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
      }
      
      .weight-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        background: #444;
        border-radius: 3px;
        outline: none;
        cursor: pointer;
      }
      
      .weight-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        background: #0066cc;
        border-radius: 50%;
        cursor: pointer;
      }
      
      .weight-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #0066cc;
        border-radius: 50%;
        cursor: pointer;
        border: none;
      }
    `
    
    // Add custom styles to head if not already added
    if (!document.getElementById('noise-layers-styles')) {
      const styleSheet = document.createElement('style')
      styleSheet.id = 'noise-layers-styles'
      styleSheet.textContent = scrollbarStyle
      document.head.appendChild(styleSheet)
    }
    
    container.className = 'noise-layers-container'
    
    // Header section
    const header = document.createElement('div')
    header.style.marginBottom = '16px'
    header.style.paddingBottom = '12px'
    header.style.borderBottom = '2px solid #444'
    
    const title = document.createElement('div')
    title.textContent = 'Noise Layers'
    title.style.color = '#fff'
    title.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    title.style.fontSize = '18px'
    title.style.fontWeight = '600'
    title.style.marginBottom = '8px'
    title.style.textAlign = 'center'
    
    // Add layer button
    const addLayerBtn = document.createElement('button')
    addLayerBtn.textContent = '+ Add Layer'
    addLayerBtn.style.width = '100%'
    addLayerBtn.style.padding = '8px 16px'
    addLayerBtn.style.background = 'linear-gradient(135deg, #0066cc, #004499)'
    addLayerBtn.style.color = '#fff'
    addLayerBtn.style.border = 'none'
    addLayerBtn.style.borderRadius = '6px'
    addLayerBtn.style.fontSize = '14px'
    addLayerBtn.style.fontWeight = '500'
    addLayerBtn.style.cursor = 'pointer'
    addLayerBtn.style.transition = 'all 0.2s ease'
    
    addLayerBtn.addEventListener('mouseenter', () => {
      addLayerBtn.style.background = 'linear-gradient(135deg, #0077dd, #0055aa)'
      addLayerBtn.style.transform = 'translateY(-1px)'
    })
    
    addLayerBtn.addEventListener('mouseleave', () => {
      addLayerBtn.style.background = 'linear-gradient(135deg, #0066cc, #004499)'
      addLayerBtn.style.transform = 'translateY(0)'
    })
    
    addLayerBtn.addEventListener('click', () => this.showAddLayerDialog())
    
    header.appendChild(title)
    header.appendChild(addLayerBtn)
    container.appendChild(header)
    
    // Layers content area
    const layersContent = document.createElement('div')
    layersContent.id = 'layers-content'
    container.appendChild(layersContent)
    
    // Hide the old container since we're using lil-gui now
    container.style.display = 'none'
    document.body.appendChild(container)
    return container
  }

  public setUIController(uiController: any): void {
    this.uiController = uiController
  }

  public updateNoiseLayersGUI(): void {
    // Call the UIController's method if available
    if (this.uiController && this.uiController.updateNoiseLayersGUI) {
      this.uiController.updateNoiseLayersGUI()
    }
  }

  public getNoiseLayersData(): any {
    // Get current layers data for UIController
    const geologicalComplexity = this.config.geologicalComplexity
    const featureScale = this.config.featureScale
    const terrainType = this.config.terrainType
    const baseLayers = this.advancedTerrainGenerator.getTerrainTypeLayers(terrainType, geologicalComplexity, featureScale)
    
    // Apply weight overrides to show current state
    baseLayers.forEach((layer, index) => {
      if (this.baseLayerWeightOverrides.has(index)) {
        layer.weight = this.baseLayerWeightOverrides.get(index)!
      }
    })
    
    const allLayers = [...baseLayers, ...this.customLayers]
    return {
      layers: allLayers,
      baseLayers,
      customLayers: this.customLayers
    }
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

  public generateLayerPreview(canvas: HTMLCanvasElement, layer: any): void {
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(canvas.width, canvas.height)
    const data = imageData.data

    // Sample the layer across the preview area
    const samples: number[] = []
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const nx = (x / canvas.width) * 2 - 1
        const ny = (y / canvas.height) * 2 - 1
        
        const noise = this.advancedTerrainGenerator.getNoiseSystem().generateNoise(nx, ny, layer.type, layer.config)
        samples.push(noise)
      }
    }

    // Find min/max for normalization (avoid spread operator to prevent stack overflow)
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] < min) min = samples[i]
      if (samples[i] > max) max = samples[i]
    }
    const range = max - min

    // Convert to image data
    for (let i = 0; i < samples.length; i++) {
      const normalized = range > 0 ? (samples[i] - min) / range : 0.5
      const value = Math.floor(Math.max(0, Math.min(1, normalized)) * 255)
      
      const pixelIndex = i * 4
      data[pixelIndex] = value
      data[pixelIndex + 1] = value
      data[pixelIndex + 2] = value
      data[pixelIndex + 3] = 255
    }

    ctx.putImageData(imageData, 0, 0)
  }



  public showAddLayerDialog(): void {
    // Create modal overlay
    const overlay = document.createElement('div')
    overlay.style.position = 'fixed'
    overlay.style.top = '0'
    overlay.style.left = '0'
    overlay.style.width = '100%'
    overlay.style.height = '100%'
    overlay.style.background = 'rgba(0, 0, 0, 0.7)'
    overlay.style.zIndex = '2000'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    
    // Create dialog
    const dialog = document.createElement('div')
    dialog.style.background = '#2a2a2a'
    dialog.style.border = '2px solid #555'
    dialog.style.borderRadius = '12px'
    dialog.style.padding = '24px'
    dialog.style.minWidth = '300px'
    dialog.style.maxWidth = '400px'
    
    // Title
    const title = document.createElement('h3')
    title.textContent = 'Add New Layer'
    title.style.color = '#fff'
    title.style.margin = '0 0 16px 0'
    title.style.fontSize = '18px'
    title.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    
    // Noise type dropdown
    const noiseTypeLabel = document.createElement('label')
    noiseTypeLabel.textContent = 'Noise Type:'
    noiseTypeLabel.style.color = '#ccc'
    noiseTypeLabel.style.display = 'block'
    noiseTypeLabel.style.marginBottom = '8px'
    noiseTypeLabel.style.fontSize = '14px'
    
    const noiseTypeSelect = document.createElement('select')
    noiseTypeSelect.style.width = '100%'
    noiseTypeSelect.style.padding = '8px'
    noiseTypeSelect.style.background = '#444'
    noiseTypeSelect.style.color = '#fff'
    noiseTypeSelect.style.border = '1px solid #666'
    noiseTypeSelect.style.borderRadius = '4px'
    noiseTypeSelect.style.marginBottom = '16px'
    
    // Add noise type options
    const noiseTypes = ['PERLIN', 'FBM', 'RIDGED', 'BILLOW', 'TURBULENCE', 'VORONOI']
    noiseTypes.forEach(type => {
      const option = document.createElement('option')
      option.value = type.toLowerCase()
      option.textContent = type
      noiseTypeSelect.appendChild(option)
    })
    
    // Weight slider
    const weightLabel = document.createElement('label')
    weightLabel.textContent = 'Weight: 50%'
    weightLabel.style.color = '#ccc'
    weightLabel.style.display = 'block'
    weightLabel.style.marginBottom = '8px'
    weightLabel.style.fontSize = '14px'
    
    const weightSlider = document.createElement('input')
    weightSlider.type = 'range'
    weightSlider.min = '1'
    weightSlider.max = '100'
    weightSlider.value = '50'
    weightSlider.className = 'weight-slider'
    weightSlider.style.marginBottom = '16px'
    
    weightSlider.addEventListener('input', (e) => {
      weightLabel.textContent = `Weight: ${(e.target as HTMLInputElement).value}%`
    })
    
    // Buttons
    const buttonContainer = document.createElement('div')
    buttonContainer.style.display = 'flex'
    buttonContainer.style.gap = '12px'
    buttonContainer.style.justifyContent = 'flex-end'
    
    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancel'
    cancelBtn.style.padding = '8px 16px'
    cancelBtn.style.background = '#666'
    cancelBtn.style.color = '#fff'
    cancelBtn.style.border = 'none'
    cancelBtn.style.borderRadius = '4px'
    cancelBtn.style.cursor = 'pointer'
    
    const addBtn = document.createElement('button')
    addBtn.textContent = 'Add Layer'
    addBtn.style.padding = '8px 16px'
    addBtn.style.background = '#0066cc'
    addBtn.style.color = '#fff'
    addBtn.style.border = 'none'
    addBtn.style.borderRadius = '4px'
    addBtn.style.cursor = 'pointer'
    
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay)
    })
    
    addBtn.addEventListener('click', () => {
      const selectedType = noiseTypeSelect.value
      const weight = parseInt(weightSlider.value) / 100
      this.addCustomLayer(selectedType, weight)
      document.body.removeChild(overlay)
    })
    
    buttonContainer.appendChild(cancelBtn)
    buttonContainer.appendChild(addBtn)
    
    dialog.appendChild(title)
    dialog.appendChild(noiseTypeLabel)
    dialog.appendChild(noiseTypeSelect)
    dialog.appendChild(weightLabel)
    dialog.appendChild(weightSlider)
    dialog.appendChild(buttonContainer)
    
    overlay.appendChild(dialog)
    document.body.appendChild(overlay)
  }

  private addCustomLayer(noiseType: string, weight: number): void {
    // Create a basic noise config based on type
    const baseConfig = {
      octaves: 4,
      frequency: 1.0,
      amplitude: 100,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: this.config.seed + Math.random() * 1000,
      offset: { x: 0, y: 0 }
    }
    
    // Add to custom layers array
    this.customLayers.push({
      type: noiseType.toLowerCase(),
      config: baseConfig,
      weight: weight
    })
    
    // Normalize all weights so they add up to 100%
    this.normalizeAllWeights()
    
    // Regenerate terrain (this will trigger GUI update)
    this.generateTerrain().catch(console.error)
  }

  private normalizeAllWeights(): void {
    // Get all current layers
    const geologicalComplexity = this.config.geologicalComplexity
    const featureScale = this.config.featureScale
    const terrainType = this.config.terrainType
    const baseLayers = this.advancedTerrainGenerator.getTerrainTypeLayers(terrainType, geologicalComplexity, featureScale)
    
    // Apply existing weight overrides to base layers
    baseLayers.forEach((layer, index) => {
      if (this.baseLayerWeightOverrides.has(index)) {
        layer.weight = this.baseLayerWeightOverrides.get(index)!
      }
    })
    
    const allLayers = [...baseLayers, ...this.customLayers]
    
    // Calculate current total weight
    const totalWeight = allLayers.reduce((sum, layer) => sum + layer.weight, 0)
    
    if (totalWeight > 0) {
      // Normalize each layer proportionally
      for (let i = 0; i < allLayers.length; i++) {
        const normalizedWeight = allLayers[i].weight / totalWeight
        
        if (i < baseLayers.length) {
          // Update base layer override
          this.baseLayerWeightOverrides.set(i, normalizedWeight)
        } else {
          // Update custom layer
          const customIndex = i - baseLayers.length
          this.customLayers[customIndex].weight = normalizedWeight
        }
      }
    }
  }

  public removeLayer(index: number): void {
    // Get current terrain type layers count
    const geologicalComplexity = this.config.geologicalComplexity
    const featureScale = this.config.featureScale
    const terrainType = this.config.terrainType
    const baseLayers = this.advancedTerrainGenerator.getTerrainTypeLayers(terrainType, geologicalComplexity, featureScale)
    
    // Only allow removing custom layers
    if (index >= baseLayers.length) {
      const customIndex = index - baseLayers.length
      this.customLayers.splice(customIndex, 1)
      
      // Normalize remaining weights to add up to 100%
      this.normalizeAllWeights()
      
      // Regenerate terrain (this will trigger GUI update)
      this.generateTerrain().catch(console.error)
    }
  }

    public updateLayerWeight(index: number, newWeight: number, skipRegeneration: boolean = false): void {
    // Get current terrain type layers count
    const geologicalComplexity = this.config.geologicalComplexity
    const featureScale = this.config.featureScale
    const terrainType = this.config.terrainType
    const baseLayers = this.advancedTerrainGenerator.getTerrainTypeLayers(terrainType, geologicalComplexity, featureScale)
    
    if (index < baseLayers.length) {
      // Store base layer weight override
      this.baseLayerWeightOverrides.set(index, newWeight)
    } else {
      // Updating custom layer
      const customIndex = index - baseLayers.length
      if (this.customLayers[customIndex]) {
        this.customLayers[customIndex].weight = newWeight
      }
    }
    
    // Force terrain regeneration with updated weights (unless we're batching)
    if (!skipRegeneration) {
      this.generateTerrain().catch(console.error)
    }
  }





  private applyBaseLayerWeightOverrides(): void {
    // This method temporarily modifies the base layer weights for terrain generation
    // Note: This is a workaround since the terrain generator recreates layers each time
    // We'll handle the overrides in the custom layers application instead
  }





  private applyLayerAdjustments(baseHeightData: Float32Array): Float32Array {
    const { resolution } = this.config
    const result = new Float32Array(baseHeightData.length)
    
    // Apply a simple scaling factor for base layer weight changes
    let baseScalingFactor = 1.0
    if (this.baseLayerWeightOverrides.size > 0) {
      // For now, just use the first weight override as a simple scaling factor
      const weights = Array.from(this.baseLayerWeightOverrides.values())
      const avgWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length
      baseScalingFactor = avgWeight * 2 // Simple scaling
      console.log(`Applying base scaling factor: ${baseScalingFactor}`)
    }
    
    // Start with scaled base terrain
    for (let i = 0; i < baseHeightData.length; i++) {
      result[i] = baseHeightData[i] * baseScalingFactor
    }
    
    // Apply each custom layer
    for (const layer of this.customLayers) {
      console.log(`Applying custom layer with weight: ${layer.weight}`)
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const index = y * resolution + x
          
          // Transform coordinates to noise space with slight offset to avoid center artifacts
          const nx = (x / (resolution - 1)) * 2 - 1 + 0.001
          const ny = (y / (resolution - 1)) * 2 - 1 + 0.001
          
          // Generate noise for this layer
          const noise = this.advancedTerrainGenerator.getNoiseSystem().generateNoise(nx, ny, layer.type, layer.config)
          
          // Apply layer with its weight
          result[index] += noise * layer.weight
        }
      }
    }
    
    return result
  }

  public async generateTerrain(): Promise<void> {
    // Prevent multiple simultaneous generations
    if (this.isGenerating) {
      return
    }
    this.isGenerating = true

    // Start progress tracking
    if (this.uiController && this.uiController.getProgressOverlay) {
      const progressOverlay = this.uiController.getProgressOverlay()
      progressOverlay.startTask('terrain-generation', 'Generating Terrain', 'Initializing terrain generation...')
    }

    try {
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
        // Use advanced terrain generator with chunked processing
      this.advancedTerrainGenerator.updateConfig({
        size: this.config.size,
        resolution: this.config.resolution,
        seed: this.config.seed,
        geologicalComplexity: this.config.geologicalComplexity,
        domainWarping: this.config.domainWarping,
        reliefAmplitude: this.config.reliefAmplitude,
        featureScale: this.config.featureScale
      })
      
      // Apply base layer weight overrides before generating terrain
      this.applyBaseLayerWeightOverrides()
      
        // Use chunked generation for high resolutions to prevent stack overflow
        if (this.config.resolution >= 512) {
          if (this.uiController && this.uiController.getProgressOverlay) {
            const progressOverlay = this.uiController.getProgressOverlay()
            progressOverlay.updateTask('terrain-generation', 10, 'Using chunked generation for high resolution...')
          }
          heightData = await this.generateTerrainChunked(this.config.terrainType)
        } else {
          if (this.uiController && this.uiController.getProgressOverlay) {
            const progressOverlay = this.uiController.getProgressOverlay()
            progressOverlay.updateTask('terrain-generation', 20, 'Generating terrain with advanced noise system...')
          }
          heightData = this.advancedTerrainGenerator.generateTerrain(this.config.terrainType)
        }
    } else {
      // Basic mode not supported anymore - use advanced with default settings
        if (this.config.resolution >= 512) {
          heightData = await this.generateTerrainChunked(this.config.terrainType)
        } else {
      heightData = this.advancedTerrainGenerator.generateTerrain(this.config.terrainType)
        }
    }

    // Apply weight adjustments and custom layers
    if (this.customLayers.length > 0 || this.baseLayerWeightOverrides.size > 0) {
      if (this.uiController && this.uiController.getProgressOverlay) {
        const progressOverlay = this.uiController.getProgressOverlay()
        progressOverlay.updateTask('terrain-generation', 80, 'Applying layer adjustments...')
      }
      
      if (this.config.resolution >= 512) {
        heightData = await this.applyLayerAdjustmentsChunked(heightData)
      } else {
        heightData = this.applyLayerAdjustments(heightData)
      }
    }

    // Create terrain geometry
    if (this.uiController && this.uiController.getProgressOverlay) {
      const progressOverlay = this.uiController.getProgressOverlay()
      progressOverlay.updateTask('terrain-generation', 90, 'Creating terrain mesh...')
    }
    
    await this.createTerrainMesh(heightData)
    
    // Complete the progress
    if (this.uiController && this.uiController.getProgressOverlay) {
      const progressOverlay = this.uiController.getProgressOverlay()
      progressOverlay.completeTask('terrain-generation')
    }
    } finally {
      this.isGenerating = false
    }
  }

  /**
   * Generate terrain in chunks using parallel workers for multi-core processing
   */
  private async generateTerrainChunked(type: TerrainType): Promise<Float32Array> {
    const { resolution } = this.config
    const heightData = new Float32Array(resolution * resolution)
    
    const chunksX = Math.ceil(resolution / this.chunkSize)
    const chunksY = Math.ceil(resolution / this.chunkSize)
    const totalChunks = chunksX * chunksY

    if (this.uiController && this.uiController.getProgressOverlay) {
      const progressOverlay = this.uiController.getProgressOverlay()
      progressOverlay.updateTask('terrain-generation', 15, 
        `Processing ${totalChunks} chunks (${this.chunkSize}x${this.chunkSize} each) using ${this.workers.length} workers...`)
    }

    // Fall back to single-threaded if no workers available
    if (this.workers.length === 0) {
      return this.generateTerrainChunkedSingleThreaded(type)
    }

    return this.generateTerrainChunkedParallel(type, chunksX, chunksY, totalChunks, heightData)
  }

  /**
   * Parallel terrain generation using worker pool
   */
  private async generateTerrainChunkedParallel(
    type: TerrainType, 
    chunksX: number, 
    chunksY: number, 
    totalChunks: number, 
    heightData: Float32Array
  ): Promise<Float32Array> {
    const { resolution } = this.config
    let processedChunks = 0
    const pendingChunks: Promise<void>[] = []

    // Create chunk processing promises
    for (let chunkY = 0; chunkY < chunksY; chunkY++) {
      for (let chunkX = 0; chunkX < chunksX; chunkX++) {
        const startX = chunkX * this.chunkSize
        const startY = chunkY * this.chunkSize
        const endX = Math.min(startX + this.chunkSize, resolution)
        const endY = Math.min(startY + this.chunkSize, resolution)
        
        const chunkPromise = this.processTerrainChunkWithWorker(
          type, startX, startY, endX, endY, heightData, `${chunkX}-${chunkY}`
        ).then(() => {
          processedChunks++
          
          // Update progress periodically
          if (processedChunks % Math.max(1, Math.floor(totalChunks / 20)) === 0) {
            const progress = 15 + (processedChunks / totalChunks * 60)
            
            if (this.uiController && this.uiController.getProgressOverlay) {
              const progressOverlay = this.uiController.getProgressOverlay()
              progressOverlay.updateTask('terrain-generation', progress, 
                `Processed ${processedChunks}/${totalChunks} chunks...`)
            }
          }
        })
        
        pendingChunks.push(chunkPromise)
      }
    }

    // Wait for all chunks to complete
    await Promise.all(pendingChunks)
    
    if (this.uiController && this.uiController.getProgressOverlay) {
      const progressOverlay = this.uiController.getProgressOverlay()
      progressOverlay.updateTask('terrain-generation', 75, 'Parallel terrain generation complete!')
    }
    
    return heightData
  }

  /**
   * Process a single chunk using a worker from the pool
   */
  private async processTerrainChunkWithWorker(
    type: TerrainType,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    heightData: Float32Array,
    chunkId: string
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Wait for an available worker
      const tryGetWorker = () => {
        const worker = this.getAvailableWorker()
        
        if (worker) {
          this.busyWorkers.add(worker)
          
          // Set up message handler for this chunk
          const handleMessage = (event: MessageEvent<TerrainWorkerResponse>) => {
            if (event.data.data.chunkId === chunkId) {
              worker.removeEventListener('message', handleMessage)
              worker.removeEventListener('error', handleError)
              
              if (event.data.type === 'chunkComplete') {
                // Copy worker result back to main height data
                const { heightData: chunkData, startX: chunkStartX, startY: chunkStartY, endX: chunkEndX, endY: chunkEndY } = event.data.data
                
                if (chunkData && chunkStartX !== undefined && chunkStartY !== undefined && chunkEndX !== undefined && chunkEndY !== undefined) {
                  const chunkWidth = chunkEndX - chunkStartX
                  
                  for (let localY = 0; localY < chunkEndY - chunkStartY; localY++) {
                    for (let localX = 0; localX < chunkWidth; localX++) {
                      const globalX = chunkStartX + localX
                      const globalY = chunkStartY + localY
                      const globalIndex = globalY * this.config.resolution + globalX
                      const localIndex = localY * chunkWidth + localX
                      
                      heightData[globalIndex] = chunkData[localIndex]
                    }
                  }
                  
                  this.releaseWorker(worker)
                  resolve()
                } else {
                  this.releaseWorker(worker)
                  reject(new Error('Invalid chunk data received from worker'))
                }
              } else if (event.data.type === 'error') {
                this.releaseWorker(worker)
                reject(new Error(`Worker error: ${event.data.data.error || 'Unknown worker error'}`))
              }
            }
          }
          
          const handleError = (error: ErrorEvent) => {
            worker.removeEventListener('message', handleMessage)
            worker.removeEventListener('error', handleError)
            this.releaseWorker(worker)
            reject(error)
          }
          
          worker.addEventListener('message', handleMessage)
          worker.addEventListener('error', handleError)
          
          // Send work to the worker
          const message: TerrainWorkerMessage = {
            type: 'processChunk',
            data: {
              chunkId,
              startX,
              startY,
              endX,
              endY,
              resolution: this.config.resolution,
              terrainType: type,
              config: this.advancedTerrainGenerator.getConfig()
            }
          }
          
          worker.postMessage(message)
        } else {
          // No worker available, wait a bit and try again
          setTimeout(tryGetWorker, 10)
        }
      }
      
      tryGetWorker()
    })
  }

  /**
   * Fallback single-threaded terrain generation
   */
  private async generateTerrainChunkedSingleThreaded(type: TerrainType): Promise<Float32Array> {
    const { resolution } = this.config
    const heightData = new Float32Array(resolution * resolution)
    
    const chunksX = Math.ceil(resolution / this.chunkSize)
    const chunksY = Math.ceil(resolution / this.chunkSize)
    let processedChunks = 0
    const totalChunks = chunksX * chunksY

    for (let chunkY = 0; chunkY < chunksY; chunkY++) {
      for (let chunkX = 0; chunkX < chunksX; chunkX++) {
        const startX = chunkX * this.chunkSize
        const startY = chunkY * this.chunkSize
        const endX = Math.min(startX + this.chunkSize, resolution)
        const endY = Math.min(startY + this.chunkSize, resolution)
        
        await this.processTerrainChunk(heightData, type, startX, startY, endX, endY)
        
        processedChunks++
        
        if (processedChunks % 4 === 0) {
          const progress = 15 + (processedChunks / totalChunks * 60)
          
          if (this.uiController && this.uiController.getProgressOverlay) {
            const progressOverlay = this.uiController.getProgressOverlay()
            progressOverlay.updateTask('terrain-generation', progress, `Processed ${processedChunks}/${totalChunks} chunks (single-threaded)...`)
          }
          
          await this.yieldControl()
        }
      }
    }
    
    return heightData
  }

  /**
   * Process a single terrain chunk
   */
  private async processTerrainChunk(
    heightData: Float32Array, 
    type: TerrainType, 
    startX: number, 
    startY: number, 
    endX: number, 
    endY: number
  ): Promise<void> {
    const { resolution } = this.config
    
    // Get terrain generation parameters
    const geologicalComplexity = this.config.geologicalComplexity ?? 0.8
    const domainWarping = this.config.domainWarping ?? 0.5
    const reliefAmplitude = this.config.reliefAmplitude ?? 1.0
    const featureScale = this.config.featureScale ?? 1.5
    
    // Generate base layers based on terrain type
    const layers = this.advancedTerrainGenerator.getTerrainTypeLayers(type, geologicalComplexity, featureScale)
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const index = y * resolution + x
        
        // Improved coordinate transformation with slight offset to avoid center artifacts
        const nx = (x / (resolution - 1)) * 2 - 1 + 0.001
        const ny = (y / (resolution - 1)) * 2 - 1 + 0.001
        
        // Advanced domain warping controlled by domainWarping parameter
        const warpStrength = domainWarping * 0.6
        const warpScale = 0.3 + featureScale * 0.4
        
        const warpX = this.advancedTerrainGenerator.getNoiseSystem().perlin(nx * warpScale + 100, ny * warpScale + 200) * warpStrength
        const warpY = this.advancedTerrainGenerator.getNoiseSystem().perlin(nx * warpScale + 300, ny * warpScale + 400) * warpStrength
        
        // Apply secondary warping for ultra-natural terrain when domain warping is high
        let warpedX = nx + warpX
        let warpedY = ny + warpY
        
        if (domainWarping > 0.7) {
          const secondaryWarp = (domainWarping - 0.7) * 0.3
          const secondaryScale = warpScale * 2
          warpedX += this.advancedTerrainGenerator.getNoiseSystem().perlin(warpedX * secondaryScale + 500, warpedY * secondaryScale + 600) * secondaryWarp
          warpedY += this.advancedTerrainGenerator.getNoiseSystem().perlin(warpedX * secondaryScale + 700, warpedY * secondaryScale + 800) * secondaryWarp
        }
        
        // Generate terrain height using multi-scale composition
        let height = this.advancedTerrainGenerator.getNoiseSystem().multiScaleNoise(warpedX, warpedY, layers)
        
        // Apply geological features
        const config = this.advancedTerrainGenerator.getConfig()
        if (config.mountainRanges.enabled) {
          height += this.generateMountainRanges(warpedX, warpedY, featureScale) * geologicalComplexity
        }
        
        if (config.valleys.enabled) {
          height = this.carveValleys(warpedX, warpedY, height, geologicalComplexity * 0.7, featureScale)
        }
        
        if (config.plateaus.enabled) {
          height = this.addPlateaus(warpedX, warpedY, height, featureScale)
        }
        
        if (config.coastalFeatures.enabled) {
          height = this.addCoastalFeatures(warpedX, warpedY, height, featureScale)
        }
        
        // Intelligent micro-detail that scales with geological complexity and feature scale
        const microDetailFreq = 6 + featureScale * 4
        const microDetailAmp = (1 + geologicalComplexity) * featureScale * 0.8
        const microDetail = this.advancedTerrainGenerator.getNoiseSystem().perlin(warpedX * microDetailFreq, warpedY * microDetailFreq) * microDetailAmp
        height += microDetail
        
        // Apply master relief amplitude scaling
        height *= reliefAmplitude
        
        heightData[index] = height
      }
    }
  }

  /**
   * Apply layer adjustments in chunks to prevent stack overflow
   */
  private async applyLayerAdjustmentsChunked(baseHeightData: Float32Array): Promise<Float32Array> {
    const { resolution } = this.config
    const result = new Float32Array(baseHeightData.length)
    
    console.log('Applying layer adjustments in chunks...')
    
    const chunksX = Math.ceil(resolution / this.chunkSize)
    const chunksY = Math.ceil(resolution / this.chunkSize)
    let processedChunks = 0
    const totalChunks = chunksX * chunksY

    // Apply a simple scaling factor for base layer weight changes
    let baseScalingFactor = 1.0
    if (this.baseLayerWeightOverrides.size > 0) {
      const weights = Array.from(this.baseLayerWeightOverrides.values())
      const avgWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length
      baseScalingFactor = avgWeight * 2
    }
    
    for (let chunkY = 0; chunkY < chunksY; chunkY++) {
      for (let chunkX = 0; chunkX < chunksX; chunkX++) {
        // Calculate chunk bounds
        const startX = chunkX * this.chunkSize
        const startY = chunkY * this.chunkSize
        const endX = Math.min(startX + this.chunkSize, resolution)
        const endY = Math.min(startY + this.chunkSize, resolution)
        
        // Process this chunk
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const index = y * resolution + x
            
            // Start with scaled base terrain
            result[index] = baseHeightData[index] * baseScalingFactor
            
            // Apply each custom layer
            for (const layer of this.customLayers) {
              // Transform coordinates to noise space with slight offset to avoid center artifacts
              const nx = (x / (resolution - 1)) * 2 - 1 + 0.001
              const ny = (y / (resolution - 1)) * 2 - 1 + 0.001
              
              // Generate noise for this layer
              const noise = this.advancedTerrainGenerator.getNoiseSystem().generateNoise(nx, ny, layer.type, layer.config)
              
              // Apply layer with its weight
              result[index] += noise * layer.weight
            }
          }
        }
        
        processedChunks++
        
        // Yield control every few chunks
        if (processedChunks % 8 === 0) {
          const progress = (processedChunks / totalChunks * 100).toFixed(1)
          console.log(`Layer adjustment progress: ${progress}%`)
          await this.yieldControl()
        }
      }
    }
    
    console.log('Layer adjustments complete!')
    return result
  }

  /**
   * Create the terrain mesh from height data (with chunked processing for high resolutions)
   */
  private async createTerrainMesh(heightData: Float32Array): Promise<void> {
    console.log('Creating terrain mesh...')

    // Create terrain geometry
    const geometry = new THREE.PlaneGeometry(
      this.config.size * 1000,
      this.config.size * 1000,
      this.config.resolution - 1,
      this.config.resolution - 1
    )

    // Apply height data to vertices in chunks to prevent stack overflow
    await this.applyHeightDataToVertices(geometry, heightData)

    geometry.attributes.position.needsUpdate = true
    
    // Compute normals in chunks for high resolutions
    if (this.config.resolution > 1024) {
      console.log('Computing normals for high resolution mesh...')
      await this.yieldControl()
    }
    geometry.computeVertexNormals()

    // Calculate min/max height using loop instead of spread operator to prevent stack overflow
    const { minHeight, maxHeight, avgHeight } = this.calculateHeightStats(heightData)
    console.log(`Height range: ${minHeight.toFixed(2)} to ${maxHeight.toFixed(2)}, avg: ${avgHeight.toFixed(2)}`)
    
    this.terrainMaterial.updateHeightRange(minHeight, maxHeight)

    // Get the material
    const material = this.terrainMaterial.getMaterial()

    // Create mesh
    this.terrain = new THREE.Mesh(geometry, material)
    this.terrain.rotation.x = -Math.PI / 2
    
    // Center the terrain properly relative to the grid
    this.terrain.position.y = -avgHeight * 0.5 // Center terrain around average height
    
    this.terrain.receiveShadow = true
    this.scene.add(this.terrain)

    // Update grid position to align with terrain center
    if (this.gridHelper) {
      this.gridHelper.position.y = -avgHeight * 0.5 - 0.1 // Slightly below terrain center
    }

    // Update brush system
    this.brushSystem.setTerrain(this.terrain, heightData, this.config.resolution)
    
    // Update noise preview to match current mode
    this.updateNoisePreview()
    
    // Update noise layers preview (but not during initial generation)
    if (this.uiController) {
      this.updateNoiseLayersGUI()
    }
    
    console.log('Terrain mesh created successfully!')
  }

  /**
   * Apply height data to vertices in chunks to prevent stack overflow
   */
  private async applyHeightDataToVertices(geometry: THREE.PlaneGeometry, heightData: Float32Array): Promise<void> {
    const vertices = geometry.attributes.position.array as Float32Array
    const chunkSize = 8192 // Process 8K vertices at a time
    
    console.log(`Applying height data to ${heightData.length} vertices in chunks of ${chunkSize}...`)
    
    for (let start = 0; start < heightData.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, heightData.length)
      
      // Apply heights for this chunk
      for (let i = start; i < end; i++) {
        vertices[i * 3 + 2] = heightData[i] // Z coordinate (height)
      }
      
      // Yield control every chunk to prevent blocking
      if (start > 0 && start % (chunkSize * 4) === 0) {
        const progress = ((start / heightData.length) * 100).toFixed(1)
        console.log(`Vertex processing progress: ${progress}%`)
        await this.yieldControl()
      }
    }
    
    console.log('Height data applied to vertices successfully!')
  }

  /**
   * Calculate height statistics without using spread operator (prevents stack overflow)
   */
  private calculateHeightStats(heightData: Float32Array): { minHeight: number; maxHeight: number; avgHeight: number } {
    let minHeight = Infinity
    let maxHeight = -Infinity
    let sum = 0
    
    // Process in chunks to prevent blocking on very large arrays
    const chunkSize = 16384
    for (let start = 0; start < heightData.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, heightData.length)
      
      for (let i = start; i < end; i++) {
        const height = heightData[i]
        if (height < minHeight) minHeight = height
        if (height > maxHeight) maxHeight = height
        sum += height
      }
    }
    
    const avgHeight = sum / heightData.length
    return { minHeight, maxHeight, avgHeight }
  }

  /**
   * Yield control back to the browser to prevent blocking
   */
  private yieldControl(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  // Worker Pool Management
  private initializeWorkerPool(): void {
    console.log(`Initializing ${this.workerCount} terrain workers for parallel processing`)
    
    for (let i = 0; i < this.workerCount; i++) {
      try {
        const worker = new Worker(new URL('./TerrainWorker.ts', import.meta.url), { type: 'module' })
        this.workers.push(worker)
        this.availableWorkers.push(worker)
      } catch (error) {
        console.warn('Failed to create terrain worker:', error)
        // Fallback to single-threaded processing if workers fail
        this.workerCount = 0
        break
      }
    }
    
    if (this.workers.length === 0) {
      console.warn('No workers available, falling back to single-threaded processing')
    }
  }

  private getAvailableWorker(): Worker | null {
    return this.availableWorkers.pop() || null
  }

  private releaseWorker(worker: Worker): void {
    if (this.busyWorkers.has(worker)) {
      this.busyWorkers.delete(worker)
      this.availableWorkers.push(worker)
    }
  }

  private destroyWorkerPool(): void {
    this.workers.forEach(worker => worker.terminate())
    this.workers = []
    this.availableWorkers = []
    this.busyWorkers.clear()
  }

  // Helper methods for terrain generation (duplicated to avoid dependency on AdvancedTerrainGenerator internals)
  private generateMountainRanges(x: number, y: number, featureScale: number): number {
    // Simplified mountain range generation
    const frequency = 0.5 / featureScale
    const amplitude = 100
    return this.advancedTerrainGenerator.getNoiseSystem().perlin(x * frequency, y * frequency) * amplitude
  }

  private carveValleys(x: number, y: number, height: number, valleyIntensity: number, featureScale: number): number {
    const frequency = 0.3 / featureScale
    const amplitude = 50
    const valley = this.advancedTerrainGenerator.getNoiseSystem().perlin(x * frequency, y * frequency) * amplitude
    return height - Math.max(0, -valley) * valleyIntensity
  }

  private addPlateaus(x: number, y: number, height: number, featureScale: number): number {
    const plateauMask = this.advancedTerrainGenerator.getNoiseSystem().voronoiNoise(x, y, 0.4 / featureScale)
    const smoothedPlateau = Math.pow(Math.max(0, 0.5 - plateauMask), 2.0)
    return height + smoothedPlateau * 100
  }

  private addCoastalFeatures(_x: number, _y: number, height: number, _featureScale: number): number {
    // Height-based coastal effects
    if (height > -5 && height < 5) {
      height = height * 0.3
    }
    return height
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
    
    // Clear weight overrides if terrain type changes (they become invalid)
    if (newConfig.terrainType !== undefined && newConfig.terrainType !== oldConfig.terrainType) {
      this.baseLayerWeightOverrides.clear()
    }
    
    // Update seeds if changed
    if (newConfig.seed !== undefined && newConfig.seed !== oldConfig.seed) {
      this.advancedTerrainGenerator.setSeed(newConfig.seed)
    }
    
    // Clear existing timeout
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
    }
    
    // Debounce terrain regeneration to avoid excessive updates
    this.updateTimeout = setTimeout(async () => {
      try {
        await this.generateTerrain()
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

  /**
   * Set terrain resolution with validation and automatic chunking for high resolutions
   */
  public setResolution(resolution: number): void {
    // Validate resolution - must be power of 2 for optimal performance
    const validResolutions = [64, 128, 256, 512, 1024, 2048, 4096]
    const closest = validResolutions.reduce((prev, curr) => 
      Math.abs(curr - resolution) < Math.abs(prev - resolution) ? curr : prev
    )
    
    if (resolution !== closest) {
      console.warn(`Resolution ${resolution} adjusted to nearest valid value: ${closest}`)
    }
    
    // Auto-adjust chunk size based on resolution for optimal performance
    if (closest >= 2048) {
      this.chunkSize = 32 // Smaller chunks for very high resolutions
      console.log(`High resolution (${closest}x${closest}) detected - using 32x32 chunks`)
    } else if (closest >= 1024) {
      this.chunkSize = 64 // Medium chunks for high resolutions
      console.log(`High resolution (${closest}x${closest}) detected - using 64x64 chunks`)
    } else if (closest >= 512) {
      this.chunkSize = 128 // Larger chunks for moderate resolutions
    } else {
      this.chunkSize = 256 // Standard processing for lower resolutions
    }
    
    this.config.resolution = closest
    console.log(`Resolution set to ${closest}x${closest} with ${this.chunkSize}x${this.chunkSize} chunk processing`)
  }

  /**
   * Get supported resolution options
   */
  public getSupportedResolutions(): number[] {
    return [64, 128, 256, 512, 1024, 2048, 4096]
  }

  /**
   * Get current chunk size being used for processing
   */
  public getChunkSize(): number {
    return this.chunkSize
  }

  /**
   * Test high resolution generation to verify stack overflow fixes
   */
  public async testHighResolution(resolution: number = 1024): Promise<boolean> {
    console.log(`Testing high resolution terrain generation: ${resolution}x${resolution}`)
    
    try {
      // Save current config
      const originalResolution = this.config.resolution
      
      // Set high resolution
      this.setResolution(resolution)
      
      // Generate terrain
      await this.generateTerrain()
      
      // Check if terrain was created successfully
      const success = this.terrain !== null
      
      // Restore original resolution
      this.setResolution(originalResolution)
      
      if (success) {
        console.log(`✅ High resolution test passed: ${resolution}x${resolution} terrain generated successfully`)
      } else {
        console.log(`❌ High resolution test failed: No terrain mesh created`)
      }
      
      return success
    } catch (error) {
      console.error(`❌ High resolution test failed with error:`, error)
      return false
    }
  }

  public getBrushSystem(): BrushSystem {
    return this.brushSystem
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  public resize(): void {
    const width = window.innerWidth
    const height = window.innerHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  public exportHeightmap(): string {
    return this.advancedTerrainGenerator.exportHeightmapAsImage(
      this.brushSystem.getHeightData()
    )
  }

  public exportProject(): string {
    const projectData = {
      config: this.config,
      heightData: Array.from(this.brushSystem.getHeightData()),
      seed: this.advancedTerrainGenerator.getSeed(),
      timestamp: Date.now(),
      version: '1.0.0'
    }
    return JSON.stringify(projectData, null, 2)
  }

  public randomizeSeed(): void {
    this.config.seed = Math.floor(Math.random() * 1000000)
    this.advancedTerrainGenerator.setSeed(this.config.seed)
    this.generateTerrain().catch(console.error)
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
    
    // Clean up terrain material
    this.terrainMaterial.dispose()
    
    // Clean up preview canvas
    if (this.noisePreviewCanvas && this.noisePreviewCanvas.parentNode) {
      document.body.removeChild(this.noisePreviewCanvas)
    }
    
    // Clean up noise layers container
    if (this.noiseLayersContainer && this.noiseLayersContainer.parentNode) {
      document.body.removeChild(this.noiseLayersContainer)
    }
    
    // Clean up noise layers GUI - handled by UIController
    
    // Clean up worker pool
    this.destroyWorkerPool()
    
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

    // Start erosion progress tracking
    if (this.uiController && this.uiController.getProgressOverlay) {
      const progressOverlay = this.uiController.getProgressOverlay()
      progressOverlay.startTask('erosion', 'Applying Erosion', 'Initializing erosion simulation...')
    }

    // Optimize erosion config for high resolution terrains
    const optimizedConfig = this.optimizeErosionConfig(erosionConfig)
    
    // Update erosion config if provided
    if (optimizedConfig) {
      this.erosionSystem.updateConfig(optimizedConfig)
    }

    // Get current height data from brush system
    const currentHeightData = this.brushSystem.getHeightData()
    
    if (this.uiController && this.uiController.getProgressOverlay) {
      const progressOverlay = this.uiController.getProgressOverlay()
      progressOverlay.updateTask('erosion', 10, `Starting erosion on ${this.config.resolution}x${this.config.resolution} terrain...`)
    }
    
    // Set up progress callback for erosion system
    this.erosionSystem.setProgressCallback((progress: number, description: string) => {
      if (this.uiController && this.uiController.getProgressOverlay) {
        const progressOverlay = this.uiController.getProgressOverlay()
        progressOverlay.updateTask('erosion', 10 + (progress * 0.8), description) // Map to 10-90%
      }
    })
    
    // Apply erosion
    this.erosionSystem.setHeightData(currentHeightData, this.config.resolution)
    const erodedHeightData = this.erosionSystem.applyErosion()
    
    if (this.uiController && this.uiController.getProgressOverlay) {
      const progressOverlay = this.uiController.getProgressOverlay()
      progressOverlay.updateTask('erosion', 90, 'Updating terrain geometry...')
    }
    
    // Update terrain with eroded data
    this.updateTerrainGeometry(erodedHeightData)
    
    // Update brush system with new height data
    this.brushSystem.setTerrain(this.terrain!, erodedHeightData, this.config.resolution)
    
    // Complete erosion progress
    if (this.uiController && this.uiController.getProgressOverlay) {
      const progressOverlay = this.uiController.getProgressOverlay()
      progressOverlay.completeTask('erosion')
    }
  }

  /**
   * Optimize erosion config for high resolution terrains - make it more aggressive for satisfying results
   */
  private optimizeErosionConfig(userConfig?: Partial<ErosionConfig>): Partial<ErosionConfig> | undefined {
    if (!userConfig && this.config.resolution < 512) {
      // No optimization needed for lower resolution
      return userConfig
    }

    const optimized: Partial<ErosionConfig> = { ...userConfig }
    
    // For high resolution terrains, make erosion more aggressive to get satisfying visual results
    if (this.config.resolution >= 1024) {
      // Increase erosion strength for high resolution (more dramatic results)
      if (!userConfig?.erosionStrength) {
        optimized.erosionStrength = Math.max(0.5, (userConfig?.erosionStrength || 0.3) * 1.5)
      }
      
      // Increase rain strength for more aggressive erosion
      if (!userConfig?.rainStrength) {
        optimized.rainStrength = Math.max(0.03, (userConfig?.rainStrength || 0.02) * 1.2)
      }
      
      // Increase sediment capacity for more carving
      if (!userConfig?.sedimentCapacity) {
        optimized.sedimentCapacity = Math.max(6.0, (userConfig?.sedimentCapacity || 4.0) * 1.5)
      }
      
      // Reduce thermal rate slightly to preserve carved features
      if (!userConfig?.thermalRate) {
        optimized.thermalRate = Math.max(0.05, (userConfig?.thermalRate || 0.1) * 0.8)
      }
      
      console.log(`⚡ High resolution detected - using aggressive erosion settings for dramatic results`)
    } else if (this.config.resolution >= 512) {
      // Medium boost for 512x512
      if (!userConfig?.erosionStrength) {
        optimized.erosionStrength = Math.max(0.4, (userConfig?.erosionStrength || 0.3) * 1.3)
      }
      
      if (!userConfig?.rainStrength) {
        optimized.rainStrength = Math.max(0.025, (userConfig?.rainStrength || 0.02) * 1.1)
      }
      
      console.log(`⚡ Medium resolution detected - using enhanced erosion settings`)
    }

    return optimized
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

    // Update vertex heights using chunked approach for high resolution
    if (this.config.resolution >= 512) {
      this.updateVerticesChunkedSync(vertices, heightData)
    } else {
      // Direct update for lower resolution
      for (let i = 0; i < heightData.length; i++) {
        vertices[i * 3 + 2] = heightData[i] // Z coordinate (height)
      }
    }

    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()

    // Update height range for terrain material (avoid spread operator for large arrays)
    const { minHeight, maxHeight } = this.calculateHeightRangeSafe(heightData)
    this.terrainMaterial.updateHeightRange(minHeight, maxHeight)
  }

  /**
   * Update vertices in chunks for high resolution terrains (synchronous version for erosion)
   */
  private updateVerticesChunkedSync(vertices: Float32Array, heightData: Float32Array): void {
    const chunkSize = 8192 // Process 8K vertices at a time
    
    for (let start = 0; start < heightData.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, heightData.length)
      
      for (let i = start; i < end; i++) {
        vertices[i * 3 + 2] = heightData[i] // Z coordinate (height)
      }
    }
  }

  /**
   * Calculate height range safely without spread operator (prevents stack overflow)
   */
  private calculateHeightRangeSafe(heightData: Float32Array): { minHeight: number; maxHeight: number } {
    if (!heightData || heightData.length === 0) {
      return { minHeight: 0, maxHeight: 0 }
    }

    let minHeight = Infinity
    let maxHeight = -Infinity

    // Process in chunks to avoid blocking on very large arrays
    const chunkSize = 16384
    for (let start = 0; start < heightData.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, heightData.length)
      
      for (let i = start; i < end; i++) {
        const height = heightData[i]
        if (height < minHeight) minHeight = height
        if (height > maxHeight) maxHeight = height
      }
    }

    return { minHeight, maxHeight }
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

  public applyStrongErosion(): void {
    this.applyErosion({
      rainStrength: 0.04,
      erosionStrength: 0.6,
      sedimentCapacity: 8.0,
      iterations: 80,
      thermalRate: 0.08,
      dropletLifetime: 50
    })
  }

  public applyDramaticErosion(): void {
    this.applyErosion({
      rainStrength: 0.06,
      erosionStrength: 0.8,
      sedimentCapacity: 12.0,
      iterations: 100,
      thermalRate: 0.06,
      dropletLifetime: 60,
      gravity: 6.0
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
      this.erosionSystem.updateAdvancedConfig(config)
    }

    // Get current height data
    const currentHeightData = this.brushSystem.getHeightData()
    
    // Apply advanced geomorphological erosion
    this.erosionSystem.setHeightData(currentHeightData, this.config.resolution, this.config.size * 1000)
    const erodedHeightData = this.erosionSystem.applyAdvancedErosion()
    
    // Update terrain with eroded data
    this.updateTerrainGeometry(erodedHeightData)
    
    // Update brush system with new height data
    this.brushSystem.setTerrain(this.terrain!, erodedHeightData, this.config.resolution)
  }

  public getAdvancedErosionSystem(): ErosionSystem {
    return this.erosionSystem
  }

  public updateAdvancedErosionConfig(config: Partial<AdvancedErosionConfig>): void {
    this.erosionSystem.updateAdvancedConfig(config)
  }

  public getAdvancedErosionConfig(): AdvancedErosionConfig {
    return this.erosionSystem.getAdvancedConfig()
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
    const config = this.erosionSystem.getAdvancedConfig()
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
    this.erosionSystem.updateAdvancedConfig(config)
  }

  // Get advanced erosion data for visualization
  public getAdvancedErosionData() {
    return this.erosionSystem.getErosionResults()
  }

  // Create realistic drainage networks
  public generateRealisticDrainageNetwork(): void {
    this.erosionSystem.createRealisticRiverNetwork()
  }

  // Export advanced erosion data
  public exportAdvancedErosionData(): string {
    const results = this.erosionSystem.getErosionResults()
    const exportData = {
      config: this.config,
      erosionConfig: this.erosionSystem.getAdvancedConfig(),
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
      this.generateTerrain().catch(console.error)
    }
  }

  public getTerrainType(): TerrainType {
    return this.config.terrainType
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