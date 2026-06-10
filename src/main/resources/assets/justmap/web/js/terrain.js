/**
 * Procedural terrain generator for the map background.
 * Generates a Minecraft-like terrain image using multi-octave noise.
 * Used as fallback when no JustMap cached tiles are available.
 */

const TerrainGenerator = (() => {

    /**
     * Seeded pseudo-random number generator (mulberry32).
     */
    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    /**
     * Smooth noise with bilinear interpolation.
     */
    function smoothNoise(x, z, scale, rand) {
        const sx = x / scale;
        const sz = z / scale;
        const x0 = Math.floor(sx), z0 = Math.floor(sz);
        const x1 = x0 + 1, z1 = z0 + 1;
        let fx = sx - x0, fz = sz - z0;
        fx = fx * fx * (3 - 2 * fx);
        fz = fz * fz * (3 - 2 * fz);

        const n00 = rand(x0 * 137 + z0 * 251);
        const n10 = rand(x1 * 137 + z0 * 251);
        const n01 = rand(x0 * 137 + z1 * 251);
        const n11 = rand(x1 * 137 + z1 * 251);

        const top = n00 + (n10 - n00) * fx;
        const bottom = n01 + (n11 - n01) * fx;
        return top + (bottom - top) * fz;
    }

    /**
     * Generate a terrain tile as a canvas element.
     * @param {number} regionX - Region X coordinate
     * @param {number} regionZ - Region Z coordinate
     * @param {number} size - Tile size in pixels (default 512)
     * @returns {HTMLCanvasElement}
     */
    function generateTile(regionX, regionZ, size) {
        size = size || 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;

        // Seed based on region coordinates
        const seed = regionX * 73856093 ^ regionZ * 19349663;
        const rand = mulberry32(seed);

        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const wx = x + regionX * size;
                const wz = z + regionZ * size;

                // Multi-octave height noise
                let h = 0;
                h += smoothNoise(wx, wz, 128, rand) * 0.500;
                h += smoothNoise(wx, wz, 64, rand) * 0.250;
                h += smoothNoise(wx, wz, 32, rand) * 0.125;
                h += smoothNoise(wx, wz, 16, rand) * 0.0625;
                h += smoothNoise(wx, wz, 8, rand) * 0.03125;

                // Moisture and temperature for biome selection
                const m = smoothNoise(wx, wz, 200, rand) * 0.6 + smoothNoise(wx, wz, 80, rand) * 0.4;
                const t = smoothNoise(wx, wz, 256, rand) * 0.7 + smoothNoise(wx, wz, 100, rand) * 0.3;

                // Biome colors
                let r, g, b;

                if (h < 0.28) {
                    // Deep water
                    r = 25; g = 55; b = 140;
                } else if (h < 0.33) {
                    // Shallow water
                    const f = (h - 0.28) / 0.05;
                    r = lerp(25, 50, f); g = lerp(55, 85, f); b = lerp(140, 170, f);
                } else if (h < 0.355) {
                    // Beach / sand
                    r = 205; g = 195; b = 145;
                } else if (h < 0.52) {
                    // Surface biomes
                    if (m > 0.6 && t > 0.4) {
                        // Forest
                        r = 45; g = 110; b = 30;
                    } else if (m > 0.45) {
                        // Plains / grassland
                        r = 85; g = 155; b = 50;
                    } else if (t < 0.28) {
                        // Snow
                        r = 210; g = 220; b = 215;
                    } else if (m < 0.22 && t > 0.6) {
                        // Desert
                        r = 215; g = 195; b = 130;
                    } else {
                        // Default grassland
                        r = 75; g = 140; b = 45;
                    }
                } else if (h < 0.68) {
                    // Hills
                    if (m > 0.5) {
                        r = 55; g = 95; b = 40;
                    } else {
                        r = 100; g = 100; b = 90;
                    }
                } else if (h < 0.80) {
                    // Mountains (stone)
                    r = 120; g = 120; b = 118;
                } else {
                    // Snow peaks
                    r = 230; g = 238; b = 242;
                }

                // Add fine-grained noise for texture
                const noise = (rand(wx * 31 + wz * 17) - 0.5) * 16;
                r = clamp(r + noise, 0, 255);
                g = clamp(g + noise, 0, 255);
                b = clamp(b + noise, 0, 255);

                // Terrain shading (slope-based)
                if (h >= 0.355) {
                    const hL = smoothNoise(wx - 1, wz, 64, rand) * 0.25 + smoothNoise(wx - 1, wz, 32, rand) * 0.125;
                    const hR = smoothNoise(wx + 1, wz, 64, rand) * 0.25 + smoothNoise(wx + 1, wz, 32, rand) * 0.125;
                    const slope = (hR - hL) * 3;
                    const shade = clamp(1.0 + slope, 0.7, 1.3);
                    r = clamp(r * shade, 0, 255);
                    g = clamp(g * shade, 0, 255);
                    b = clamp(b * shade, 0, 255);
                }

                const idx = (z * size + x) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255; // fully opaque
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    return { generateTile };
})();
