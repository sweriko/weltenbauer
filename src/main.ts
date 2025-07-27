import { TerrainBuilder } from './core/TerrainBuilder'
import { UIController } from './ui/UIController'

class App {
  private terrainBuilder: TerrainBuilder
  // @ts-ignore - UI controller instance needed for initialization
  private _uiController: UIController // UI controller for terrain manipulation interface

  constructor() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement
    if (!canvas) {
      throw new Error('Canvas element not found')
    }

    this.terrainBuilder = new TerrainBuilder(canvas)
    this._uiController = new UIController(this.terrainBuilder)
    
    // Connect UI controller to terrain builder for noise layers management
    this.terrainBuilder.setUIController(this._uiController)
    
    this.init()
  }

  private init(): void {
    // Handle window resize
    window.addEventListener('resize', () => {
      this.terrainBuilder.resize()
    })

    // Initial terrain generation
    this.terrainBuilder.generateTerrain()
    
    console.log('Weltbuilder initialized')
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App()
}) 