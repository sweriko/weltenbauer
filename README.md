# Weltbuilder - Terrain Editor

A modular, browser-native terrain builder designed for both procedural generation and hand-authored world design. Built with modern TypeScript and Three.js for high-performance WebGL rendering.

## Features

- **Procedural Terrain Generation**: Layered Perlin noise with configurable parameters
- **Real-time Brush Editing**: Sculpt terrain with raise, lower, and smooth brushes
- **Intuitive Controls**: SHIFT+drag for camera orbit, right-click drag for pan, scroll for zoom
- **Export Capabilities**: Export heightmaps as PNG and project data as JSON
- **Modern Architecture**: TypeScript, ES modules, and modular design

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Usage

1. **Generate Terrain**: Adjust noise parameters and click "Regenerate"
2. **Edit Terrain**: Select brush mode and sculpt with left mouse button
3. **Navigate**: Hold SHIFT + drag to orbit camera, right-click drag to pan, scroll to zoom
4. **Export**: Use export buttons to save heightmap or project data

## Architecture

```
src/
├── core/
│   ├── TerrainBuilder.ts    # Main terrain management
│   ├── TerrainGenerator.ts  # Procedural generation
│   ├── BrushSystem.ts       # Real-time editing
│   └── CameraController.ts  # Orbit camera controls
├── ui/
│   └── UIController.ts      # UI event handling
└── main.ts                  # Application entry point
```

## Development

The project uses:
- **Three.js 0.176.0** for 3D rendering
- **Simplex Noise** for procedural generation
- **Vite** for fast development and building
- **TypeScript** for type safety

## Roadmap

- [ ] Multi-layer texture painting
- [ ] Erosion simulation
- [ ] Vegetation scattering
- [ ] Advanced lighting and materials
- [ ] Tile-based optimization for large terrains 