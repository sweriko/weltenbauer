/**
 * 4-way triplanar + splat-map terrain shader.
 * Clean GLSL, no Three.js “onBeforeCompile” hacks.
 */
import * as THREE from 'three';

export interface MaterialTextures {
  color: THREE.Texture;
  normal?: THREE.Texture;
}

export interface SplatMaterialProps {
  tiles      : number;
  tex        : [
    MaterialTextures,
    MaterialTextures,
    MaterialTextures,
    MaterialTextures
  ];
  splat      : THREE.Texture;
  texBombing?: boolean;
}

export function createSplatMaterial(props: SplatMaterialProps): THREE.ShaderMaterial {
  const { tiles, tex, splat, texBombing = false } = props;

  /* ---------------------------- uniforms --------------------------------- */
  const u: Record<string, THREE.IUniform> = {
    uTiles : { value: tiles },
    uSplat : { value: splat },
    uBomb  : { value: texBombing ? 1 : 0 },
  };

  tex.forEach((t, i) => {
    u[`uColor${i}`]  = { value: t.color };
    u[`uNormal${i}`] = { value: t.normal ?? new THREE.Texture() };
  });

  /* ---------------------------- GLSL chunks ------------------------------ */
  const defines = `#define TEX_BOMB ${texBombing ? 1 : 0}`;

  const vert = /* glsl */`
    varying vec3 vWorldPos;
    varying vec3 vWorldNorm;

    void main() {
      vWorldPos  = (modelMatrix * vec4(position, 1.0)).xyz;
      vWorldNorm = normalize(mat3(modelMatrix) * normal);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const frag = /* glsl */`
    ${defines}
    varying vec3 vWorldPos;
    varying vec3 vWorldNorm;

    uniform sampler2D uSplat;
    uniform float     uTiles;

    uniform sampler2D uColor0; uniform sampler2D uColor1;
    uniform sampler2D uColor2; uniform sampler2D uColor3;

    /* hash for UV jitter (texture bombing) */
    float hash21(vec2 p) { return fract(sin(dot(p, vec2(27.1, 91.7))) * 43758.5453); }

    vec3 sampleTriplanar(sampler2D tex, vec3 wp, vec3 wn) {
      vec3 a = abs(wn);
      vec3 uvX = wp.yz * uTiles;
      vec3 uvY = wp.zx * uTiles;
      vec3 uvZ = wp.xy * uTiles;

      #if TEX_BOMB == 1
        uvX += hash21(uvX.xy) * 4.0;
        uvY += hash21(uvY.xy) * 4.0;
        uvZ += hash21(uvZ.xy) * 4.0;
      #endif

      vec3 cX = texture2D(tex, uvX.xy).rgb;
      vec3 cY = texture2D(tex, uvY.xy).rgb;
      vec3 cZ = texture2D(tex, uvZ.xy).rgb;
      return (cX * a.x + cY * a.y + cZ * a.z) / (a.x + a.y + a.z);
    }

    vec3 sampleLayer(int id, vec3 wp, vec3 wn) {
      if (id == 0) return sampleTriplanar(uColor0, wp, wn);
      if (id == 1) return sampleTriplanar(uColor1, wp, wn);
      if (id == 2) return sampleTriplanar(uColor2, wp, wn);
      return sampleTriplanar(uColor3, wp, wn);
    }

    void main() {
      vec4 mask  = texture2D(uSplat, vWorldPos.xz / uTiles);
      vec3 nrm   = normalize(vWorldNorm);

      vec3 col =
          sampleLayer(0, vWorldPos, nrm) * mask.r +
          sampleLayer(1, vWorldPos, nrm) * mask.g +
          sampleLayer(2, vWorldPos, nrm) * mask.b +
          sampleLayer(3, vWorldPos, nrm) * mask.a;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms       : u,
    vertexShader   : vert,
    fragmentShader : frag,
    lights         : false,   // add @todo normal blending if you need lighting
    fog            : true,
  });
}
