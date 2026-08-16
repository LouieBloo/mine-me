# Art Style Guide & GenAI Prompting Reference

This document outlines the visual art style for **Mine-Me**, including style definitions, color palettes, visual rules, and prompt templates for Generative AI (textures, backgrounds, tilesets, sprites, and environmental props).

---

## 1. Style Definition & Inspiration

* **Style Names:**
  * High-Resolution / High-Detail Painterly Pixel Art
  * 32-bit / Late-Era Neo Geo & Arcade Fantasy Aesthetic
  * Hand-Crafted Hi-Bit Side-Scroller Art
* **Visual References & Influence:**
  * *Metal Slug* (material detailing, pixel clustering, chunky silhouettes)
  * *Owlboy* / *Astebreed* / *The Whispered World* (atmospheric perspective, rich environmental palettes, smooth natural textures via pixel clustering)
  * Classic 90s European & Japanese platformers and adventure games

---

## 2. Core Visual Characteristics

### A. Rendering & Pixel Technique
* **Pixel Density & Crispness:** High resolution pixel art with clean edges. No soft brushes, anti-aliased smearing, or vector gradients.
* **Pixel Clustering:** Natural forms (rock, leaves, water) are rendered using intentional pixel clusters and subtle dithering rather than flat color fills or algorithmic noise.
* **Depth & Stratification:** Clear horizontal and organic stratification for stone/earth, creating readable ledges, platform boundaries, and depth.

### B. Color Palette & Lighting
* **Tones:** Muted, naturalistic earth tones:
  * Slate grays, warm limestone beiges, weathered clay
  * Desaturated mossy greens and deep forest emeralds
  * Soft cyan / teal hues for water and atmospheric fog
  * Warm brass, bronze, and leather accents for gear/characters
* **Atmospheric Lighting:**
  * Subtle aerial perspective (distant layers shift toward desaturated pale blue/teal)
  * Directional ambient lighting with soft highlights and deep shadow pooling
  * Particle haze, water spray, and mist blending

### C. Anatomy & Proportions
* **Characters:** Semi-chibi / chunky fantasy proportions (e.g. stocky dwarf with clear silhouette, heavy hammer, distinct gear trims).
* **Creatures & Elements:** Organic rock golems and titans seamlessly blending into rock faces and cliff formations.

---

## 3. GenAI Prompt Templates

Use these templates and modifier tags when prompting GenAI models (Midjourney, Stable Diffusion, FLUX, DALL-E, etc.).

### A. Environment & Background Art
```text
High-detail 32-bit pixel art side-scrolling landscape, layered stratified rock cliffs and multi-tiered waterfalls pouring into a calm lake, giant ancient carved stone golem emerging from cliff face, muted earth tones, slate and warm beige rock, lush green moss details, atmospheric perspective, painterly pixel clusters, crisp pixels, 90s arcade adventure aesthetic, 16-bit masterwork --no blur, smooth gradients, vector art, 3D render
```

### B. Tilesets, Ledges & Terrain Textures
```text
2D pixel art seamless platformer tileset, stratified shale stone, limestone ledge edges, layered rock textures, subtle dithering, muted natural earth palette, crisp pixel grid, high resolution 32-bit fantasy game asset, side-scroller terrain --no smooth gradients, 3d render, vector
```

### C. Character & Monster Sprites
```text
Side-view 2D pixel art sprite of a stocky fantasy dwarf holding a heavy hammer, brass armor with green trim, chunky silhouette, hand-drawn pixel art, late 90s arcade sprite style, transparent background --no 3d, vector, blurry
```

### D. Mining Props & Underground Textures
```text
2D pixel art underground mine wall, cracked limestone, exposed crystal ore veins, wooden support beams, rich rock texture, muted dark slate and earthy amber, high detail 32-bit pixel art --no blur, flat vector
```

---

## 4. Universal Negative Prompt Keywords

Always include these negative keywords or exclusions to avoid modern generic AI smoothing:

```text
3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, modern anime, cel shading, low-effort pixelation, noise filter
```
