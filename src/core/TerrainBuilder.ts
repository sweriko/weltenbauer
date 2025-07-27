import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GUI } from 'lil-gui'
import { AdvancedTerrainGenerator, TerrainType } from './AdvancedTerrainGenerator'
import { BrushSystem } from './BrushSystem'
import { ErosionSystem, ErosionConfig, AdvancedErosionConfig } from './ErosionSystem'
import { TerrainMaterial } from './TerrainMaterial'

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
  private renderer: THREE.WebGLRenderer
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
  private noiseLayersFolder: any = null
  private customLayers: any[] = []
  private baseLayerWeightOverrides: Map<number, number> = new Map()
  private layerControls: any[] = []
  private uiController: any = null
  
  private config: TerrainConfig = {
    size: 5, // 5km
    resolution: 256, // Reduced for better performance
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    )
    
    this.renderer = new THREE.WebGLRenderer({
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
    
    this.init()
  }

  private init(): void {
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

  private updateNoiseLayersPreview(): void {
    // Get the layers content area
    const layersContent = document.getElementById('layers-content')
    if (!layersContent) return
    
    // Clear existing layers
    layersContent.innerHTML = ''

    // Get current terrain type and parameters
    const geologicalComplexity = this.config.geologicalComplexity
    const featureScale = this.config.featureScale
    const terrainType = this.config.terrainType
    
    // Get base terrain layers
    const baseLayers = this.advancedTerrainGenerator.getTerrainTypeLayers(terrainType, geologicalComplexity, featureScale)
    
    // Apply weight overrides to base layers to show current state
    baseLayers.forEach((layer, index) => {
      if (this.baseLayerWeightOverrides.has(index)) {
        layer.weight = this.baseLayerWeightOverrides.get(index)!
      }
    })
    
    // Combine base layers with custom layers
    const allLayers = [...baseLayers, ...this.customLayers]
    
    // Create preview for each layer
    allLayers.forEach((layer: any, index: number) => {
      const isCustomLayer = index >= baseLayers.length
      const layerCard = this.createLayerCard(layer, index, isCustomLayer)
      layersContent.appendChild(layerCard)
    })
    
    // Add weight summary
    const weightSummaryCard = this.createWeightSummaryCard(allLayers)
    layersContent.appendChild(weightSummaryCard)
    
    // Add combined result
    const combinedCard = this.createCombinedResultCard(allLayers)
    layersContent.appendChild(combinedCard)
  }

  private createLayerCard(layer: any, index: number, isCustomLayer: boolean = false): HTMLDivElement {
    const layerCard = document.createElement('div')
    layerCard.style.background = isCustomLayer ? 'rgba(60, 40, 80, 0.8)' : 'rgba(40, 40, 40, 0.8)'
    layerCard.style.border = isCustomLayer ? '1px solid #8066cc' : '1px solid #555'
    layerCard.style.borderRadius = '8px'
    layerCard.style.padding = '10px'
    layerCard.style.marginBottom = '10px'
    layerCard.style.transition = 'all 0.2s ease'
    layerCard.style.boxSizing = 'border-box'
    layerCard.style.width = '100%'
    
    // Header with layer info and remove button
    const header = document.createElement('div')
    header.style.display = 'flex'
    header.style.justifyContent = 'space-between'
    header.style.alignItems = 'center'
    header.style.marginBottom = '8px'
    
    const layerInfo = document.createElement('div')
    
    const label = document.createElement('div')
    const layerPrefix = isCustomLayer ? 'Custom' : 'Base'
    label.textContent = `${index + 1}. ${layer.type.toUpperCase()} (${layerPrefix})`
    label.style.color = '#fff'
    label.style.fontSize = '14px'
    label.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    label.style.fontWeight = '600'
    
    layerInfo.appendChild(label)
    
    header.appendChild(layerInfo)
    
    // Remove button (only for custom layers)
    if (isCustomLayer) {
      const removeBtn = document.createElement('button')
      removeBtn.textContent = '×'
      removeBtn.style.background = '#cc4444'
      removeBtn.style.color = '#fff'
      removeBtn.style.border = 'none'
      removeBtn.style.borderRadius = '4px'
      removeBtn.style.width = '24px'
      removeBtn.style.height = '24px'
      removeBtn.style.fontSize = '16px'
      removeBtn.style.cursor = 'pointer'
      removeBtn.style.display = 'flex'
      removeBtn.style.alignItems = 'center'
      removeBtn.style.justifyContent = 'center'
      removeBtn.style.transition = 'all 0.2s ease'
      
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.background = '#dd5555'
        removeBtn.style.transform = 'scale(1.1)'
      })
      
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.background = '#cc4444'
        removeBtn.style.transform = 'scale(1)'
      })
      
      removeBtn.addEventListener('click', () => this.removeLayer(index))
      
      header.appendChild(removeBtn)
    }
    
    // Weight slider
    const weightContainer = document.createElement('div')
    weightContainer.style.marginBottom = '8px'
    weightContainer.style.width = '100%'
    weightContainer.style.boxSizing = 'border-box'
    
    const weightLabel = document.createElement('div')
    weightLabel.textContent = `Weight: ${(layer.weight * 100).toFixed(0)}%`
    weightLabel.style.color = '#ccc'
    weightLabel.style.fontSize = '12px'
    weightLabel.style.marginBottom = '4px'
    weightLabel.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    
    const weightSlider = document.createElement('input')
    weightSlider.type = 'range'
    weightSlider.min = '0'
    weightSlider.max = '100'
    weightSlider.value = (layer.weight * 100).toString()
    weightSlider.className = 'weight-slider'
    
    weightSlider.addEventListener('input', (e) => {
      const sliderValue = parseInt((e.target as HTMLInputElement).value)
      const newWeight = sliderValue / 100
      weightLabel.textContent = `Weight: ${sliderValue}%`
      console.log(`Slider moved to ${sliderValue}%, weight: ${newWeight}`)
      // Use simple weight update
      this.updateLayerWeight(index, newWeight, false)
    })
    
    weightContainer.appendChild(weightLabel)
    weightContainer.appendChild(weightSlider)
    
    // Layer preview canvas - fix aspect ratio
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 50
    canvas.style.width = '200px'
    canvas.style.height = '50px'
    canvas.style.border = '1px solid #666'
    canvas.style.borderRadius = '6px'
    canvas.style.display = 'block'
    canvas.style.background = '#222'
    canvas.style.margin = '0 auto'
    
    // Generate preview for this layer
    this.generateLayerPreview(canvas, layer)
    
    layerCard.appendChild(header)
    layerCard.appendChild(weightContainer)
    layerCard.appendChild(canvas)
    
    return layerCard
  }

  private createWeightSummaryCard(layers: any[]): HTMLDivElement {
    const summaryCard = document.createElement('div')
    summaryCard.style.background = 'rgba(60, 60, 60, 0.8)'
    summaryCard.style.border = '1px solid #888'
    summaryCard.style.borderRadius = '8px'
    summaryCard.style.padding = '8px'
    summaryCard.style.marginBottom = '10px'
    summaryCard.style.boxSizing = 'border-box'
    summaryCard.style.width = '100%'
    
    // Calculate total weight
    const totalWeight = layers.reduce((sum, layer) => sum + layer.weight, 0)
    
    const summaryLabel = document.createElement('div')
    summaryLabel.textContent = `Total Weight: ${(totalWeight * 100).toFixed(1)}%`
    summaryLabel.style.color = totalWeight === 1.0 ? '#4CAF50' : '#FFA726'
    summaryLabel.style.fontSize = '12px'
    summaryLabel.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    summaryLabel.style.fontWeight = '600'
    summaryLabel.style.textAlign = 'center'
    
    // Add visual indicator
    const indicator = document.createElement('div')
    indicator.style.width = '100%'
    indicator.style.height = '4px'
    indicator.style.background = totalWeight === 1.0 ? '#4CAF50' : '#FFA726'
    indicator.style.borderRadius = '2px'
    indicator.style.marginTop = '4px'
    
    summaryCard.appendChild(summaryLabel)
    summaryCard.appendChild(indicator)
    
    return summaryCard
  }

  private createCombinedResultCard(layers: any[]): HTMLDivElement {
    const combinedCard = document.createElement('div')
    combinedCard.style.background = 'rgba(0, 102, 204, 0.2)'
    combinedCard.style.border = '2px solid #0066cc'
    combinedCard.style.borderRadius = '8px'
    combinedCard.style.padding = '10px'
    combinedCard.style.marginTop = '16px'
    combinedCard.style.boxSizing = 'border-box'
    combinedCard.style.width = '100%'
    
    const combinedLabel = document.createElement('div')
    combinedLabel.textContent = 'COMBINED RESULT'
    combinedLabel.style.color = '#fff'
    combinedLabel.style.fontSize = '14px'
    combinedLabel.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    combinedLabel.style.fontWeight = '600'
    combinedLabel.style.marginBottom = '8px'
    combinedLabel.style.textAlign = 'center'
    
    const combinedCanvas = document.createElement('canvas')
    combinedCanvas.width = 200
    combinedCanvas.height = 50
    combinedCanvas.style.width = '200px'
    combinedCanvas.style.height = '50px'
    combinedCanvas.style.border = '2px solid #0088ff'
    combinedCanvas.style.borderRadius = '6px'
    combinedCanvas.style.display = 'block'
    combinedCanvas.style.background = '#222'
    combinedCanvas.style.margin = '0 auto'
    
    // Generate combined preview
    this.generateCombinedLayersPreview(combinedCanvas, layers)
    
    combinedCard.appendChild(combinedLabel)
    combinedCard.appendChild(combinedCanvas)
    
    return combinedCard
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

    // Find min/max for normalization
    let min = Math.min(...samples)
    let max = Math.max(...samples)
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

  private generateCombinedLayersPreview(canvas: HTMLCanvasElement, layers: any[]): void {
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(canvas.width, canvas.height)
    const data = imageData.data

    // Sample the combined layers across the preview area
    const samples: number[] = []
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const nx = (x / canvas.width) * 2 - 1
        const ny = (y / canvas.height) * 2 - 1
        
        const combined = this.advancedTerrainGenerator.getNoiseSystem().multiScaleNoise(nx, ny, layers)
        samples.push(combined)
      }
    }

    // Find min/max for normalization
    let min = Math.min(...samples)
    let max = Math.max(...samples)
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
    this.generateTerrain()
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
      this.generateTerrain()
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
      this.generateTerrain()
    }
  }

  private updateLayerWeightNormalized(index: number, newWeight: number): void {
    // Get current layers
    const geologicalComplexity = this.config.geologicalComplexity
    const featureScale = this.config.featureScale
    const terrainType = this.config.terrainType
    const baseLayers = this.advancedTerrainGenerator.getTerrainTypeLayers(terrainType, geologicalComplexity, featureScale)
    
    // Apply existing weight overrides to base layers
    baseLayers.forEach((layer, layerIndex) => {
      if (this.baseLayerWeightOverrides.has(layerIndex)) {
        layer.weight = this.baseLayerWeightOverrides.get(layerIndex)!
      }
    })
    
    const allLayers = [...baseLayers, ...this.customLayers]
    const totalLayers = allLayers.length
    
    console.log('Before normalization:', allLayers.map(l => l.weight))
    
    if (totalLayers <= 1) {
      // If only one layer, set it to 100%
      this.updateLayerWeight(index, 1.0)
      this.updateNoiseLayersPreview()
      return
    }
    
    // Calculate what the other layers should sum to
    const remainingWeight = 1.0 - newWeight
    
    // Get current weights of all OTHER layers
    let otherLayersCurrentWeight = 0
    for (let i = 0; i < totalLayers; i++) {
      if (i !== index) {
        otherLayersCurrentWeight += allLayers[i].weight
      }
    }
    
    console.log(`Setting layer ${index} to ${newWeight}, remaining: ${remainingWeight}, others current: ${otherLayersCurrentWeight}`)
    
    // Update the target layer (skip regeneration during batch update)
    this.updateLayerWeight(index, newWeight, true)
    
    // Redistribute remaining weight proportionally among other layers
    if (otherLayersCurrentWeight > 0 && remainingWeight > 0) {
      for (let i = 0; i < totalLayers; i++) {
        if (i !== index) {
          const currentWeight = allLayers[i].weight
          const proportion = currentWeight / otherLayersCurrentWeight
          const newLayerWeight = remainingWeight * proportion
          console.log(`Layer ${i}: ${currentWeight} -> ${newLayerWeight} (prop: ${proportion})`)
          this.updateLayerWeight(i, newLayerWeight, true)
        }
      }
    } else if (remainingWeight > 0) {
      // If other layers have zero weight, distribute equally
      const equalWeight = remainingWeight / (totalLayers - 1)
      console.log(`Distributing equally: ${equalWeight} to each other layer`)
      for (let i = 0; i < totalLayers; i++) {
        if (i !== index) {
          this.updateLayerWeight(i, equalWeight, true)
        }
      }
    }
    
    // Now regenerate terrain once with all updated weights
    this.generateTerrain()
    
    // Update the UI to reflect all the new weights
    this.updateNoiseLayersPreview()
  }

    private applyCustomLayers(baseHeightData: Float32Array): Float32Array {
    const { resolution } = this.config
    const result = new Float32Array(baseHeightData.length)
    
    // Calculate total base layer weight modifier
    let baseWeightMultiplier = 1.0
    if (this.baseLayerWeightOverrides.size > 0) {
      // Get the original base layers to find original total weight
      const geologicalComplexity = this.config.geologicalComplexity
      const featureScale = this.config.featureScale
      const terrainType = this.config.terrainType
      const originalBaseLayers = this.advancedTerrainGenerator.getTerrainTypeLayers(terrainType, geologicalComplexity, featureScale)
      
      const originalTotalWeight = originalBaseLayers.reduce((sum, layer) => sum + layer.weight, 0)
      
      // Calculate new total weight with overrides
      let newTotalWeight = 0
      originalBaseLayers.forEach((layer, index) => {
        if (this.baseLayerWeightOverrides.has(index)) {
          newTotalWeight += this.baseLayerWeightOverrides.get(index)!
        } else {
          newTotalWeight += layer.weight
        }
      })
      
      // Calculate the multiplier to scale the existing terrain
      baseWeightMultiplier = newTotalWeight / originalTotalWeight
      console.log(`Base weight multiplier: ${baseWeightMultiplier} (${newTotalWeight}/${originalTotalWeight})`)
    }
    
    // Start with scaled base terrain
    for (let i = 0; i < baseHeightData.length; i++) {
      result[i] = baseHeightData[i] * baseWeightMultiplier
    }
    
    // Apply each custom layer
    for (const layer of this.customLayers) {
      console.log(`Applying custom layer with weight: ${layer.weight}`)
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const index = y * resolution + x
          
          // Transform coordinates to noise space
          const nx = (x / (resolution - 1)) * 2 - 1
          const ny = (y / (resolution - 1)) * 2 - 1
          
          // Generate noise for this layer
          const noise = this.advancedTerrainGenerator.getNoiseSystem().generateNoise(nx, ny, layer.type, layer.config)
          
          // Apply layer with its weight
          result[index] += noise * layer.weight
        }
      }
    }
    
    return result
  }

  private applyBaseLayerWeightOverrides(): void {
    // This method temporarily modifies the base layer weights for terrain generation
    // Note: This is a workaround since the terrain generator recreates layers each time
    // We'll handle the overrides in the custom layers application instead
  }

  private applyWeightOverridesToTerrainGenerator(): void {
    // Temporarily modify the terrain generator's layer weights
    const geologicalComplexity = this.config.geologicalComplexity
    const featureScale = this.config.featureScale
    const terrainType = this.config.terrainType
    
    // Get fresh layers from the generator
    const baseLayers = this.advancedTerrainGenerator.getTerrainTypeLayers(terrainType, geologicalComplexity, featureScale)
    
    // Apply our weight overrides
    baseLayers.forEach((layer, index) => {
      if (this.baseLayerWeightOverrides.has(index)) {
        const newWeight = this.baseLayerWeightOverrides.get(index)!
        console.log(`Overriding layer ${index} weight: ${layer.weight} -> ${newWeight}`)
        layer.weight = newWeight
      }
    })
    
    // Clear existing layers and add the modified ones
    const config = this.advancedTerrainGenerator.getConfig()
    config.layers = baseLayers.map(layer => ({
      type: layer.type,
      config: layer.config,
      weight: layer.weight,
      blendMode: 'add' as any
    }))
    this.advancedTerrainGenerator.updateConfig(config)
  }

  private applyCustomLayersOnly(baseHeightData: Float32Array): Float32Array {
    const { resolution } = this.config
    const result = new Float32Array(baseHeightData.length)
    
    // Start with base terrain as-is
    for (let i = 0; i < baseHeightData.length; i++) {
      result[i] = baseHeightData[i]
    }
    
    // Apply each custom layer
    for (const layer of this.customLayers) {
      console.log(`Applying custom layer with weight: ${layer.weight}`)
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const index = y * resolution + x
          
          // Transform coordinates to noise space
          const nx = (x / (resolution - 1)) * 2 - 1
          const ny = (y / (resolution - 1)) * 2 - 1
          
          // Generate noise for this layer
          const noise = this.advancedTerrainGenerator.getNoiseSystem().generateNoise(nx, ny, layer.type, layer.config)
          
          // Apply layer with its weight
          result[index] += noise * layer.weight
        }
      }
         }
     
     return result
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
          
          // Transform coordinates to noise space
          const nx = (x / (resolution - 1)) * 2 - 1
          const ny = (y / (resolution - 1)) * 2 - 1
          
          // Generate noise for this layer
          const noise = this.advancedTerrainGenerator.getNoiseSystem().generateNoise(nx, ny, layer.type, layer.config)
          
          // Apply layer with its weight
          result[index] += noise * layer.weight
        }
      }
    }
    
    return result
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
        geologicalComplexity: this.config.geologicalComplexity,
        domainWarping: this.config.domainWarping,
        reliefAmplitude: this.config.reliefAmplitude,
        featureScale: this.config.featureScale
      })
      
      // Apply base layer weight overrides before generating terrain
      this.applyBaseLayerWeightOverrides()
      
      heightData = this.advancedTerrainGenerator.generateTerrain(this.config.terrainType)
    } else {
      // Basic mode not supported anymore - use advanced with default settings
      heightData = this.advancedTerrainGenerator.generateTerrain(this.config.terrainType)
    }

    // Apply weight adjustments and custom layers
    if (this.customLayers.length > 0 || this.baseLayerWeightOverrides.size > 0) {
      heightData = this.applyLayerAdjustments(heightData)
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

    // Update height range for terrain material
    const minHeight = Math.min(...heightData)
    const maxHeight = Math.max(...heightData)
    this.terrainMaterial.updateHeightRange(minHeight, maxHeight)

    // Get the material
    const material = this.terrainMaterial.getMaterial()

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
    
    // Update noise preview to match current mode
    this.updateNoisePreview()
    
    // Update noise layers preview (but not during initial generation)
    if (this.uiController) {
      this.updateNoiseLayersGUI()
    }
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

    // Update vertex heights
    for (let i = 0; i < heightData.length; i++) {
      vertices[i * 3 + 2] = heightData[i] // Z coordinate (height)
    }

    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()

    // Update height range for terrain material
    const minHeight = Math.min(...heightData)
    const maxHeight = Math.max(...heightData)
    this.terrainMaterial.updateHeightRange(minHeight, maxHeight)
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
      this.generateTerrain()
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