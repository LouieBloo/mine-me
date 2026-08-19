import { Filter, GlProgram, UniformGroup } from 'pixi.js';

export interface TerrainEdgeFilterOptions {
  /** Edge roughness / noise displacement in pixels (default: 2.5) */
  roughness?: number;
  /** Corner rounding radius in pixels (default: 4.5) */
  cornerRadius?: number;
  /** Ambient occlusion / inner shadow intensity (0 to 1, default: 0.35) */
  shadowIntensity?: number;
  /** Top rim highlight intensity (0 to 1, default: 0.20) */
  highlightIntensity?: number;
}

// Use the exact same default vertex shader as PixiJS v8 built-in filters
// (copied from pixi.js/lib/filters/defaults/defaultFilter.vert.mjs)
const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uRoughness;
uniform float uCornerRadius;
uniform float uShadowIntensity;
uniform float uHighlightIntensity;

// Simple 2D hash for rock texture
float hash2D(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Smooth value noise for organic earthen contours
float rockNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash2D(i);
    float b = hash2D(i + vec2(1.0, 0.0));
    float c = hash2D(i + vec2(0.0, 1.0));
    float d = hash2D(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec4 centerColor = texture(uTexture, vTextureCoord);

    // If completely transparent, output empty
    if (centerColor.a < 0.01) {
        finalColor = vec4(0.0);
        return;
    }

    vec2 px = uInputSize.zw; // 1 pixel step in UV space
    vec2 screenPx = vTextureCoord * uInputSize.xy;

    // Sample cardinal neighbors at sample distance based on cornerRadius
    float stepDist = max(2.0, uCornerRadius * 0.75);
    float aN  = texture(uTexture, vTextureCoord + vec2(0.0, -px.y * stepDist)).a;
    float aS  = texture(uTexture, vTextureCoord + vec2(0.0,  px.y * stepDist)).a;
    float aW  = texture(uTexture, vTextureCoord + vec2(-px.x * stepDist, 0.0)).a;
    float aE  = texture(uTexture, vTextureCoord + vec2( px.x * stepDist, 0.0)).a;

    float aNW = texture(uTexture, vTextureCoord + vec2(-px.x * stepDist * 0.7, -px.y * stepDist * 0.7)).a;
    float aNE = texture(uTexture, vTextureCoord + vec2( px.x * stepDist * 0.7, -px.y * stepDist * 0.7)).a;
    float aSW = texture(uTexture, vTextureCoord + vec2(-px.x * stepDist * 0.7,  px.y * stepDist * 0.7)).a;
    float aSE = texture(uTexture, vTextureCoord + vec2( px.x * stepDist * 0.7,  px.y * stepDist * 0.7)).a;

    float neighborSum = aN + aS + aW + aE + aNW + aNE + aSW + aSE;
    float avgAlpha = neighborSum / 8.0;

    // Interior pixels: full opacity & original colors
    if (avgAlpha > 0.98) {
        finalColor = centerColor;
        return;
    }

    // Procedural rock noise for edge roughness
    float noise = rockNoise(screenPx * 0.25);
    float alpha = centerColor.a;

    // 1. Edge & Corner Softening:
    // Outer convex corners have neighborSum < 4.0
    // When near an exposed boundary, softly chip and round the edge
    if (avgAlpha < 0.75) {
        float edgeFactor = avgAlpha + (noise - 0.5) * (uRoughness * 0.15);
        if (edgeFactor < 0.35) {
            alpha *= smoothstep(0.1, 0.35, edgeFactor);
        }
    }

    if (alpha <= 0.01) {
        finalColor = vec4(0.0);
        return;
    }

    vec3 rgb = centerColor.rgb;

    // 2. 3D Top Rim Highlight (facing open air upwards)
    if (aN < 0.8) {
        float topExposure = (1.0 - aN) * (0.8 + noise * 0.4);
        rgb += vec3(0.16, 0.13, 0.08) * topExposure * uHighlightIntensity;
    }

    // 3. 3D Ambient Contact Shadow (bottom and side exposed edges)
    float shadowAmt = 0.0;
    if (aS < 0.8) shadowAmt += (1.0 - aS) * 0.5;
    if (aW < 0.8) shadowAmt += (1.0 - aW) * 0.25;
    if (aE < 0.8) shadowAmt += (1.0 - aE) * 0.25;
    shadowAmt = clamp(shadowAmt * uShadowIntensity, 0.0, 0.5);
    rgb = mix(rgb, rgb * (1.0 - shadowAmt), shadowAmt);

    // 4. Subtle rock grain micro-texture along edges
    rgb *= (0.96 + noise * 0.08);

    finalColor = vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha);
}
`;

/**
 * TerrainEdgeFilter is a PixiJS v8 GPU filter that transforms flat square tile boundaries
 * into natural, organic rock faces with:
 * - Rounded convex corners
 * - Procedural earthen edge roughness/erosion
 * - 3D top rim highlight and ambient occlusion contact shadows
 */
export class TerrainEdgeFilter {
  public static create(options: TerrainEdgeFilterOptions = {}): Filter | null {
    try {
      const glProgram = GlProgram.from({
        vertex: VERTEX,
        fragment: FRAGMENT,
        name: 'terrain-edge-filter',
      });

      const filter = new Filter({
        glProgram,
        resources: {
          terrainUniforms: new UniformGroup({
            uRoughness: { value: options.roughness ?? 2.5, type: 'f32' },
            uCornerRadius: { value: options.cornerRadius ?? 4.5, type: 'f32' },
            uShadowIntensity: { value: options.shadowIntensity ?? 0.35, type: 'f32' },
            uHighlightIntensity: { value: options.highlightIntensity ?? 0.2, type: 'f32' },
          }),
        },
        padding: 4,
      });

      return filter;
    } catch (err) {
      console.warn('[TerrainEdgeFilter] Could not create WebGL filter (headless/unsupported environment):', err);
      return null;
    }
  }

  public static setRoughness(filter: Filter, value: number): void {
    if (filter.resources?.terrainUniforms?.uniforms) {
      filter.resources.terrainUniforms.uniforms.uRoughness = value;
    }
  }

  public static setCornerRadius(filter: Filter, value: number): void {
    if (filter.resources?.terrainUniforms?.uniforms) {
      filter.resources.terrainUniforms.uniforms.uCornerRadius = value;
    }
  }

  public static setShadowIntensity(filter: Filter, value: number): void {
    if (filter.resources?.terrainUniforms?.uniforms) {
      filter.resources.terrainUniforms.uniforms.uShadowIntensity = value;
    }
  }

  public static setHighlightIntensity(filter: Filter, value: number): void {
    if (filter.resources?.terrainUniforms?.uniforms) {
      filter.resources.terrainUniforms.uniforms.uHighlightIntensity = value;
    }
  }
}

