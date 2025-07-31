export interface ProgressTask {
  id: string
  title: string
  description?: string
  progress: number
  isComplete: boolean
  startTime: number
}

export class ProgressOverlay {
  private overlay!: HTMLDivElement
  private container!: HTMLDivElement
  private tasks: Map<string, ProgressTask> = new Map()
  private isVisible: boolean = false

  constructor() {
    this.createOverlay()
  }

  private createOverlay(): void {
    // Create main overlay
    this.overlay = document.createElement('div')
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: none;
      z-index: 10000;
      align-items: center;
      justify-content: center;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `

    // Create progress container
    this.container = document.createElement('div')
    this.container.style.cssText = `
      background: linear-gradient(135deg, #2a2a2a 0%, #1e1e1e 100%);
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      min-width: 400px;
      max-width: 500px;
      color: white;
    `

    this.overlay.appendChild(this.container)
    document.body.appendChild(this.overlay)
  }

  public startTask(id: string, title: string, description?: string): void {
    const task: ProgressTask = {
      id,
      title,
      description,
      progress: 0,
      isComplete: false,
      startTime: Date.now()
    }

    this.tasks.set(id, task)
    this.show()
    this.render()
  }

  public updateTask(id: string, progress: number, description?: string): void {
    const task = this.tasks.get(id)
    if (!task) return

    task.progress = Math.max(0, Math.min(100, progress))
    if (description) task.description = description
    
    this.render()
  }

  public completeTask(id: string): void {
    const task = this.tasks.get(id)
    if (!task) return

    task.progress = 100
    task.isComplete = true
    this.render()

    // Auto-hide after a short delay if this was the last task
    setTimeout(() => {
      this.tasks.delete(id)
      if (this.tasks.size === 0) {
        this.hide()
      } else {
        this.render()
      }
    }, 1000)
  }

  public cancelTask(id: string): void {
    this.tasks.delete(id)
    if (this.tasks.size === 0) {
      this.hide()
    } else {
      this.render()
    }
  }

  private show(): void {
    if (!this.isVisible) {
      this.isVisible = true
      this.overlay.style.display = 'flex'
      
      // Smooth fade-in animation
      this.overlay.style.opacity = '0'
      this.container.style.transform = 'scale(0.9) translateY(20px)'
      
      requestAnimationFrame(() => {
        this.overlay.style.transition = 'opacity 0.3s ease'
        this.container.style.transition = 'transform 0.3s ease'
        this.overlay.style.opacity = '1'
        this.container.style.transform = 'scale(1) translateY(0)'
      })
    }
  }

  private hide(): void {
    if (this.isVisible) {
      this.isVisible = false
      
      // Smooth fade-out animation
      this.overlay.style.transition = 'opacity 0.3s ease'
      this.container.style.transition = 'transform 0.3s ease'
      this.overlay.style.opacity = '0'
      this.container.style.transform = 'scale(0.9) translateY(20px)'
      
      setTimeout(() => {
        this.overlay.style.display = 'none'
      }, 300)
    }
  }

  private render(): void {
    if (!this.isVisible) return

    this.container.innerHTML = ''

    // Header
    const header = document.createElement('div')
    header.style.cssText = `
      text-align: center;
      margin-bottom: 24px;
    `
    
    const title = document.createElement('h2')
    title.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 600;
      color: #ffffff;
    `
    title.textContent = 'Processing Terrain'
    
    const subtitle = document.createElement('p')
    subtitle.style.cssText = `
      margin: 0;
      font-size: 14px;
      color: #cccccc;
    `
    subtitle.textContent = 'Please wait while the terrain is being processed...'
    
    header.appendChild(title)
    header.appendChild(subtitle)
    this.container.appendChild(header)

    // Render each task
    this.tasks.forEach(task => {
      const taskElement = this.createTaskElement(task)
      this.container.appendChild(taskElement)
    })
  }

  private createTaskElement(task: ProgressTask): HTMLDivElement {
    const taskDiv = document.createElement('div')
    taskDiv.style.cssText = `
      margin-bottom: 20px;
    `

    // Task title and status
    const titleRow = document.createElement('div')
    titleRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `

    const taskTitle = document.createElement('span')
    taskTitle.style.cssText = `
      font-size: 16px;
      font-weight: 500;
      color: #ffffff;
    `
    taskTitle.textContent = task.title

    const taskStatus = document.createElement('span')
    taskStatus.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: ${task.isComplete ? '#4CAF50' : '#2196F3'};
    `
    taskStatus.textContent = task.isComplete ? '✓ Complete' : `${task.progress.toFixed(1)}%`

    titleRow.appendChild(taskTitle)
    titleRow.appendChild(taskStatus)

    // Progress bar background
    const progressBg = document.createElement('div')
    progressBg.style.cssText = `
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;
    `

    // Progress bar fill
    const progressFill = document.createElement('div')
    const progressColor = task.isComplete ? '#4CAF50' : '#2196F3'
    progressFill.style.cssText = `
      width: ${task.progress}%;
      height: 100%;
      background: linear-gradient(90deg, ${progressColor} 0%, ${progressColor}dd 100%);
      border-radius: 4px;
      transition: width 0.3s ease;
      position: relative;
      overflow: hidden;
    `

    // Add shimmer effect for active progress
    if (!task.isComplete && task.progress > 0 && task.progress < 100) {
      const shimmer = document.createElement('div')
      shimmer.style.cssText = `
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%);
        animation: shimmer 2s infinite;
      `
      progressFill.appendChild(shimmer)

      // Add shimmer keyframes if not already added
      if (!document.getElementById('shimmer-styles')) {
        const style = document.createElement('style')
        style.id = 'shimmer-styles'
        style.textContent = `
          @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
          }
        `
        document.head.appendChild(style)
      }
    }

    progressBg.appendChild(progressFill)

    // Task description and timing
    if (task.description || !task.isComplete) {
      const description = document.createElement('div')
      description.style.cssText = `
        font-size: 12px;
        color: #aaaaaa;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `

      const descText = document.createElement('span')
      descText.textContent = task.description || 'Processing...'

      const timing = document.createElement('span')
      const elapsed = ((Date.now() - task.startTime) / 1000).toFixed(1)
      timing.textContent = task.isComplete ? `Completed in ${elapsed}s` : `${elapsed}s elapsed`

      description.appendChild(descText)
      description.appendChild(timing)
      
      taskDiv.appendChild(titleRow)
      taskDiv.appendChild(progressBg)
      taskDiv.appendChild(description)
    } else {
      taskDiv.appendChild(titleRow)
      taskDiv.appendChild(progressBg)
    }

    return taskDiv
  }

  public isTaskActive(id: string): boolean {
    return this.tasks.has(id)
  }

  public getTask(id: string): ProgressTask | undefined {
    return this.tasks.get(id)
  }
} 