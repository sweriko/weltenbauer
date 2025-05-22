import * as THREE from 'three';
import { NoiseWrapper, NoiseParameters } from './NoiseWrapper';

export interface TerrainParameters {
    size: number; // Width and depth of the terrain
    segments: number; // Number of segments in width and depth (resolution)
    noiseParams: NoiseParameters;
    useRidgedNoise?: boolean;
}

export class Terrain {
    private scene: THREE.Scene;
    private noiseWrapper: NoiseWrapper;
    public mesh: THREE.Mesh | null = null;
    private geometry: THREE.PlaneGeometry | null = null;
    private material: THREE.MeshStandardMaterial;
    private currentParams: TerrainParameters;

    constructor(scene: THREE.Scene, params: TerrainParameters) {
        this.scene = scene;
        this.currentParams = params;
        this.noiseWrapper = new NoiseWrapper(params.noiseParams.seed);

        this.material = new THREE.MeshStandardMaterial({
            color: 0x88aa88, // A greenish color
            wireframe: true, // ENABLE WIREFRAME FOR DEBUGGING
            side: THREE.DoubleSide, // Render both sides, useful for wireframe or thin terrains
            metalness: 0.2,
            roughness: 0.8,
        });

        this.generateTerrain();
    }

    public updateParameters(newParams: Partial<TerrainParameters>): void {
        // Deep merge for noiseParams if provided
        if (newParams.noiseParams) {
            this.currentParams.noiseParams = { ...this.currentParams.noiseParams, ...newParams.noiseParams };
        }
        // Merge other parameters
        this.currentParams = { ...this.currentParams, ...newParams, noiseParams: this.currentParams.noiseParams };
        
        // Update seed in noiseWrapper if it changed
        if (newParams.noiseParams && newParams.noiseParams.seed !== undefined) {
            this.noiseWrapper.setSeed(newParams.noiseParams.seed);
        }
        this.generateTerrain();
    }

    private generateHeightmap(): Float32Array {
        const { size, segments, noiseParams, useRidgedNoise } = this.currentParams;
        const verticesAcross = segments + 1;
        const heightmap = new Float32Array(verticesAcross * verticesAcross);

        const noiseGenParams = {
            scale: noiseParams.scale,
            octaves: noiseParams.octaves,
            persistence: noiseParams.persistence,
            lacunarity: noiseParams.lacunarity,
        };

        for (let i = 0; i < verticesAcross; i++) { // Corresponds to z-axis in PlaneGeometry
            for (let j = 0; j < verticesAcross; j++) { // Corresponds to x-axis in PlaneGeometry
                const x = (j / segments - 0.5) * size;
                const z = (i / segments - 0.5) * size; // This z is in the plane's local coordinates before rotation
                
                let noiseVal;
                if (useRidgedNoise) {
                    noiseVal = this.noiseWrapper.ridgedFBM2D(x, z, noiseGenParams);
                } else {
                    noiseVal = this.noiseWrapper.fBm2D(x, z, noiseGenParams);
                }
                
                heightmap[i * verticesAcross + j] = noiseVal * noiseParams.heightMultiplier;
            }
        }
        return heightmap;
    }

    public generateTerrain(): void {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.geometry?.dispose();
            // Material is reused, but could be disposed if it changes too
        }

        const { size, segments } = this.currentParams;
        const heightmap = this.generateHeightmap();

        this.geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        const positions = this.geometry.attributes.position;

        for (let k = 0; k < positions.count; k++) {
            // Apply heightmap value to the Z-coordinate of the vertex in the PlaneGeometry's local space.
            // When the plane is rotated -PI/2 around X, this local Z becomes world Y (height).
            positions.setZ(k, heightmap[k]); 
        }

        // Important: Recalculate normals for correct lighting
        this.geometry.computeVertexNormals();
        positions.needsUpdate = true; // Mark attribute as needing update

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);
    }

    public dispose(): void {
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
        this.geometry?.dispose();
        this.material?.dispose();
        this.mesh = null;
        this.geometry = null;
    }
} 