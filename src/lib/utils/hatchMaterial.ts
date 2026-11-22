/**
 * Hatch material for reserved spaces: a solid block with one set of diagonal stripes, so it reads
 * as a plain gray box marked "not printed". The stripes are slices through the block along its
 * diagonal, computed from the mesh's own coordinates (millimetres). That means the geometry needs
 * no UVs, the stripes keep a constant width whatever the block's size, and they run unbroken
 * from one face onto the next.
 */
import * as THREE from 'three';

const materials: Record<string, THREE.ShaderMaterial> = {};

export function getHatchMaterial(
  color: string,
  highlight: 'none' | 'hover' | 'selected' = 'none'
): THREE.ShaderMaterial {
  const key = `${color}|${highlight}`;
  if (materials[key]) return materials[key];

  const base = new THREE.Color(color);
  if (highlight === 'selected') base.lerp(new THREE.Color('#4d8dff'), 0.55);
  if (highlight === 'hover') base.lerp(new THREE.Color('#ffffff'), 0.25);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: base },
      uPeriod: { value: 14.0 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vNormalView;
      void main() {
        vLocal = position;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPeriod;
      varying vec3 vLocal;
      varying vec3 vNormalView;
      void main() {
        // Slices perpendicular to the block's diagonal: each slice meets every face in a line,
        // and those lines join up at the edges
        float t = fract((vLocal.x + vLocal.y + vLocal.z) / uPeriod);
        // Soft-edged stripe covering 40% of each period
        float edge = fwidth((vLocal.x + vLocal.y + vLocal.z) / uPeriod) * 1.5;
        float stripe = smoothstep(0.0, edge, t) * (1.0 - smoothstep(0.4, 0.4 + edge, t));
        // Simple view-facing shading so the faces of the block read as distinct
        float shade = 0.6 + 0.4 * abs(normalize(vNormalView).z);
        vec3 color = mix(uColor, uColor * 0.55, stripe);
        gl_FragColor = vec4(color * shade, 1.0);
        // The colour above is linear; convert it for display like the built-in materials do,
        // otherwise the block renders far darker than its gray
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide
  });

  materials[key] = material;
  return material;
}
