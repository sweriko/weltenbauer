import * as THREE from 'three'

export interface ErosionConfig {
  // Hydraulic erosion
  rainStrength: number
  evaporationRate: number
  sedimentCapacity: number
  depositionRate: number
  erosionStrength: number
  minSlope: number
  gravity: number
  
  // Thermal erosion
  thermalRate: number
  angleOfRepose: number
  
  // Simulation
  iterations: number
  gridSize: number
  dropletLifetime: number
  dropletSpeed: number
  
  // Advanced features
  vegetationProtection: boolean
  riverbedErosion: number
  coastalErosion: boolean
}

interface Droplet {
  x: number
  y: number
  dx: number
  dy: number
  speed: number
  water: number
  sediment: number
  lifetime: number
}

interface TerrainCell {
  height: number
  water: number
  sediment: number
  vegetation: number
  hardness: number
}

export class ErosionSystem {
  private heightData: Float32Array
  private resolution: number
  private terrain: TerrainCell[]
  private config: ErosionConfig
  
  // Cached gradients for performance
  private gradientX: Float32Array
  private gradientY: Float32Array
  
  constructor(config?: Partial<ErosionConfig>) {
    this.config = {
      rainStrength: 0.02,
      evaporationRate: 0.01,
      sedimentCapacity: 4.0,
      depositionRate: 0.3,
      erosionStrength: 0.3,
      minSlope: 0.01,
      gravity: 4.0,
      thermalRate: 0.1,
      angleOfRepose: 35, // degrees
      iterations: 100,
      gridSize: 256,
      dropletLifetime: 30,
      dropletSpeed: 1.0,
      vegetationProtection: false,
      riverbedErosion: 1.5,
      coastalErosion: false,
      ...config
    }
    
    this.heightData = new Float32Array(0)
    this.resolution = 0
    this.terrain = []
    this.gradientX = new Float32Array(0)
    this.gradientY = new Float32Array(0)
  }
  
  public setHeightData(heightData: Float32Array, resolution: number): void {
    this.heightData = heightData.slice() // Copy to avoid modifying original
    this.resolution = resolution
    this.terrain = new Array(resolution * resolution)
    this.gradientX = new Float32Array(resolution * resolution)
    this.gradientY = new Float32Array(resolution * resolution)
    
    // Initialize terrain cells
    for (let i = 0; i < this.terrain.length; i++) {
      this.terrain[i] = {
        height: this.heightData[i],
        water: 0,
        sediment: 0,
        vegetation: this.config.vegetationProtection ? Math.random() * 0.5 : 0,
        hardness: 0.5 + Math.random() * 0.5 // Varying rock hardness
      }
    }
    
    this.calculateGradients()
  }
  
  public applyErosion(): Float32Array {
    console.log('Starting erosion simulation...')
    
    for (let iter = 0; iter < this.config.iterations; iter++) {
      this.hydraulicErosionStep()
      this.thermalErosionStep()
      
      if (iter % 10 === 0) {
        this.calculateGradients()
        console.log(`Erosion progress: ${Math.round((iter / this.config.iterations) * 100)}%`)
      }
    }
    
    // Copy eroded heights back to height data
    for (let i = 0; i < this.terrain.length; i++) {
      this.heightData[i] = this.terrain[i].height
    }
    
    console.log('Erosion simulation complete')
    return this.heightData
  }
  
  private hydraulicErosionStep(): void {
    // Spawn multiple droplets per iteration for better coverage
    const dropletsPerStep = Math.max(1, Math.floor(this.resolution / 4))
    
    for (let d = 0; d < dropletsPerStep; d++) {
      const droplet: Droplet = {
        x: Math.random() * (this.resolution - 1),
        y: Math.random() * (this.resolution - 1),
        dx: 0,
        dy: 0,
        speed: this.config.dropletSpeed,
        water: this.config.rainStrength,
        sediment: 0,
        lifetime: this.config.dropletLifetime
      }
      
      this.simulateDroplet(droplet)
    }
  }
  
  private simulateDroplet(droplet: Droplet): void {
    for (let step = 0; step < droplet.lifetime; step++) {
      const oldHeight = this.sampleHeight(droplet.x, droplet.y)
      
      // Calculate gradient using bilinear interpolation
      const gradient = this.sampleGradient(droplet.x, droplet.y)
      
      // Update velocity
      droplet.dx = droplet.dx * (1 - this.config.evaporationRate) - gradient.x * this.config.gravity
      droplet.dy = droplet.dy * (1 - this.config.evaporationRate) - gradient.y * this.config.gravity
      
      // Normalize and apply speed
      const vel = Math.sqrt(droplet.dx * droplet.dx + droplet.dy * droplet.dy)
      if (vel > 0) {
        droplet.dx = (droplet.dx / vel) * droplet.speed
        droplet.dy = (droplet.dy / vel) * droplet.speed
      }
      
      // Move droplet
      const newX = droplet.x + droplet.dx
      const newY = droplet.y + droplet.dy
      
      // Check bounds
      if (newX < 1 || newX >= this.resolution - 1 || newY < 1 || newY >= this.resolution - 1) {
        break
      }
      
      const newHeight = this.sampleHeight(newX, newY)
      const heightDiff = newHeight - oldHeight
      
      // Calculate sediment capacity
      const slope = Math.max(this.config.minSlope, -heightDiff)
      const capacity = Math.max(0, droplet.speed * droplet.water * slope * this.config.sedimentCapacity)
      
      // Erosion or deposition
      if (droplet.sediment > capacity || heightDiff > 0) {
        // Deposit sediment
        const amountToDeposit = Math.min(droplet.sediment, 
          (droplet.sediment - capacity) * this.config.depositionRate)
        droplet.sediment -= amountToDeposit
        this.depositSediment(droplet.x, droplet.y, amountToDeposit)
      } else {
        // Erode terrain
        const amountToErode = Math.min((capacity - droplet.sediment) * this.config.erosionStrength,
          -heightDiff)
        droplet.sediment += amountToErode
        this.erodeTerrain(droplet.x, droplet.y, amountToErode)
      }
      
      // Update position
      droplet.x = newX
      droplet.y = newY
      
      // Evaporate water
      droplet.water *= (1 - this.config.evaporationRate)
      
      // Speed update based on height change
      droplet.speed = Math.sqrt(droplet.speed * droplet.speed + Math.max(0, -heightDiff) * this.config.gravity)
      
      if (droplet.water < 0.01) break
    }
  }
  
  private thermalErosionStep(): void {
    const maxAngle = Math.tan(this.config.angleOfRepose * Math.PI / 180)
    const tempHeights = new Float32Array(this.resolution * this.resolution)
    
    // Copy current heights
    for (let i = 0; i < this.terrain.length; i++) {
      tempHeights[i] = this.terrain[i].height
    }
    
    for (let y = 1; y < this.resolution - 1; y++) {
      for (let x = 1; x < this.resolution - 1; x++) {
        const index = y * this.resolution + x
        const currentHeight = this.terrain[index].height
        
        let totalDiff = 0
        let neighbors = 0
        
        // Check all 8 neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            
            const neighborIndex = (y + dy) * this.resolution + (x + dx)
            const neighborHeight = this.terrain[neighborIndex].height
            const heightDiff = currentHeight - neighborHeight
            const distance = dx === 0 || dy === 0 ? 1 : Math.sqrt(2)
            const slope = heightDiff / distance
            
            if (slope > maxAngle) {
              totalDiff += heightDiff - (maxAngle * distance)
              neighbors++
            }
          }
        }
        
        if (neighbors > 0) {
          const amountToMove = (totalDiff / neighbors) * this.config.thermalRate
          tempHeights[index] -= amountToMove
        }
      }
    }
    
    // Apply changes
    for (let i = 0; i < this.terrain.length; i++) {
      this.terrain[i].height = tempHeights[i]
    }
  }
  
  private calculateGradients(): void {
    for (let y = 1; y < this.resolution - 1; y++) {
      for (let x = 1; x < this.resolution - 1; x++) {
        const index = y * this.resolution + x
        
        // Sobel operator for gradient calculation
        const heightLeft = this.terrain[y * this.resolution + (x - 1)].height
        const heightRight = this.terrain[y * this.resolution + (x + 1)].height
        const heightUp = this.terrain[(y - 1) * this.resolution + x].height
        const heightDown = this.terrain[(y + 1) * this.resolution + x].height
        
        this.gradientX[index] = (heightRight - heightLeft) * 0.5
        this.gradientY[index] = (heightDown - heightUp) * 0.5
      }
    }
  }
  
  private sampleHeight(x: number, y: number): number {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(x0 + 1, this.resolution - 1)
    const y1 = Math.min(y0 + 1, this.resolution - 1)
    
    const fx = x - x0
    const fy = y - y0
    
    const h00 = this.terrain[y0 * this.resolution + x0].height
    const h10 = this.terrain[y0 * this.resolution + x1].height
    const h01 = this.terrain[y1 * this.resolution + x0].height
    const h11 = this.terrain[y1 * this.resolution + x1].height
    
    // Bilinear interpolation
    return h00 * (1 - fx) * (1 - fy) +
           h10 * fx * (1 - fy) +
           h01 * (1 - fx) * fy +
           h11 * fx * fy
  }
  
  private sampleGradient(x: number, y: number): { x: number, y: number } {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(x0 + 1, this.resolution - 1)
    const y1 = Math.min(y0 + 1, this.resolution - 1)
    
    const fx = x - x0
    const fy = y - y0
    
    const gx00 = this.gradientX[y0 * this.resolution + x0]
    const gx10 = this.gradientX[y0 * this.resolution + x1]
    const gx01 = this.gradientX[y1 * this.resolution + x0]
    const gx11 = this.gradientX[y1 * this.resolution + x1]
    
    const gy00 = this.gradientY[y0 * this.resolution + x0]
    const gy10 = this.gradientY[y0 * this.resolution + x1]
    const gy01 = this.gradientY[y1 * this.resolution + x0]
    const gy11 = this.gradientY[y1 * this.resolution + x1]
    
    return {
      x: gx00 * (1 - fx) * (1 - fy) + gx10 * fx * (1 - fy) + gx01 * (1 - fx) * fy + gx11 * fx * fy,
      y: gy00 * (1 - fx) * (1 - fy) + gy10 * fx * (1 - fy) + gy01 * (1 - fx) * fy + gy11 * fx * fy
    }
  }
  
  private erodeTerrain(x: number, y: number, amount: number): void {
    if (amount <= 0) return
    
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(x0 + 1, this.resolution - 1)
    const y1 = Math.min(y0 + 1, this.resolution - 1)
    
    const fx = x - x0
    const fy = y - y0
    
    // Distribute erosion across 4 nearest cells
    const weights = [
      (1 - fx) * (1 - fy), // 00
      fx * (1 - fy),       // 10
      (1 - fx) * fy,       // 01
      fx * fy              // 11
    ]
    
    const indices = [
      y0 * this.resolution + x0,
      y0 * this.resolution + x1,
      y1 * this.resolution + x0,
      y1 * this.resolution + x1
    ]
    
    for (let i = 0; i < 4; i++) {
      const cell = this.terrain[indices[i]]
      const erosionAmount = amount * weights[i] * cell.hardness
      
      // Apply vegetation protection
      const protection = this.config.vegetationProtection ? cell.vegetation : 0
      const actualErosion = erosionAmount * (1 - protection * 0.7)
      
      cell.height -= actualErosion
    }
  }
  
  private depositSediment(x: number, y: number, amount: number): void {
    if (amount <= 0) return
    
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(x0 + 1, this.resolution - 1)
    const y1 = Math.min(y0 + 1, this.resolution - 1)
    
    const fx = x - x0
    const fy = y - y0
    
    // Distribute deposition across 4 nearest cells
    const weights = [
      (1 - fx) * (1 - fy), // 00
      fx * (1 - fy),       // 10
      (1 - fx) * fy,       // 01
      fx * fy              // 11
    ]
    
    const indices = [
      y0 * this.resolution + x0,
      y0 * this.resolution + x1,
      y1 * this.resolution + x0,
      y1 * this.resolution + x1
    ]
    
    for (let i = 0; i < 4; i++) {
      this.terrain[indices[i]].height += amount * weights[i]
    }
  }
  
  public updateConfig(newConfig: Partial<ErosionConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }
  
  public getConfig(): ErosionConfig {
    return { ...this.config }
  }
  
  // Advanced erosion patterns
  public createRiverErosion(startX: number, startY: number, endX: number, endY: number): void {
    const steps = 100
    const riverWidth = 3
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = startX + (endX - startX) * t
      const y = startY + (endY - startY) * t
      
      // Create wider erosion along river path
      for (let dx = -riverWidth; dx <= riverWidth; dx++) {
        for (let dy = -riverWidth; dy <= riverWidth; dy++) {
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance <= riverWidth) {
            const erosionStrength = (1 - distance / riverWidth) * this.config.riverbedErosion
            this.erodeTerrain(x + dx, y + dy, erosionStrength)
          }
        }
      }
    }
  }
  
  public getWaterFlow(): Float32Array {
    const waterFlow = new Float32Array(this.resolution * this.resolution)
    
    for (let i = 0; i < this.terrain.length; i++) {
      waterFlow[i] = this.terrain[i].water
    }
    
    return waterFlow
  }
  
  public getSedimentMap(): Float32Array {
    const sedimentMap = new Float32Array(this.resolution * this.resolution)
    
    for (let i = 0; i < this.terrain.length; i++) {
      sedimentMap[i] = this.terrain[i].sediment
    }
    
    return sedimentMap
  }
} 