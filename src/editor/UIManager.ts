import { Terrain, TerrainParameters } from '../core/Terrain';
import { NoiseParameters } from '../core/NoiseWrapper';

export class UIManager {
    private terrain: Terrain;
    private initialParams: TerrainParameters;

    // UI Elements
    private seedInput: HTMLInputElement;
    private terrainSizeInput: HTMLInputElement;
    private terrainSegmentsInput: HTMLInputElement;
    private noiseScaleInput: HTMLInputElement;
    private octavesInput: HTMLInputElement;
    private persistenceInput: HTMLInputElement;
    private lacunarityInput: HTMLInputElement;
    private heightMultiplierInput: HTMLInputElement;
    private regenerateButton: HTMLButtonElement;
    // Add a checkbox for ridged noise
    private useRidgedNoiseCheckbox: HTMLInputElement;


    constructor(terrain: Terrain, initialParams: TerrainParameters) {
        this.terrain = terrain;
        
        const defaultNoiseParams: NoiseParameters = {
            seed: undefined,
            scale: 200,
            octaves: 6,
            persistence: 0.5,
            lacunarity: 2.0,
            heightMultiplier: 50,
        };

        const defaultTerrainParams: TerrainParameters = {
            size: 512,
            segments: 128,
            noiseParams: defaultNoiseParams,
            useRidgedNoise: false,
        };

        this.initialParams = {
            ...defaultTerrainParams,
            ...initialParams,
            noiseParams: {
                ...defaultTerrainParams.noiseParams,
                ...(initialParams.noiseParams || {}),
            },
        };

        // Get UI elements (ensure these IDs match your HTML)
        this.seedInput = document.getElementById('seed') as HTMLInputElement;
        this.terrainSizeInput = document.getElementById('terrainSize') as HTMLInputElement;
        this.terrainSegmentsInput = document.getElementById('terrainSegments') as HTMLInputElement;
        this.noiseScaleInput = document.getElementById('noiseScale') as HTMLInputElement;
        this.octavesInput = document.getElementById('octaves') as HTMLInputElement;
        this.persistenceInput = document.getElementById('persistence') as HTMLInputElement;
        this.lacunarityInput = document.getElementById('lacunarity') as HTMLInputElement;
        this.heightMultiplierInput = document.getElementById('heightMultiplier') as HTMLInputElement;
        this.regenerateButton = document.getElementById('regenerateButton') as HTMLButtonElement;

        // Create and append the ridged noise checkbox dynamically or assume it exists in HTML
        // For now, let's assume it's added to the HTML like the other inputs for simplicity.
        // If not, we would do: this.useRidgedNoiseCheckbox = document.createElement('input'); this.useRidgedNoiseCheckbox.type = 'checkbox'; ... and append it.
        this.useRidgedNoiseCheckbox = document.getElementById('useRidgedNoise') as HTMLInputElement || this.createRidgedNoiseCheckbox();


        this.setInitialValues();
        this.attachEventListeners();
    }

    private createRidgedNoiseCheckbox(): HTMLInputElement {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'useRidgedNoise';
        const label = document.createElement('label');
        label.htmlFor = 'useRidgedNoise';
        label.textContent = ' Use Ridged Noise';

        const container = this.noiseScaleInput.parentElement; // Or some other suitable container
        if (container) {
            const div = document.createElement('div');
            div.appendChild(checkbox);
            div.appendChild(label);
            // Insert it before the regenerate button for example
            this.regenerateButton.parentElement?.insertBefore(div, this.regenerateButton);
        }
        return checkbox;
    }

    public setInitialValues(): void {
        this.seedInput.value = String(this.initialParams.noiseParams.seed || '');
        this.terrainSizeInput.value = String(this.initialParams.size);
        this.terrainSegmentsInput.value = String(this.initialParams.segments);
        this.noiseScaleInput.value = String(this.initialParams.noiseParams.scale);
        this.octavesInput.value = String(this.initialParams.noiseParams.octaves);
        this.persistenceInput.value = String(this.initialParams.noiseParams.persistence);
        this.lacunarityInput.value = String(this.initialParams.noiseParams.lacunarity);
        this.heightMultiplierInput.value = String(this.initialParams.noiseParams.heightMultiplier);
        this.useRidgedNoiseCheckbox.checked = this.initialParams.useRidgedNoise || false;
    }

    private attachEventListeners(): void {
        this.regenerateButton.addEventListener('click', () => this.handleRegenerate());

        // Optional: Add event listeners to inputs for real-time updates (can be heavy)
        // For now, we rely on the regenerate button.
        // Example for one input:
        // this.noiseScaleInput.addEventListener('change', () => this.handleRegenerate());
    }

    private getUIData(): TerrainParameters {
        const noiseParams: NoiseParameters = {
            seed: this.seedInput.value ? (isNaN(parseFloat(this.seedInput.value)) ? this.seedInput.value : parseFloat(this.seedInput.value)) : undefined,
            scale: parseFloat(this.noiseScaleInput.value) || 200,
            octaves: parseInt(this.octavesInput.value) || 6,
            persistence: parseFloat(this.persistenceInput.value) || 0.5,
            lacunarity: parseFloat(this.lacunarityInput.value) || 2.0,
            heightMultiplier: parseFloat(this.heightMultiplierInput.value) || 50,
        };

        return {
            size: parseInt(this.terrainSizeInput.value) || 512,
            segments: parseInt(this.terrainSegmentsInput.value) || 128,
            noiseParams: noiseParams,
            useRidgedNoise: this.useRidgedNoiseCheckbox.checked,
        };
    }

    private handleRegenerate(): void {
        const params = this.getUIData();
        this.terrain.updateParameters(params);
        // Update initialParams to reflect current state if needed for future reference
        this.initialParams = params; 
    }

    public getCurrentTerrainParameters(): TerrainParameters {
        return this.getUIData();
    }
} 