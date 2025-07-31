import { GUI } from 'lil-gui'
import { TerrainBuilder, EditorMode } from '../core/TerrainBuilder'
import { BrushMode } from '../core/BrushSystem'
import { ProgressOverlay } from './ProgressOverlay'

export class UIController {
  private terrainBuilder: TerrainBuilder
  private canvas: HTMLCanvasElement
  private gui!: GUI
  private modeToggleButton!: HTMLButtonElement
  private noiseLayersFolder: any = null
  private updateTimeout: number | null = null
  private progressOverlay: ProgressOverlay

  // UI state objects for lil-gui
  private terrainParams = {
    size: 5,
    resolution: 256,
    geologicalComplexity: 1.0,
    domainWarping: 0.5,
    reliefAmplitude: 2.0,
    featureScale: 1.5,
    seed: 123456,
    showGrid: true,
    randomizeSeed: () => this.randomizeSeed(),
    testHighRes: () => this.testHighResolution()
  }

  private brushParams = {
    mode: 'raise' as BrushMode,
    size: 10,
    strength: 0.5
  }

  private mountainPresets = {
    alaskanEverest: () => this.applyMountainPreset('alaskan'),
    nevadaNewMexico: () => this.applyMountainPreset('desert')
  }

  private erosionPresets = {
    gentleRain: () => this.applyGentleErosion(),
    strongErosion: () => this.applyStrongErosion(),
    dramaticErosion: () => this.applyDramaticErosion(),
    createRiver: () => this.createRiver()
  }

  private exportActions = {
    exportHeightmap: () => this.exportHeightmap(),
    exportProject: () => this.exportProject()
  }

  private guideInfo = {
    orbitControls: "Drag to rotate, wheel to zoom",
    brushControls: "Click and drag to sculpt terrain",
    modeSwitch: "Use the Mode button (top-left) to switch between Orbit and Brush modes",
    terrainTips: "Adjust geological parameters for different terrain types",
    brushTips: "Different brush modes: Raise/Lower for height, Smooth for blending, Flatten for plateaus",
    presetTips: "Mountain presets apply specialized large-scale brushes - switch to Brush mode first"
  }

  constructor(terrainBuilder: TerrainBuilder) {
    this.terrainBuilder = terrainBuilder
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement
    this.progressOverlay = new ProgressOverlay()
    
    this.setupModeToggle()
    this.setupGUI()
    this.setupCanvasEvents()
    this.syncUIWithTerrain()
  }

  private setupModeToggle(): void {
    this.modeToggleButton = document.createElement('button')
    this.modeToggleButton.style.position = 'absolute'
    this.modeToggleButton.style.top = '50px'
    this.modeToggleButton.style.left = '10px'
    this.modeToggleButton.style.padding = '10px 20px'
    this.modeToggleButton.style.background = '#0066cc'
    this.modeToggleButton.style.color = 'white'
    this.modeToggleButton.style.border = 'none'
    this.modeToggleButton.style.borderRadius = '6px'
    this.modeToggleButton.style.cursor = 'pointer'
    this.modeToggleButton.style.fontSize = '14px'
    this.modeToggleButton.style.fontWeight = 'bold'
    this.modeToggleButton.style.zIndex = '1000'
    this.modeToggleButton.textContent = 'Mode: Orbit'
    
    document.body.appendChild(this.modeToggleButton)

    this.modeToggleButton.addEventListener('click', () => {
      const currentMode = this.terrainBuilder.getMode()
      const newMode: EditorMode = currentMode === 'orbit' ? 'brush' : 'orbit'
      
      this.terrainBuilder.setMode(newMode)
      this.modeToggleButton.textContent = `Mode: ${newMode.charAt(0).toUpperCase() + newMode.slice(1)}`
      
      if (newMode === 'orbit') {
        this.modeToggleButton.style.background = '#0066cc'
      } else {
        this.modeToggleButton.style.background = '#cc6600'
      }
    })
  }

  private setupGUI(): void {
    this.gui = new GUI({ title: 'Weltbuilder Controls', width: 320 })
    
    // Position GUI flush with right edge
    this.gui.domElement.style.position = 'fixed'
    this.gui.domElement.style.top = '0px'
    this.gui.domElement.style.right = '0px'
    
    // Terrain Generation folder
    const terrainFolder = this.gui.addFolder('Terrain Generation')
    
    terrainFolder.add(this.terrainParams, 'size', 1, 20, 1)
      .name('Size (km)')
      .onChange((value: number) => {
        this.terrainBuilder.updateConfig({ size: value })
      })

    // Resolution controls with performance info
    const resolutionOptions = {
      '64x64 (4K vertices)': 64,
      '128x128 (16K vertices)': 128,
      '256x256 (66K vertices)': 256,
      '512x512 (262K vertices)': 512,
      '1024x1024 (1M vertices)': 1024,
      '2048x2048 (4.2M vertices)': 2048,
      '4096x4096 (16.8M vertices)': 4096
    }

    terrainFolder.add(this.terrainParams, 'resolution', resolutionOptions)
      .name('🔧 Resolution')
      .onChange((value: number) => {
        console.log(`Setting resolution to ${value}x${value}`)
        this.terrainBuilder.setResolution(value)
        this.updateResolutionInfo(value)
      })

    // Test high resolution button
    terrainFolder.add(this.terrainParams, 'testHighRes')
      .name('🧪 Test High Resolution')

    terrainFolder.add(this.terrainParams, 'geologicalComplexity', 0.0, 2.0, 0.1)
      .name('Geological Complexity')
      .onChange((value: number) => {
        this.terrainBuilder.updateConfig({ geologicalComplexity: value })
      })

    terrainFolder.add(this.terrainParams, 'domainWarping', 0.0, 1.0, 0.05)
      .name('Domain Warping')
      .onChange((value: number) => {
        this.terrainBuilder.updateConfig({ domainWarping: value })
      })

    terrainFolder.add(this.terrainParams, 'reliefAmplitude', 0.2, 4.0, 0.1)
      .name('Relief Amplitude')
      .onChange((value: number) => {
        this.terrainBuilder.updateConfig({ reliefAmplitude: value })
      })

    terrainFolder.add(this.terrainParams, 'featureScale', 0.1, 3.0, 0.1)
      .name('Feature Scale')
      .onChange((value: number) => {
        this.terrainBuilder.updateConfig({ featureScale: value })
      })

    terrainFolder.add(this.terrainParams, 'seed')
      .name('Seed')
      .onChange((value: number) => {
        this.terrainBuilder.updateConfig({ seed: value })
      })

    terrainFolder.add(this.terrainParams, 'randomizeSeed')
      .name('🎲 Randomize Seed')

    terrainFolder.add(this.terrainParams, 'showGrid')
      .name('Show Grid')
      .onChange((value: boolean) => {
        this.terrainBuilder.toggleGrid(value)
      })

    terrainFolder.open()

    // Brush Tools folder
    const brushFolder = this.gui.addFolder('Brush Tools')
    
    brushFolder.add(this.brushParams, 'mode', ['raise', 'lower', 'smooth', 'flatten', 'mountain'])
      .name('Brush Mode')
      .onChange((value: BrushMode) => {
        this.terrainBuilder.getBrushSystem().setBrushSettings({ mode: value })
      })

    brushFolder.add(this.brushParams, 'size', 1, 500, 1)
      .name('Brush Size (m)')
      .onChange((value: number) => {
        this.terrainBuilder.getBrushSystem().setBrushSettings({ size: value })
      })

    brushFolder.add(this.brushParams, 'strength', 0.1, 2.0, 0.1)
      .name('Brush Strength')
      .onChange((value: number) => {
        this.terrainBuilder.getBrushSystem().setBrushSettings({ strength: value })
      })

    brushFolder.open()

    // Mountain Presets folder
    const mountainFolder = this.gui.addFolder('Mountain Presets')
    
    mountainFolder.add(this.mountainPresets, 'alaskanEverest')
      .name('🏔️ Alaskan/Everest')
    
    mountainFolder.add(this.mountainPresets, 'nevadaNewMexico')
      .name('🏜️ Nevada/New Mexico')

    // Erosion Presets folder
    const erosionFolder = this.gui.addFolder('Erosion Presets')
    
    erosionFolder.add(this.erosionPresets, 'gentleRain')
      .name('🌧️ Gentle Rain')
    
    erosionFolder.add(this.erosionPresets, 'createRiver')
      .name('🏞️ Create River')

    // Export folder
    const exportFolder = this.gui.addFolder('Export')
    
    exportFolder.add(this.exportActions, 'exportHeightmap')
      .name('Export Heightmap')
    
    exportFolder.add(this.exportActions, 'exportProject')
      .name('Export Project')

    // Guide folder (collapsed by default)
    const guideFolder = this.gui.addFolder('Guide')
    
    // Add guide items as read-only text controllers
    guideFolder.add(this.guideInfo, 'orbitControls')
      .name('🔄 Orbit Mode')
      .disable()
    
    guideFolder.add(this.guideInfo, 'brushControls')
      .name('🖌️ Brush Mode')
      .disable()
    
    guideFolder.add(this.guideInfo, 'modeSwitch')
      .name('🔀 Mode Switching')
      .disable()
    
    guideFolder.add(this.guideInfo, 'terrainTips')
      .name('🏔️ Terrain Tips')
      .disable()
    
    guideFolder.add(this.guideInfo, 'brushTips')
      .name('🎨 Brush Tips')
      .disable()
    
    guideFolder.add(this.guideInfo, 'presetTips')
      .name('📦 Preset Tips')
      .disable()
    
    // Keep guide folder closed by default
    guideFolder.close()
    
    // Setup noise layers folder
    this.setupNoiseLayersFolder()
  }

  private setupNoiseLayersFolder(): void {
    // Only create if it doesn't exist
    if (!this.noiseLayersFolder) {
      this.noiseLayersFolder = this.gui.addFolder('Noise Layers')
      // Populate it with initial data
      this.populateNoiseLayersFolder()
    }
  }

  private populateNoiseLayersFolder(): void {
    if (!this.noiseLayersFolder) return
    
    // Get layers data from terrain builder
    const layersData = this.terrainBuilder.getNoiseLayersData()
    const { layers, baseLayers } = layersData
    
    // Create controls for each layer
    this.createLayerControls(layers, baseLayers)
    
    // Add management controls
    this.addLayerManagementControls(layers)
    
    this.noiseLayersFolder.open()
  }

  private updateNoiseLayersFolder(): void {
    // Destroy and recreate the entire folder to avoid duplicates
    if (this.noiseLayersFolder) {
      try {
        // Try to destroy the folder completely
        this.noiseLayersFolder.destroy()
      } catch (e) {
        // If destroy doesn't work, try to clear manually
        console.log('Manual cleanup of noise layers folder')
      }
    }
    
    // Always recreate the folder fresh
    this.noiseLayersFolder = this.gui.addFolder('Noise Layers')
    
    // Get fresh layers data
    const layersData = this.terrainBuilder.getNoiseLayersData()
    const { layers, baseLayers } = layersData
    
    // Create controls for each layer
    this.createLayerControls(layers, baseLayers)
    
    // Add management controls
    this.addLayerManagementControls(layers)
    
    this.noiseLayersFolder.open()
  }

  private createLayerControls(layers: any[], baseLayers: any[]): void {
    layers.forEach((layer: any, index: number) => {
      const isCustomLayer = index >= baseLayers.length
      const layerName = `${index + 1}. ${layer.type.toUpperCase()}${isCustomLayer ? ' (Custom)' : ''}`
      
      const folder = this.noiseLayersFolder.addFolder(layerName)
      
      // Weight controller
      const weightControl = {
        weight: Math.round(layer.weight * 100)
      }
      
      folder.add(weightControl, 'weight', 0, 100, 1)
        .name('Weight %')
        .onChange((value: number) => {
          console.log(`Layer ${index} weight changed to ${value}%`)
          this.terrainBuilder.updateLayerWeight(index, value / 100, false)
        })
      
      // Add preview canvas to folder
      const previewContainer = document.createElement('div')
      previewContainer.style.padding = '8px'
      
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 120
      canvas.style.width = '120px'
      canvas.style.height = '120px'
      canvas.style.border = '1px solid #666'
      canvas.style.borderRadius = '4px'
      canvas.style.background = '#222'
      canvas.style.display = 'block'
      canvas.style.margin = '0 auto'
      
      this.terrainBuilder.generateLayerPreview(canvas, layer)
      
      previewContainer.appendChild(canvas)
      folder.domElement.appendChild(previewContainer)
      
      // Remove button for custom layers
      if (isCustomLayer) {
        const removeControl = {
          remove: () => {
            this.terrainBuilder.removeLayer(index)
            this.updateNoiseLayersGUI() // Use the debounced version
          }
        }
        folder.add(removeControl, 'remove').name('🗑️ Remove Layer')
      }
      
      folder.open()
    })
  }

  private addLayerManagementControls(layers: any[]): void {
    // Add layer button
    const addLayerControl = {
      addLayer: () => this.terrainBuilder.showAddLayerDialog()
    }
    this.noiseLayersFolder.add(addLayerControl, 'addLayer').name('➕ Add Layer')
    
    // Weight summary
    const totalWeight = layers.reduce((sum: number, layer: any) => sum + layer.weight, 0)
    const summaryControl = {
      totalWeight: `${(totalWeight * 100).toFixed(1)}%`
    }
    this.noiseLayersFolder.add(summaryControl, 'totalWeight').name('Total Weight').disable()
  }

  public updateNoiseLayersGUI(): void {
    // Debounce multiple rapid calls to prevent duplicates
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
    }
    
    this.updateTimeout = setTimeout(() => {
      this.updateNoiseLayersFolder()
      this.updateTimeout = null
    }, 50) // Small delay to batch updates
  }

  private setupCanvasEvents(): void {
    this.canvas.addEventListener('mousedown', (event) => {
      this.terrainBuilder.getBrushSystem().handleMouseDown(
        event,
        this.terrainBuilder.getCamera(),
        this.canvas
      )
    })

    this.canvas.addEventListener('mousemove', (event) => {
      this.terrainBuilder.getBrushSystem().handleMouseMove(
        event,
        this.terrainBuilder.getCamera(),
        this.canvas
      )
    })

    this.canvas.addEventListener('mouseup', () => {
      this.terrainBuilder.getBrushSystem().handleMouseUp()
    })
  }

  private syncUIWithTerrain(): void {
    const config = this.terrainBuilder.getConfig()
    
    // Update terrain params
    this.terrainParams.size = config.size
    this.terrainParams.resolution = config.resolution
    this.terrainParams.geologicalComplexity = config.geologicalComplexity
    this.terrainParams.domainWarping = config.domainWarping
    this.terrainParams.reliefAmplitude = config.reliefAmplitude
    this.terrainParams.featureScale = config.featureScale
    this.terrainParams.seed = config.seed
    this.terrainParams.showGrid = this.terrainBuilder.isGridVisible()

    // Update brush params
    const brushSettings = this.terrainBuilder.getBrushSystem().getBrushSettings()
    this.brushParams.mode = brushSettings.mode
    this.brushParams.size = brushSettings.size
    this.brushParams.strength = brushSettings.strength

    // Refresh GUI to show updated values
    this.updateGUIDisplay()
  }

  private randomizeSeed(): void {
    this.terrainBuilder.randomizeSeed()
    const newSeed = this.terrainBuilder.getConfig().seed
    this.terrainParams.seed = newSeed
    this.updateGUIDisplay()
  }

  private applyMountainPreset(preset: 'alaskan' | 'desert'): void {
    this.terrainBuilder.getBrushSystem().applyMountainPreset(preset)
    this.syncBrushUI()
  }

  private applyGentleErosion(): void {
    this.terrainBuilder.applyGentleErosion()
  }

  private applyStrongErosion(): void {
    this.terrainBuilder.applyStrongErosion()
  }

  private applyDramaticErosion(): void {
    this.terrainBuilder.applyDramaticErosion()
  }

  private createRiver(): void {
    const size = this.terrainBuilder.getConfig().size * 1000
    const startX = -size * 0.3
    const startY = size * 0.2
    const endX = size * 0.3
    const endY = -size * 0.2
    
    this.terrainBuilder.createRiver(startX, startY, endX, endY)
  }

  private syncBrushUI(): void {
    const settings = this.terrainBuilder.getBrushSystem().getBrushSettings()
    this.brushParams.mode = settings.mode
    this.brushParams.size = settings.size
    this.brushParams.strength = settings.strength
    this.updateGUIDisplay()
  }

  private exportHeightmap(): void {
    try {
      const dataUrl = this.terrainBuilder.exportHeightmap()
      this.downloadFile(dataUrl, 'heightmap.png')
    } catch (error) {
      console.error('Failed to export heightmap:', error)
      alert('Failed to export heightmap. Please try again.')
    }
  }

  private exportProject(): void {
    try {
      const projectData = this.terrainBuilder.exportProject()
      const blob = new Blob([projectData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      this.downloadFile(url, 'terrain-project.json')
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export project:', error)
      alert('Failed to export project. Please try again.')
    }
  }

  private downloadFile(url: string, filename: string): void {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  private updateGUIDisplay(): void {
    // Update all controllers in all folders
    this.gui.controllersRecursive().forEach(controller => {
      controller.updateDisplay()
    })
  }

  private updateResolutionInfo(resolution: number): void {
    // Calculate performance estimates
    const vertices = resolution * resolution
    let memoryMB: string
    let timeEstimate: string
    let chunkSize: number

    if (resolution <= 256) {
      memoryMB = "~1MB"
      timeEstimate = "<1s"
      chunkSize = 256
    } else if (resolution <= 512) {
      memoryMB = "~4MB"
      timeEstimate = "1-3s"
      chunkSize = 128
    } else if (resolution <= 1024) {
      memoryMB = "~16MB"
      timeEstimate = "3-8s"
      chunkSize = 64
    } else if (resolution <= 2048) {
      memoryMB = "~64MB"
      timeEstimate = "10-25s"
      chunkSize = 32
    } else {
      memoryMB = "~256MB"
      timeEstimate = "30-90s"
      chunkSize = 32
    }

    console.log(`Resolution ${resolution}x${resolution}:`)
    console.log(`- Vertices: ${vertices.toLocaleString()}`)
    console.log(`- Memory: ${memoryMB}`)
    console.log(`- Generation time: ${timeEstimate}`)
    console.log(`- Chunk size: ${chunkSize}x${chunkSize}`)
    
    // Show warning for very high resolutions
    if (resolution >= 2048) {
      console.warn(`⚠️ High resolution detected! This may take ${timeEstimate} to generate.`)
    }
  }

  private async testHighResolution(): Promise<void> {
    console.log('🧪 Testing high resolution terrain generation...')
    
    try {
      // Test with 1024x1024 resolution
      const success = await this.terrainBuilder.testHighResolution(1024)
      
      if (success) {
        console.log('✅ High resolution test passed! You can safely use higher resolutions.')
        alert('✅ High resolution test passed!\n\nYour system can handle high resolution terrain generation without stack overflow errors.')
      } else {
        console.log('❌ High resolution test failed.')
        alert('❌ High resolution test failed.\n\nPlease check the console for error details.')
      }
    } catch (error) {
      console.error('Test failed with error:', error)
      alert('❌ Test failed with error. Check console for details.')
    }
  }

  public getProgressOverlay(): ProgressOverlay {
    return this.progressOverlay
  }
} 