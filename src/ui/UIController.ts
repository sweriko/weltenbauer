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
    const noiseScaleSlider = document.getElementById('noiseScale') as HTMLInputElement
    const amplitudeSlider = document.getElementById('amplitude') as HTMLInputElement
    const octavesSlider = document.getElementById('octaves') as HTMLInputElement
    const seedInput = document.getElementById('seed') as HTMLInputElement
    const randomizeSeedBtn = document.getElementById('randomizeSeed') as HTMLButtonElement

    terrainSizeSlider.addEventListener('input', () => {
      const value = parseFloat(terrainSizeSlider.value)
      this.terrainBuilder.updateConfig({ size: value })
      this.updateValueDisplay('terrainSizeValue', `${value} km`)
    })

    noiseScaleSlider.addEventListener('input', () => {
      const value = parseFloat(noiseScaleSlider.value)
      this.terrainBuilder.updateConfig({ noiseScale: value })
      this.updateValueDisplay('noiseScaleValue', value.toFixed(3))
    })

    amplitudeSlider.addEventListener('input', () => {
      const value = parseFloat(amplitudeSlider.value)
      this.terrainBuilder.updateConfig({ amplitude: value })
      this.updateValueDisplay('amplitudeValue', `${value}m`)
    })

    octavesSlider.addEventListener('input', () => {
      const value = parseInt(octavesSlider.value)
      this.terrainBuilder.updateConfig({ octaves: value })
      this.updateValueDisplay('octavesValue', value.toString())
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

  private updateUI(): void {
    const config = this.terrainBuilder.getConfig()
    
    // Update sliders to match current config
    const terrainSizeSlider = document.getElementById('terrainSize') as HTMLInputElement
    const noiseScaleSlider = document.getElementById('noiseScale') as HTMLInputElement
    const amplitudeSlider = document.getElementById('amplitude') as HTMLInputElement
    const octavesSlider = document.getElementById('octaves') as HTMLInputElement
    const seedInput = document.getElementById('seed') as HTMLInputElement

    terrainSizeSlider.value = config.size.toString()
    noiseScaleSlider.value = config.noiseScale.toString()
    amplitudeSlider.value = config.amplitude.toString()
    octavesSlider.value = config.octaves.toString()
    seedInput.value = config.seed.toString()

    // Update value displays
    this.updateValueDisplay('terrainSizeValue', `${config.size} km`)
    this.updateValueDisplay('noiseScaleValue', config.noiseScale.toFixed(3))
    this.updateValueDisplay('amplitudeValue', `${config.amplitude}m`)
    this.updateValueDisplay('octavesValue', config.octaves.toString())
    this.updateValueDisplay('seedValue', config.seed.toString())

    // Update brush displays
    const brushSettings = this.terrainBuilder.getBrushSystem().getBrushSettings()
    const brushSizeSlider = document.getElementById('brushSize') as HTMLInputElement
    const brushStrengthSlider = document.getElementById('brushStrength') as HTMLInputElement

    if (brushSizeSlider) {
      brushSizeSlider.value = brushSettings.size.toString()
      this.updateValueDisplay('brushSizeValue', `${brushSettings.size}m`)
    }

    if (brushStrengthSlider) {
      brushStrengthSlider.value = brushSettings.strength.toString()
      this.updateValueDisplay('brushStrengthValue', brushSettings.strength.toString())
    }

    // Update grid toggle
    const gridToggle = document.getElementById('gridToggle') as HTMLInputElement
    if (gridToggle) {
      gridToggle.checked = this.terrainBuilder.isGridVisible()
    }
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