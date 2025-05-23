import * as THREE from 'three'

export interface AdvancedErosionConfig {
  // Hydraulic erosion - based on real geomorphology
  streamPowerLaw: {
    incisionConstant: number    // K in stream power law
    areaExponent: number        // m in stream power law (typically 0.4-0.6)
    slopeExponent: number       // n in stream power law (typically 0.8-1.2)
    criticalDrainage: number    // minimum drainage area for stream formation
  }
  
  // Diffusion processes (hillslope erosion)
  diffusion: {
    soilDiffusivity: number     // soil creep rate
    thermalDiffusivity: number  // bedrock thermal erosion
    criticalSlope: number       // angle of repose for mass wasting
  }
  
  // Sediment transport
  sedimentTransport: {
    grainSizes: number[]        // different grain size classes
    transportCapacity: number   // Hjulström-Sundborg curve scaling
    depositionRate: number      // deposition coefficient
    abrasionRate: number        // sediment size reduction during transport
  }
  
  // Tectonic processes
  tectonics: {
    upliftRate: number          // uniform uplift rate (mm/year scaled)
    upliftPattern: 'uniform' | 'dome' | 'ridge' | 'random'
    faultLines: Array<{x1: number, y1: number, x2: number, y2: number, offset: number}>
  }
  
  // Environmental factors
  climate: {
    precipitation: number       // affects erosion rates
    temperature: number         // affects weathering rates
    vegetationCover: number     // vegetation protection factor
    seasonality: number         // seasonal variation in erosion
  }
  
  // Advanced features
  advanced: {
    enableMeandering: boolean   // river meandering simulation
    enableMassWasting: boolean  // landslide simulation
    enableGlacialErosion: boolean
    enableChemicalWeathering: boolean
    enableKnickpointMigration: boolean
    timeStep: number           // years per iteration
    totalTime: number          // total simulation time
  }
  
  // Rock properties
  lithology: {
    hardness: number[]         // rock hardness map
    jointSpacing: number[]     // fracture density
    solubility: number[]       // chemical weathering susceptibility
  }
}

interface DrainageCell {
  elevation: number
  drainageArea: number
  discharge: number
  velocity: number
  sedimentLoad: number[]      // for different grain sizes
  flowDirection: {x: number, y: number}
  streamPower: number
  isChannel: boolean
  bankHeight: number
  meanderAge: number
}

interface GeomorphologyState {
  elevation: Float32Array
  drainageArea: Float32Array
  flowDirection: Float32Array  // stored as angle
  streamPower: Float32Array
  sedimentThickness: Float32Array
  rockHardness: Float32Array
  vegetationCover: Float32Array
  temperature: Float32Array
  timeEvolved: number
}

export class AdvancedErosionSystem {
  private state: GeomorphologyState
  private config: AdvancedErosionConfig
  private resolution: number
  private cellSize: number
  private drainage: DrainageCell[]
  
  // Cached data for performance
  private flowAccumulation: Float32Array
  private knickpoints: Array<{x: number, y: number, elevation: number}>
  private riverNetwork: Array<Array<{x: number, y: number}>>
  
  constructor(config?: Partial<AdvancedErosionConfig>) {
    this.config = {
      streamPowerLaw: {
        incisionConstant: 1e-6,
        areaExponent: 0.5,
        slopeExponent: 1.0,
        criticalDrainage: 1000
      },
      diffusion: {
        soilDiffusivity: 0.01,
        thermalDiffusivity: 0.001,
        criticalSlope: 35 * Math.PI / 180  // radians
      },
      sedimentTransport: {
        grainSizes: [0.1, 1.0, 10.0, 100.0], // mm
        transportCapacity: 1.0,
        depositionRate: 0.1,
        abrasionRate: 0.001
      },
      tectonics: {
        upliftRate: 0.1, // mm/year scaled
        upliftPattern: 'uniform',
        faultLines: []
      },
      climate: {
        precipitation: 1000, // mm/year
        temperature: 15,     // °C
        vegetationCover: 0.5,
        seasonality: 0.2
      },
      advanced: {
        enableMeandering: true,
        enableMassWasting: true,
        enableGlacialErosion: false,
        enableChemicalWeathering: true,
        enableKnickpointMigration: true,
        timeStep: 100,  // years
        totalTime: 10000 // years
      },
      lithology: {
        hardness: [],
        jointSpacing: [],
        solubility: []
      },
      ...config
    }
    
    this.resolution = 0
    this.cellSize = 0
    this.drainage = []
    this.knickpoints = []
    this.riverNetwork = []
    
    this.state = {
      elevation: new Float32Array(0),
      drainageArea: new Float32Array(0),
      flowDirection: new Float32Array(0),
      streamPower: new Float32Array(0),
      sedimentThickness: new Float32Array(0),
      rockHardness: new Float32Array(0),
      vegetationCover: new Float32Array(0),
      temperature: new Float32Array(0),
      timeEvolved: 0
    }
    
    this.flowAccumulation = new Float32Array(0)
  }
  
  public setHeightData(heightData: Float32Array, resolution: number, realWorldSize: number): void {
    this.resolution = resolution
    this.cellSize = realWorldSize / resolution
    
    // Initialize state
    const numCells = resolution * resolution
    this.state.elevation = heightData.slice()
    this.state.drainageArea = new Float32Array(numCells)
    this.state.flowDirection = new Float32Array(numCells)
    this.state.streamPower = new Float32Array(numCells)
    this.state.sedimentThickness = new Float32Array(numCells)
    this.state.timeEvolved = 0
    
    // Initialize rock properties
    this.initializeLithology()
    
    // Initialize drainage network
    this.drainage = new Array(numCells)
    for (let i = 0; i < numCells; i++) {
      this.drainage[i] = {
        elevation: this.state.elevation[i],
        drainageArea: 0,
        discharge: 0,
        velocity: 0,
        sedimentLoad: new Array(this.config.sedimentTransport.grainSizes.length).fill(0),
        flowDirection: {x: 0, y: 0},
        streamPower: 0,
        isChannel: false,
        bankHeight: 0,
        meanderAge: 0
      }
    }
    
    this.flowAccumulation = new Float32Array(numCells)
    
    // Calculate initial flow patterns
    this.calculateFlowAccumulation()
    this.identifyChannels()
  }
  
  private initializeLithology(): void {
    const numCells = this.resolution * this.resolution
    
    if (this.config.lithology.hardness.length === 0) {
      // Generate realistic rock hardness variation
      this.state.rockHardness = new Float32Array(numCells)
      for (let i = 0; i < numCells; i++) {
        // Add some spatial correlation to hardness
        const y = Math.floor(i / this.resolution)
        const x = i % this.resolution
        const noise1 = this.perlinNoise(x * 0.01, y * 0.01, 42)
        const noise2 = this.perlinNoise(x * 0.05, y * 0.05, 123)
        this.state.rockHardness[i] = 0.3 + 0.4 * noise1 + 0.3 * noise2
      }
    }
    
    // Initialize vegetation based on elevation and slope
    this.state.vegetationCover = new Float32Array(numCells)
    for (let i = 0; i < numCells; i++) {
      const elevation = this.state.elevation[i]
      const slope = this.calculateLocalSlope(i)
      
      // Vegetation decreases with elevation and slope
      let vegCover = this.config.climate.vegetationCover
      vegCover *= Math.max(0, 1 - elevation / 1000) // treeline effect
      vegCover *= Math.max(0.1, 1 - slope / (45 * Math.PI / 180)) // slope effect
      
      this.state.vegetationCover[i] = Math.max(0, Math.min(1, vegCover))
    }
    
    // Initialize temperature based on elevation (lapse rate)
    this.state.temperature = new Float32Array(numCells)
    for (let i = 0; i < numCells; i++) {
      const elevation = this.state.elevation[i]
      // 6.5°C per 1000m lapse rate
      this.state.temperature[i] = this.config.climate.temperature - (elevation * 6.5 / 1000)
    }
  }
  
  public applyAdvancedErosion(): Float32Array {
    console.log('Starting advanced geomorphological simulation...')
    
    const iterations = Math.floor(this.config.advanced.totalTime / this.config.advanced.timeStep)
    
    for (let iter = 0; iter < iterations; iter++) {
      // Apply tectonic uplift first
      this.applyTectonicUplift()
      
      // Recalculate flow patterns
      this.calculateFlowAccumulation()
      this.identifyChannels()
      
      // Stream power erosion (main channel incision)
      this.applyStreamPowerErosion()
      
      // Hillslope diffusion
      this.applyHillslopeDiffusion()
      
      // Chemical weathering
      if (this.config.advanced.enableChemicalWeathering) {
        this.applyChemicalWeathering()
      }
      
      // Mass wasting
      if (this.config.advanced.enableMassWasting) {
        this.applyMassWasting()
      }
      
      // River meandering
      if (this.config.advanced.enableMeandering) {
        this.applyRiverMeandering()
      }
      
      // Knickpoint migration
      if (this.config.advanced.enableKnickpointMigration) {
        this.migrateKnickpoints()
      }
      
      // Sediment transport and deposition
      this.simulateSedimentTransport()
      
      this.state.timeEvolved += this.config.advanced.timeStep
      
      if (iter % 10 === 0) {
        const progress = Math.round((iter / iterations) * 100)
        console.log(`Geomorphological evolution: ${progress}% (${this.state.timeEvolved} years)`)
      }
    }
    
    console.log(`Simulation complete: ${this.state.timeEvolved} years of evolution`)
    return this.state.elevation
  }
  
  private calculateFlowAccumulation(): void {
    // D8 flow direction algorithm
    const dirs = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1]
    ]
    
    // Reset flow accumulation
    this.flowAccumulation.fill(1) // each cell contributes 1 unit
    this.state.drainageArea.fill(this.cellSize * this.cellSize)
    
    // Create sorted list of cells by elevation (highest first)
    const cellsWithElevation = []
    for (let i = 0; i < this.state.elevation.length; i++) {
      cellsWithElevation.push({index: i, elevation: this.state.elevation[i]})
    }
    cellsWithElevation.sort((a, b) => b.elevation - a.elevation)
    
    // Process cells from highest to lowest
    for (const cell of cellsWithElevation) {
      const idx = cell.index
      const y = Math.floor(idx / this.resolution)
      const x = idx % this.resolution
      
      let steepestSlope = 0
      let steepestDir = -1
      
      // Find steepest downhill direction
      for (let d = 0; d < dirs.length; d++) {
        const nx = x + dirs[d][0]
        const ny = y + dirs[d][1]
        
        if (nx >= 0 && nx < this.resolution && ny >= 0 && ny < this.resolution) {
          const nIdx = ny * this.resolution + nx
          const slope = (this.state.elevation[idx] - this.state.elevation[nIdx]) / 
                       (this.cellSize * Math.sqrt(dirs[d][0]*dirs[d][0] + dirs[d][1]*dirs[d][1]))
          
          if (slope > steepestSlope) {
            steepestSlope = slope
            steepestDir = d
          }
        }
      }
      
      // Route flow to steepest neighbor
      if (steepestDir >= 0) {
        const nx = x + dirs[steepestDir][0]
        const ny = y + dirs[steepestDir][1]
        const nIdx = ny * this.resolution + nx
        
        this.flowAccumulation[nIdx] += this.flowAccumulation[idx]
        this.state.drainageArea[nIdx] += this.state.drainageArea[idx]
        
        // Store flow direction
        this.state.flowDirection[idx] = steepestDir
        this.drainage[idx].flowDirection = {
          x: dirs[steepestDir][0], 
          y: dirs[steepestDir][1]
        }
      }
    }
  }
  
  private identifyChannels(): void {
    for (let i = 0; i < this.drainage.length; i++) {
      this.drainage[i].isChannel = this.state.drainageArea[i] > this.config.streamPowerLaw.criticalDrainage
      
      if (this.drainage[i].isChannel) {
        // Calculate discharge using simple runoff model
        const precipitationRate = this.config.climate.precipitation / (365 * 24 * 3600) // m/s
        this.drainage[i].discharge = this.state.drainageArea[i] * precipitationRate
      }
    }
  }
  
  private applyStreamPowerErosion(): void {
    for (let i = 0; i < this.state.elevation.length; i++) {
      if (!this.drainage[i].isChannel) continue
      
      const area = this.state.drainageArea[i]
      const slope = this.calculateLocalSlope(i)
      
      if (slope <= 0) continue
      
      // Stream power law: E = K * A^m * S^n
      const K = this.config.streamPowerLaw.incisionConstant * this.state.rockHardness[i]
      const m = this.config.streamPowerLaw.areaExponent
      const n = this.config.streamPowerLaw.slopeExponent
      
      const streamPower = K * Math.pow(area, m) * Math.pow(slope, n)
      this.state.streamPower[i] = streamPower
      
      // Apply climate and vegetation effects
      const climateMultiplier = this.config.climate.precipitation / 1000 // normalize to 1000mm baseline
      const vegetationProtection = 1 - this.state.vegetationCover[i] * 0.8
      
      const erosionRate = streamPower * climateMultiplier * vegetationProtection * this.config.advanced.timeStep
      
      this.state.elevation[i] -= erosionRate
      this.drainage[i].elevation = this.state.elevation[i]
    }
  }
  
  private applyHillslopeDiffusion(): void {
    const newElevation = this.state.elevation.slice()
    
    for (let y = 1; y < this.resolution - 1; y++) {
      for (let x = 1; x < this.resolution - 1; x++) {
        const idx = y * this.resolution + x
        const slope = this.calculateLocalSlope(idx)
        
        // Soil diffusion (creep)
        let diffusivity = this.config.diffusion.soilDiffusivity
        
        // Add vegetation effect on soil stability
        diffusivity *= (1 - this.state.vegetationCover[idx] * 0.5)
        
        // Add temperature effect (freeze-thaw cycles)
        if (this.state.temperature[idx] < 5) {
          diffusivity *= 1.5 // increased weathering in cold climates
        }
        
        // Thermal erosion for steep slopes
        if (slope > this.config.diffusion.criticalSlope) {
          diffusivity += this.config.diffusion.thermalDiffusivity * 
                        (slope - this.config.diffusion.criticalSlope)
        }
        
        // Apply diffusion using finite difference
        const neighbors = [
          this.state.elevation[idx - this.resolution], // up
          this.state.elevation[idx + this.resolution], // down  
          this.state.elevation[idx - 1],               // left
          this.state.elevation[idx + 1]                // right
        ]
        
        const laplacian = neighbors.reduce((sum, h) => sum + h, 0) - 4 * this.state.elevation[idx]
        newElevation[idx] += diffusivity * laplacian * this.config.advanced.timeStep / (this.cellSize * this.cellSize)
      }
    }
    
    this.state.elevation = newElevation
  }
  
  private applyChemicalWeathering(): void {
    for (let i = 0; i < this.state.elevation.length; i++) {
      const temperature = this.state.temperature[i]
      const precipitation = this.config.climate.precipitation
      
      // Arrhenius equation for temperature dependence
      const temperatureEffect = Math.exp((temperature - 15) / 10)
      
      // Precipitation effect
      const precipitationEffect = Math.min(2.0, precipitation / 1000)
      
      // Rock solubility (limestone weathers faster than granite)
      const rockSolubility = this.state.rockHardness[i] < 0.5 ? 2.0 : 0.5
      
      const weatheringRate = 1e-8 * temperatureEffect * precipitationEffect * rockSolubility * this.config.advanced.timeStep
      
      this.state.elevation[i] -= weatheringRate
      
      // Vegetation growth responds to weathering (soil formation)
      if (weatheringRate > 0) {
        this.state.vegetationCover[i] = Math.min(1.0, this.state.vegetationCover[i] + weatheringRate * 1000)
      }
    }
  }
  
  private applyMassWasting(): void {
    const criticalSlope = 35 * Math.PI / 180 // 35 degrees
    
    for (let i = 0; i < this.state.elevation.length; i++) {
      const slope = this.calculateLocalSlope(i)
      
      if (slope > criticalSlope) {
        const y = Math.floor(i / this.resolution)
        const x = i % this.resolution
        
        // Find steepest downhill direction
        const flowDir = this.drainage[i].flowDirection
        const targetX = x + flowDir.x
        const targetY = y + flowDir.y
        
        if (targetX >= 0 && targetX < this.resolution && targetY >= 0 && targetY < this.resolution) {
          const targetIdx = targetY * this.resolution + targetX
          
          // Calculate landslide volume based on slope excess
          const slopeExcess = slope - criticalSlope
          const landslideVolume = slopeExcess * this.cellSize * this.cellSize * 0.1
          
          // Reduce vegetation cover due to landslide
          this.state.vegetationCover[i] *= 0.5
          
          // Transfer material
          this.state.elevation[i] -= landslideVolume / (this.cellSize * this.cellSize)
          this.state.elevation[targetIdx] += landslideVolume / (this.cellSize * this.cellSize) * 0.8 // some material lost
        }
      }
    }
  }
  
  private applyTectonicUplift(): void {
    const upliftRate = this.config.tectonics.upliftRate * this.config.advanced.timeStep / 1000 // convert mm to m
    
    for (let i = 0; i < this.state.elevation.length; i++) {
      let uplift = upliftRate
      
      switch (this.config.tectonics.upliftPattern) {
        case 'dome':
          const centerX = this.resolution / 2
          const centerY = this.resolution / 2
          const x = i % this.resolution
          const y = Math.floor(i / this.resolution)
          const distFromCenter = Math.sqrt((x - centerX)**2 + (y - centerY)**2) / (this.resolution / 2)
          uplift *= Math.max(0, 1 - distFromCenter)
          break
          
        case 'ridge':
          const ridgeY = this.resolution / 2
          const currentY = Math.floor(i / this.resolution)
          const distFromRidge = Math.abs(currentY - ridgeY) / (this.resolution / 2)
          uplift *= Math.max(0, 1 - distFromRidge)
          break
          
        case 'random':
          uplift *= (0.5 + Math.random())
          break
      }
      
      this.state.elevation[i] += uplift
    }
    
    // Apply fault lines
    for (const fault of this.config.tectonics.faultLines) {
      this.applyFaultOffset(fault)
    }
  }
  
  private applyFaultOffset(fault: {x1: number, y1: number, x2: number, y2: number, offset: number}): void {
    // Simple fault implementation - more complex faulting would require proper geometric analysis
    const dx = fault.x2 - fault.x1
    const dy = fault.y2 - fault.y1
    const length = Math.sqrt(dx*dx + dy*dy)
    
    for (let i = 0; i < this.state.elevation.length; i++) {
      const x = i % this.resolution
      const y = Math.floor(i / this.resolution)
      
      // Distance from point to line
      const distToFault = Math.abs((dy * x - dx * y + fault.x2 * fault.y1 - fault.y2 * fault.x1)) / length
      
      if (distToFault < 5) { // within 5 cells of fault
        // Determine which side of fault the point is on
        const crossProduct = (x - fault.x1) * dy - (y - fault.y1) * dx
        const offset = crossProduct > 0 ? fault.offset : -fault.offset
        
        this.state.elevation[i] += offset * this.config.advanced.timeStep / 1000
      }
    }
  }
  
  private applyRiverMeandering(): void {
    // Simplified meandering - real meandering is extremely complex
    for (let i = 0; i < this.drainage.length; i++) {
      if (!this.drainage[i].isChannel) continue
      
      const discharge = this.drainage[i].discharge
      if (discharge < 1.0) continue // only large rivers meander significantly
      
      this.drainage[i].meanderAge += this.config.advanced.timeStep
      
      // Simple lateral erosion model
      if (this.drainage[i].meanderAge > 1000) { // rivers take time to establish meanders
        const y = Math.floor(i / this.resolution)
        const x = i % this.resolution
        
        // Random walk for simplicity (real meandering follows complex hydrodynamics)
        const lateralDir = Math.random() > 0.5 ? 1 : -1
        const perpX = -this.drainage[i].flowDirection.y * lateralDir
        const perpY = this.drainage[i].flowDirection.x * lateralDir
        
        const targetX = x + perpX
        const targetY = y + perpY
        
        if (targetX >= 0 && targetX < this.resolution && targetY >= 0 && targetY < this.resolution) {
          const targetIdx = targetY * this.resolution + targetX
          const erosionAmount = discharge * 1e-8 * this.config.advanced.timeStep
          
          this.state.elevation[targetIdx] -= erosionAmount
          this.drainage[i].bankHeight += erosionAmount * 0.5
        }
      }
    }
  }
  
  private migrateKnickpoints(): void {
    // Identify and migrate knickpoints (waterfalls, rapids)
    // This is a simplified version - real knickpoint migration is complex
    
    for (let i = 0; i < this.drainage.length; i++) {
      if (!this.drainage[i].isChannel) continue
      
      const slope = this.calculateLocalSlope(i)
      if (slope > 0.1) { // steep section that could be a knickpoint
        // Migrate knickpoint upstream
        const migrationRate = this.state.streamPower[i] * 1e-6 * this.config.advanced.timeStep
        
        // Find upstream cells and erode them
        for (let j = 0; j < this.drainage.length; j++) {
          const flowDir = this.state.flowDirection[j]
          const y = Math.floor(j / this.resolution)
          const x = j % this.resolution
          
          // Check if this cell flows to our knickpoint
          const dirs = [
            [-1, -1], [0, -1], [1, -1],
            [-1,  0],          [1,  0],
            [-1,  1], [0,  1], [1,  1]
          ]
          
          if (flowDir >= 0 && flowDir < dirs.length) {
            const targetX = x + dirs[flowDir][0]
            const targetY = y + dirs[flowDir][1]
            const targetIdx = targetY * this.resolution + targetX
            
            if (targetIdx === i) {
              this.state.elevation[j] -= migrationRate
            }
          }
        }
      }
    }
  }
  
  private simulateSedimentTransport(): void {
    // Multi-grain size sediment transport
    for (let i = 0; i < this.drainage.length; i++) {
      if (!this.drainage[i].isChannel) continue
      
      const velocity = Math.sqrt(this.drainage[i].discharge / (this.cellSize * 1.0)) // simplified velocity
      
      for (let grainIdx = 0; grainIdx < this.config.sedimentTransport.grainSizes.length; grainIdx++) {
        const grainSize = this.config.sedimentTransport.grainSizes[grainIdx]
        
        // Hjulström-Sundborg curve approximation
        const criticalVelocity = this.calculateCriticalVelocity(grainSize)
        
        if (velocity > criticalVelocity) {
          // Entrainment
          const entrainmentRate = (velocity - criticalVelocity) * 0.001 * this.config.advanced.timeStep
          this.drainage[i].sedimentLoad[grainIdx] += entrainmentRate
          this.state.elevation[i] -= entrainmentRate / 10 // remove eroded material
        } else if (velocity < criticalVelocity * 0.5) {
          // Deposition
          const depositionAmount = this.drainage[i].sedimentLoad[grainIdx] * this.config.sedimentTransport.depositionRate
          this.drainage[i].sedimentLoad[grainIdx] -= depositionAmount
          this.state.elevation[i] += depositionAmount / 10
          this.state.sedimentThickness[i] += depositionAmount / 10
        }
        
        // Abrasion during transport
        this.drainage[i].sedimentLoad[grainIdx] *= (1 - this.config.sedimentTransport.abrasionRate)
      }
    }
  }
  
  private calculateCriticalVelocity(grainSize: number): number {
    // Simplified Hjulström-Sundborg relationship
    if (grainSize < 0.1) return 0.1 // clay particles stick together
    return 0.01 * Math.sqrt(grainSize) // simplified empirical relationship
  }
  
  private calculateLocalSlope(index: number): number {
    const y = Math.floor(index / this.resolution)
    const x = index % this.resolution
    
    if (x === 0 || x === this.resolution - 1 || y === 0 || y === this.resolution - 1) {
      return 0
    }
    
    const dzdx = (this.state.elevation[index + 1] - this.state.elevation[index - 1]) / (2 * this.cellSize)
    const dzdy = (this.state.elevation[index + this.resolution] - this.state.elevation[index - this.resolution]) / (2 * this.cellSize)
    
    return Math.sqrt(dzdx * dzdx + dzdy * dzdy)
  }
  
  private perlinNoise(x: number, y: number, seed: number): number {
    // Simple noise function for procedural generation
    let value = 0
    let amplitude = 1
    let frequency = 1
    
    for (let i = 0; i < 4; i++) {
      value += amplitude * Math.sin(frequency * x + seed) * Math.cos(frequency * y + seed * 2)
      amplitude *= 0.5
      frequency *= 2
    }
    
    return (value + 1) / 2 // normalize to [0,1]
  }
  
  public updateConfig(newConfig: Partial<AdvancedErosionConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }
  
  public getConfig(): AdvancedErosionConfig {
    return { ...this.config }
  }
  
  public getErosionResults() {
    return {
      elevation: this.state.elevation,
      drainageArea: this.state.drainageArea,
      streamPower: this.state.streamPower,
      sedimentThickness: this.state.sedimentThickness,
      vegetationCover: this.state.vegetationCover,
      timeEvolved: this.state.timeEvolved,
      riverNetwork: this.riverNetwork,
      knickpoints: this.knickpoints
    }
  }
  
  // Specialized erosion patterns
  public simulateGlacialErosion(): void {
    // Placeholder for glacial erosion - extremely complex process
    console.log('Glacial erosion simulation not yet implemented')
  }
  
  public createRealisticRiverNetwork(): void {
    // Build realistic dendritic drainage networks
    this.riverNetwork = []
    
    for (let i = 0; i < this.drainage.length; i++) {
      if (this.drainage[i].isChannel && this.state.drainageArea[i] > this.config.streamPowerLaw.criticalDrainage * 2) {
        const river = this.traceRiverPath(i)
        if (river.length > 10) {
          this.riverNetwork.push(river)
        }
      }
    }
  }
  
  private traceRiverPath(startIndex: number): Array<{x: number, y: number}> {
    const path = []
    let currentIndex = startIndex
    
    while (currentIndex >= 0 && currentIndex < this.drainage.length) {
      const y = Math.floor(currentIndex / this.resolution)
      const x = currentIndex % this.resolution
      path.push({x, y})
      
      // Follow flow direction
      const flowDir = this.state.flowDirection[currentIndex]
      if (flowDir < 0) break
      
      const dirs = [
        [-1, -1], [0, -1], [1, -1],
        [-1,  0],          [1,  0],
        [-1,  1], [0,  1], [1,  1]
      ]
      
      const nextX = x + dirs[flowDir][0]
      const nextY = y + dirs[flowDir][1]
      
      if (nextX < 0 || nextX >= this.resolution || nextY < 0 || nextY >= this.resolution) break
      
      currentIndex = nextY * this.resolution + nextX
      
      if (path.length > 1000) break // prevent infinite loops
    }
    
    return path
  }
} 