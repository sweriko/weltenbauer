import { TerrainBuilder, EditorMode } from '../core/TerrainBuilder'
import { BrushMode } from '../core/BrushSystem'

export class UIController {
  private terrainBuilder: TerrainBuilder
  private canvas: HTMLCanvasElement

  constructor(terrainBuilder: TerrainBuilder) {
    this.terrainBuilder = terrainBuilder
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement
    
    this.setupEventListeners()
    this.updateUI()
  }

  private setupEventListeners(): void {
    // Mode switching
    this.setupModeControls()
    
    // Terrain generation controls
    const terrainSizeSlider = document.getElementById('terrainSize') as HTMLInputElement
    const geologicalComplexitySlider = document.getElementById('geologicalComplexity') as HTMLInputElement
    const domainWarpingSlider = document.getElementById('domainWarping') as HTMLInputElement
    const reliefAmplitudeSlider = document.getElementById('reliefAmplitude') as HTMLInputElement
    const featureScaleSlider = document.getElementById('featureScale') as HTMLInputElement
    const seedInput = document.getElementById('seed') as HTMLInputElement
    const randomizeSeedBtn = document.getElementById('randomizeSeed') as HTMLButtonElement

    terrainSizeSlider.addEventListener('input', () => {
      const value = parseFloat(terrainSizeSlider.value)
      this.terrainBuilder.updateConfig({ size: value })
      this.updateValueDisplay('terrainSizeValue', `${value} km`)
    })

    geologicalComplexitySlider.addEventListener('input', () => {
      const value = parseFloat(geologicalComplexitySlider.value)
      this.terrainBuilder.updateConfig({ geologicalComplexity: value })
      this.updateValueDisplay('geologicalComplexityValue', value.toFixed(1))
    })

    domainWarpingSlider.addEventListener('input', () => {
      const value = parseFloat(domainWarpingSlider.value)
      this.terrainBuilder.updateConfig({ domainWarping: value })
      this.updateValueDisplay('domainWarpingValue', value.toFixed(2))
    })

    reliefAmplitudeSlider.addEventListener('input', () => {
      const value = parseFloat(reliefAmplitudeSlider.value)
      this.terrainBuilder.updateConfig({ reliefAmplitude: value })
      this.updateValueDisplay('reliefAmplitudeValue', `${value.toFixed(1)}x`)
    })

    featureScaleSlider.addEventListener('input', () => {
      const value = parseFloat(featureScaleSlider.value)
      this.terrainBuilder.updateConfig({ featureScale: value })
      this.updateValueDisplay('featureScaleValue', `${value.toFixed(1)}x`)
    })

    seedInput.addEventListener('input', () => {
      const value = parseInt(seedInput.value)
      if (!isNaN(value)) {
        this.terrainBuilder.updateConfig({ seed: value })
        this.updateValueDisplay('seedValue', value.toString())
      }
    })

    randomizeSeedBtn.addEventListener('click', () => {
      this.terrainBuilder.randomizeSeed()
      const newSeed = this.terrainBuilder.getConfig().seed
      seedInput.value = newSeed.toString()
      this.updateValueDisplay('seedValue', newSeed.toString())
    })

    // Brush controls
    const brushModes = document.querySelectorAll('.brush-mode')
    const brushSizeSlider = document.getElementById('brushSize') as HTMLInputElement
    const brushStrengthSlider = document.getElementById('brushStrength') as HTMLInputElement

    brushModes.forEach(mode => {
      mode.addEventListener('click', () => {
        brushModes.forEach(m => m.classList.remove('active'))
        mode.classList.add('active')
        
        const brushMode = mode.getAttribute('data-mode') as BrushMode
        this.terrainBuilder.getBrushSystem().setBrushSettings({ mode: brushMode })
      })
    })

    brushSizeSlider.addEventListener('input', () => {
      const value = parseFloat(brushSizeSlider.value)
      this.terrainBuilder.getBrushSystem().setBrushSettings({ size: value })
      this.updateValueDisplay('brushSizeValue', `${value}m`)
    })

    brushStrengthSlider.addEventListener('input', () => {
      const value = parseFloat(brushStrengthSlider.value)
      this.terrainBuilder.getBrushSystem().setBrushSettings({ strength: value })
      this.updateValueDisplay('brushStrengthValue', value.toString())
    })

    // Mountain preset controls
    const alaskanPresetBtn = document.getElementById('alaskanPreset') as HTMLButtonElement
    const desertMountainPresetBtn = document.getElementById('desertMountainPreset') as HTMLButtonElement

    alaskanPresetBtn.addEventListener('click', () => {
      this.terrainBuilder.getBrushSystem().applyMountainPreset('alaskan')
      this.updateBrushUI()
    })

    desertMountainPresetBtn.addEventListener('click', () => {
      this.terrainBuilder.getBrushSystem().applyMountainPreset('desert')
      this.updateBrushUI()
    })

    // Export controls
    const exportHeightmapBtn = document.getElementById('exportHeightmap') as HTMLButtonElement
    const exportProjectBtn = document.getElementById('exportProject') as HTMLButtonElement

    exportHeightmapBtn.addEventListener('click', () => {
      this.exportHeightmap()
    })

    exportProjectBtn.addEventListener('click', () => {
      this.exportProject()
    })

    // Grid toggle control
    const gridToggle = document.getElementById('gridToggle') as HTMLInputElement
    gridToggle.addEventListener('change', () => {
      this.terrainBuilder.toggleGrid(gridToggle.checked)
    })

    // Erosion controls
    this.setupErosionControls()

    // Canvas mouse events for brush system
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

  private setupModeControls(): void {
    // Create mode toggle button if it doesn't exist
    let modeToggle = document.getElementById('modeToggle') as HTMLButtonElement
    if (!modeToggle) {
      modeToggle = document.createElement('button')
      modeToggle.id = 'modeToggle'
      modeToggle.style.position = 'absolute'
      modeToggle.style.top = '10px'
      modeToggle.style.right = '320px'
      modeToggle.style.padding = '10px 20px'
      modeToggle.style.background = '#0066cc'
      modeToggle.style.color = 'white'
      modeToggle.style.border = 'none'
      modeToggle.style.borderRadius = '6px'
      modeToggle.style.cursor = 'pointer'
      modeToggle.style.fontSize = '14px'
      modeToggle.style.fontWeight = 'bold'
      modeToggle.style.zIndex = '1000'
      modeToggle.textContent = 'Mode: Orbit'
      
      document.body.appendChild(modeToggle)
    }

    modeToggle.addEventListener('click', () => {
      const currentMode = this.terrainBuilder.getMode()
      const newMode: EditorMode = currentMode === 'orbit' ? 'brush' : 'orbit'
      
      this.terrainBuilder.setMode(newMode)
      modeToggle.textContent = `Mode: ${newMode.charAt(0).toUpperCase() + newMode.slice(1)}`
      
      if (newMode === 'orbit') {
        modeToggle.style.background = '#0066cc'
      } else {
        modeToggle.style.background = '#cc6600'
      }
    })
  }

  private updateValueDisplay(elementId: string, value: string): void {
    const element = document.getElementById(elementId)
    if (element) {
      element.textContent = value
    }
  }

  private updateBrushUI(): void {
    const settings = this.terrainBuilder.getBrushSystem().getBrushSettings()
    
    // Update brush mode buttons
    const brushModes = document.querySelectorAll('.brush-mode')
    brushModes.forEach(mode => {
      mode.classList.remove('active')
      if (mode.getAttribute('data-mode') === settings.mode) {
        mode.classList.add('active')
      }
    })
    
    // Update sliders
    const brushSizeSlider = document.getElementById('brushSize') as HTMLInputElement
    const brushStrengthSlider = document.getElementById('brushStrength') as HTMLInputElement
    
    if (brushSizeSlider) {
      brushSizeSlider.value = settings.size.toString()
      this.updateValueDisplay('brushSizeValue', `${settings.size}m`)
    }
    
    if (brushStrengthSlider) {
      brushStrengthSlider.value = settings.strength.toString()
      this.updateValueDisplay('brushStrengthValue', settings.strength.toString())
    }
  }

  private setupErosionControls(): void {
    // Erosion preset buttons
    const gentleErosionBtn = document.getElementById('gentleErosion') as HTMLButtonElement

    // Custom erosion controls
    const erosionIterationsSlider = document.getElementById('erosionIterations') as HTMLInputElement
    const rainStrengthSlider = document.getElementById('rainStrength') as HTMLInputElement
    const erosionStrengthSlider = document.getElementById('erosionStrength') as HTMLInputElement
    const thermalRateSlider = document.getElementById('thermalRate') as HTMLInputElement
    const applyCustomErosionBtn = document.getElementById('applyCustomErosion') as HTMLButtonElement

    // River creation controls
    const createRiverBtn = document.getElementById('createRiver') as HTMLButtonElement

    // Preset erosion buttons
    gentleErosionBtn?.addEventListener('click', () => {
      this.terrainBuilder.applyGentleErosion()
    })

    // Custom erosion sliders
    erosionIterationsSlider?.addEventListener('input', () => {
      const value = parseInt(erosionIterationsSlider.value)
      this.updateValueDisplay('erosionIterationsValue', value.toString())
    })

    rainStrengthSlider?.addEventListener('input', () => {
      const value = parseFloat(rainStrengthSlider.value)
      this.updateValueDisplay('rainStrengthValue', value.toFixed(3))
    })

    erosionStrengthSlider?.addEventListener('input', () => {
      const value = parseFloat(erosionStrengthSlider.value)
      this.updateValueDisplay('erosionStrengthValue', value.toFixed(2))
    })

    thermalRateSlider?.addEventListener('input', () => {
      const value = parseFloat(thermalRateSlider.value)
      this.updateValueDisplay('thermalRateValue', value.toFixed(2))
    })

    // Apply custom erosion
    applyCustomErosionBtn?.addEventListener('click', () => {
      const config = {
        iterations: erosionIterationsSlider ? parseInt(erosionIterationsSlider.value) : 100,
        rainStrength: rainStrengthSlider ? parseFloat(rainStrengthSlider.value) : 0.02,
        erosionStrength: erosionStrengthSlider ? parseFloat(erosionStrengthSlider.value) : 0.3,
        thermalRate: thermalRateSlider ? parseFloat(thermalRateSlider.value) : 0.1
      }
      this.terrainBuilder.applyErosion(config)
    })

    // River creation - simplified version using center points
    createRiverBtn?.addEventListener('click', () => {
      // Create a river from one side to another as an example
      const size = this.terrainBuilder.getConfig().size * 1000
      const startX = -size * 0.3
      const startY = size * 0.2
      const endX = size * 0.3
      const endY = -size * 0.2
      
      this.terrainBuilder.createRiver(startX, startY, endX, endY)
    })

    // Initialize erosion UI values
    this.updateErosionUI()
  }

  private updateErosionUI(): void {
    const config = this.terrainBuilder.getErosionConfig()
    
    // Update slider values
    const erosionIterationsSlider = document.getElementById('erosionIterations') as HTMLInputElement
    const rainStrengthSlider = document.getElementById('rainStrength') as HTMLInputElement
    const erosionStrengthSlider = document.getElementById('erosionStrength') as HTMLInputElement
    const thermalRateSlider = document.getElementById('thermalRate') as HTMLInputElement

    if (erosionIterationsSlider) {
      erosionIterationsSlider.value = config.iterations.toString()
      this.updateValueDisplay('erosionIterationsValue', config.iterations.toString())
    }

    if (rainStrengthSlider) {
      rainStrengthSlider.value = config.rainStrength.toString()
      this.updateValueDisplay('rainStrengthValue', config.rainStrength.toFixed(3))
    }

    if (erosionStrengthSlider) {
      erosionStrengthSlider.value = config.erosionStrength.toString()
      this.updateValueDisplay('erosionStrengthValue', config.erosionStrength.toFixed(2))
    }

    if (thermalRateSlider) {
      thermalRateSlider.value = config.thermalRate.toString()
      this.updateValueDisplay('thermalRateValue', config.thermalRate.toFixed(2))
    }
  }

  private updateUI(): void {
    const config = this.terrainBuilder.getConfig()
    
    // Update terrain generation controls
    const terrainSizeSlider = document.getElementById('terrainSize') as HTMLInputElement
    const geologicalComplexitySlider = document.getElementById('geologicalComplexity') as HTMLInputElement
    const domainWarpingSlider = document.getElementById('domainWarping') as HTMLInputElement
    const reliefAmplitudeSlider = document.getElementById('reliefAmplitude') as HTMLInputElement
    const featureScaleSlider = document.getElementById('featureScale') as HTMLInputElement
    const seedInput = document.getElementById('seed') as HTMLInputElement
    const gridToggle = document.getElementById('gridToggle') as HTMLInputElement

    if (terrainSizeSlider) {
      terrainSizeSlider.value = config.size.toString()
      this.updateValueDisplay('terrainSizeValue', `${config.size} km`)
    }

    if (geologicalComplexitySlider) {
      geologicalComplexitySlider.value = config.geologicalComplexity.toString()
      this.updateValueDisplay('geologicalComplexityValue', config.geologicalComplexity.toFixed(1))
    }

    if (domainWarpingSlider) {
      domainWarpingSlider.value = config.domainWarping.toString()
      this.updateValueDisplay('domainWarpingValue', config.domainWarping.toFixed(2))
    }

    if (reliefAmplitudeSlider) {
      reliefAmplitudeSlider.value = config.reliefAmplitude.toString()
      this.updateValueDisplay('reliefAmplitudeValue', `${config.reliefAmplitude.toFixed(1)}x`)
    }

    if (featureScaleSlider) {
      featureScaleSlider.value = config.featureScale.toString()
      this.updateValueDisplay('featureScaleValue', `${config.featureScale.toFixed(1)}x`)
    }

    if (seedInput) {
      seedInput.value = config.seed.toString()
      this.updateValueDisplay('seedValue', config.seed.toString())
    }

    if (gridToggle) {
      gridToggle.checked = this.terrainBuilder.isGridVisible()
    }

    // Update brush controls
    this.updateBrushUI()
    
    // Update erosion controls
    this.updateErosionUI()
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
} 