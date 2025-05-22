/**
 * Interactive terrain-authoring core:
 *  • generates the height-field in a WebWorker
 *  • provides lil-gui for noise + brush params
 *  • real-time painting (raise / flatten / smooth)
 *  • demo "tree" scatter button
 */

import * as THREE from 'three';
import GUI from 'lil-gui';
import { Heightmap }                from '../core/Heightmap';
import { generateHeight, NoiseOpts } from '../core/Noise';
import { TerrainMesh }              from '../core/TerrainMesh';
import { ScatterSystem }            from '../core/ScatterSystem';

export class TerrainEditor {
  private readonly scene   : THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera  : THREE.Camera;

  /* data ------------------------------------------------------------------ */
  private hmSize  = 257;                 // must be (2^n)+1 for midpoint filters
  private hm!     : Heightmap;
  private terrain!: TerrainMesh;

  /* ui / helpers ----------------------------------------------------------- */
  private gui     : GUI | undefined;
  private pointer = new THREE.Vector2();
  private plane   = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  private ray     = new THREE.Raycaster();

  /* painting state --------------------------------------------------------- */
  private brush = {
    mode     : 'raise', /* raise|flatten|smooth */
    radius   : 12,
    strength : 0.8,
  };

  /* noise parameters for generation --------------------------------------- */
  private noise: NoiseOpts = {
    seed         : 1,
    octaves      : 6,
    amplitude    : 1,
    frequency    : 0.004,
    persistence  : 0.48,
    lacunarity   : 2.2,
    ridged       : 0.4,
    warpAmplitude: 25,
    warpFreq     : 0.01,
  };

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    this.scene    = scene;
    this.renderer = renderer;
    this.camera   = camera;
    this.init();
  }

  /* ----------------------------------------------------------------------- */
  /* init                                                                    */
  /* ----------------------------------------------------------------------- */

  private init(): void {
    this.generateHeightmap();                      // -> this.hm
    this.terrain = new TerrainMesh(this.hmSize, 1, this.hm);
    this.scene.add(this.terrain);

    this.addLights();
    this.initGUI();
    this.initEvents();
  }

  private generateHeightmap(): void {
    /* heavy lifting inside a Worker */
    const buffer = generateHeight(this.hmSize, this.noise);
    this.hm      = new Heightmap(this.hmSize, buffer);
  }

  /* ----------------------------------------------------------------------- */
  /* lighting                                                                */
  /* ----------------------------------------------------------------------- */

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(50, 120, 70);
    this.scene.add(dir);
  }

  /* ----------------------------------------------------------------------- */
  /* lil-gui                                                                 */
  /* ----------------------------------------------------------------------- */

  private initGUI(): void {
    const gui = this.gui = new GUI({ width: 300 });

    /* noise folder */
    const fNoise = gui.addFolder('Noise');
    fNoise.add(this.noise, 'seed',       0, 9_999, 1).onFinishChange(() => this.regen());
    fNoise.add(this.noise, 'octaves',    1,     8, 1).onFinishChange(() => this.regen());
    fNoise.add(this.noise, 'frequency', 0.001, 0.02, 0.001).onFinishChange(() => this.regen());
    fNoise.add(this.noise, 'ridged',     0,     1, 0.01).onFinishChange(() => this.regen());
    fNoise.close();

    /* brush folder */
    const fBrush = gui.addFolder('Brush');
    fBrush.add(this.brush, 'mode', ['raise', 'flatten', 'smooth']);
    fBrush.add(this.brush, 'radius',   2, 40, 1);
    fBrush.add(this.brush, 'strength', 0.1, 1, 0.05);
    fBrush.close();

    /* scatter demo button */
    gui.add({ addTrees: () => this.addScatter() }, 'addTrees').name('Add Trees');
  }

  /* ----------------------------------------------------------------------- */
  /* DOM events                                                              */
  /* ----------------------------------------------------------------------- */

  private initEvents(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('pointermove', (e) => this.onPointer(e));
    canvas.addEventListener('pointerdown', (e) => this.onPaint(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());   // disable context-menu
  }

  private onPointer(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left)  / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)   / rect.height) * 2 + 1,
    );
  }

  /** brush stroke */
  private onPaint(e: PointerEvent): void {
    if (e.button !== 0) return;                    // only left click

    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (!hit) return;

    /* convert world XY → heightmap (u,v) indices */
    const u = hit.x + this.hm.size / 2;
    const v = hit.z + this.hm.size / 2;

    switch (this.brush.mode) {
      case 'raise':
        this.hm.paintRaise(
          new THREE.Vector2(u, v),
          this.brush.radius,
          0.005 * this.brush.strength,
        );
        break;

      case 'flatten': {
        const tgt = this.hm.sample(u, v);
        this.hm.paintFlatten(
          new THREE.Vector2(u, v),
          this.brush.radius,
          tgt,
          this.brush.strength,
        );
        break;
      }

      case 'smooth':
        this.hm.paintSmooth(
          new THREE.Vector2(u, v),
          this.brush.radius,
          this.brush.strength,
        );
        break;
    }

    this.terrain.updateGeometry();
  }

  /* ----------------------------------------------------------------------- */
  /* regenerate with new noise params                                        */
  /* ----------------------------------------------------------------------- */
  private regen(): void {
    if (!this.gui) return;
    this.gui.show();
    this.generateHeightmap();
    this.terrain.hm = this.hm;
    this.terrain.updateGeometry();
  }

  /* ----------------------------------------------------------------------- */
  /* quick demo – scatter instanced "trees"                                  */
  /* ----------------------------------------------------------------------- */
  private addScatter(): void {
    const treeGeo = new THREE.ConeGeometry(1, 4, 8);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x228822 });
    const tree    = new THREE.Mesh(treeGeo, treeMat);

    const scatter = new ScatterSystem(this.terrain, this.hm, {
      mesh         : tree,
      density      : 0.8,
      maxSlope     : 0.6,
      minHeight    : 10,
      alignToNormal: false,
      randomScale  : [0.7, 1.4],
    });

    this.scene.add(scatter.instanced);
  }

  /* ----------------------------------------------------------------------- */
  /* hooks from main.ts                                                      */
  /* ----------------------------------------------------------------------- */
  resize(): void {/* currently nothing to resize */}
  update(): void {/* kept for future real-time needs */}
}
