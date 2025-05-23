import { TerrainBuilder } from './core/TerrainBuilder'
import { UIController } from './ui/UIController'

class App {
  private terrainBuilder: TerrainBuilder
  private uiController: UIController

  constructor() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement
    if (!canvas) {
      throw new Error('Canvas element not found')
    }

    this.terrainBuilder = new TerrainBuilder(canvas)
    this.uiController = new UIController(this.terrainBuilder)
    
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