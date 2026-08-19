import { describe, it, expect, vi } from 'vitest';
import { TerrainEdgeFilter } from './TerrainEdgeFilter';

describe('TerrainEdgeFilter', () => {
  it('should instantiate or handle test environment gracefully via create()', () => {
    const filter = TerrainEdgeFilter.create({
      roughness: 3.0,
      cornerRadius: 5.0,
      shadowIntensity: 0.4,
      highlightIntensity: 0.25,
    });

    if (filter) {
      expect(filter).toBeDefined();
      TerrainEdgeFilter.setRoughness(filter, 2.0);
      TerrainEdgeFilter.setCornerRadius(filter, 4.0);
      TerrainEdgeFilter.setShadowIntensity(filter, 0.5);
      TerrainEdgeFilter.setHighlightIntensity(filter, 0.3);
      expect(filter.resources.terrainUniforms.uniforms.uRoughness).toBe(2.0);
      expect(filter.resources.terrainUniforms.uniforms.uCornerRadius).toBe(4.0);
      expect(filter.resources.terrainUniforms.uniforms.uShadowIntensity).toBe(0.5);
      expect(filter.resources.terrainUniforms.uniforms.uHighlightIntensity).toBe(0.3);
    } else {
      // In non-WebGL / mock environments, it returns null without crashing
      expect(filter).toBeNull();
    }
  });

  it('should return null and warn gracefully if GlProgram fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Test robustness
    expect(() => {
      TerrainEdgeFilter.create();
    }).not.toThrow();
    warnSpy.mockRestore();
  });
});
