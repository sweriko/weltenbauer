import * as THREE from 'three'
import { OrbitControls } from 'three-stdlib'
import { TerrainGenerator } from './TerrainGenerator'
import { BrushSystem } from './BrushSystem'

export interface TerrainConfig {
  size: number // Size in kilometers
  resolution: number // Vertices per side
  noiseScale: number
  amplitude: number
  octaves: number
  seed: number
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
  private brushSystem: BrushSystem
  private gridHelper: THREE.GridHelper | null = null
  
  private mode: EditorMode = 'orbit'
  private noisePreviewCanvas: HTMLCanvasElement
  
  private config: TerrainConfig = {
    size: 5, // 5km
    resolution: 256, // Reduced for better performance
    noiseScale: 0.02,
    amplitude: 50,
    octaves: 4,
    seed: Math.floor(Math.random() * 1000000)
  }

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
    this.brushSystem = new BrushSystem()
    
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

    // Generate noise for preview
    for (let y = 0; y < 150; y++) {
      for (let x = 0; x < 150; x++) {
        const nx = (x - 75) / 75  // Scale to [-1, 1]
        const ny = (y - 75) / 75  // Scale to [-1, 1]
        
        let height = 0
        let frequency = this.config.noiseScale
        let maxValue = 0
        
        for (let i = 0; i < this.config.octaves; i++) {
          const octaveAmplitude = Math.pow(0.5, i)
          // Use same improved scaling as terrain generation
          const noiseValue = this.terrainGenerator.sampleNoise(nx * frequency * 8 + i * 100, ny * frequency * 8 + i * 137)
          height += noiseValue * octaveAmplitude
          maxValue += octaveAmplitude
          frequency *= 2
        }
        
        height = (height / maxValue) * this.config.amplitude
        
        // Apply island falloff with same parameters as terrain
        const distance = Math.sqrt(nx * nx + ny * ny)
        const falloff = Math.max(0, 1 - Math.pow(distance * 0.7, 3))
        height *= falloff
        
        const normalized = Math.max(0, Math.min(1, (height + this.config.amplitude) / (this.config.amplitude * 2)))
        const value = Math.floor(normalized * 255)
        
        const index = (y * 150 + x) * 4
        data[index] = value
        data[index + 1] = value
        data[index + 2] = value
        data[index + 3] = 255
      }
    }
    
    ctx.putImageData(imageData, 0, 0)
  }

  public generateTerrain(): void {
    // Remove existing terrain
    if (this.terrain) {
      this.scene.remove(this.terrain)
      this.terrain.geometry.dispose()
      if (Array.isArray(this.terrain.material)) {
        this.terrain.material.forEach((mat: THREE.Material) => mat.dispose())
      } else {
        (this.terrain.material as THREE.Material).dispose()
      }
    }

    // Update terrain generator seed
    this.terrainGenerator.setSeed(this.config.seed)

    // Generate heightmap
    const heightData = this.terrainGenerator.generateHeightmap(
      this.config.resolution,
      this.config.noiseScale,
      this.config.amplitude,
      this.config.octaves
    )

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

    // Create vertex colors for height-based shading
    const colors = new Float32Array(vertices.length)
    const minHeight = Math.min(...heightData)
    const maxHeight = Math.max(...heightData)
    
    for (let i = 0; i < heightData.length; i++) {
      const normalizedHeight = (heightData[i] - minHeight) / (maxHeight - minHeight)
      const grayValue = normalizedHeight * 0.8 + 0.2 // Range from 0.2 to 1.0 for better contrast
      
      colors[i * 3] = grayValue     // R
      colors[i * 3 + 1] = grayValue // G
      colors[i * 3 + 2] = grayValue // B
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
    this.terrain.receiveShadow = true
    this.scene.add(this.terrain)

    // Update brush system
    this.brushSystem.setTerrain(this.terrain, heightData, this.config.resolution)
    
    // Force initial color update in brush system
    this.brushSystem.updateTerrainColors()
    
    // Update noise preview
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
    this.config = { ...this.config, ...newConfig }
    
    // Auto-regenerate terrain when config changes
    this.generateTerrain()
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
    this.generateTerrain()
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate)
    
    this.controls.update()
    this.brushSystem.update(this.camera)
    
    this.renderer.render(this.scene, this.camera)
  }

  public dispose(): void {
    document.body.removeChild(this.noisePreviewCanvas)
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
} 