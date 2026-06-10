#!/usr/bin/env python3
"""
Generate a demo MC map tile (512x512 PNG) for the visualization project.
Creates a fake but realistic-looking terrain map with biomes.

Usage: python3 generate_demo_tile.py
"""

import struct
import zlib
import math
import os

def create_png(width, height, pixels):
    """Create a PNG file from pixel data (list of (R,G,B,A) tuples)."""

    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', zlib.crc32(chunk) & 0xFFFFFFFF)

    # PNG signature
    signature = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    ihdr = make_chunk(b'IHDR', ihdr_data)

    # IDAT chunk (image data)
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # Filter byte (none)
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw_data += struct.pack('BBBB', r, g, b, a)

    compressed = zlib.compress(raw_data, 9)
    idat = make_chunk(b'IDAT', compressed)

    # IEND chunk
    iend = make_chunk(b'IEND', b'')

    return signature + ihdr + idat + iend


def noise2d(x, z, seed=42):
    """Simple pseudo-random noise function."""
    n = math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453
    return n - math.floor(n)


def smooth_noise(x, z, scale, seed=42):
    """Smoothed noise with bilinear interpolation."""
    sx = x / scale
    sz = z / scale
    x0 = int(math.floor(sx))
    z0 = int(math.floor(sz))
    x1 = x0 + 1
    z1 = z0 + 1
    fx = sx - x0
    fz = sz - z0

    # Smooth interpolation
    fx = fx * fx * (3 - 2 * fx)
    fz = fz * fz * (3 - 2 * fz)

    n00 = noise2d(x0, z0, seed)
    n10 = noise2d(x1, z0, seed)
    n01 = noise2d(x0, z1, seed)
    n11 = noise2d(x1, z1, seed)

    top = n00 + (n10 - n00) * fx
    bottom = n01 + (n11 - n01) * fx
    return top + (bottom - top) * fz


def generate_terrain_tile(size=512, offset_x=0, offset_z=0):
    """Generate a terrain tile that looks like a MC map."""
    pixels = []

    for z in range(size):
        for x in range(size):
            wx = x + offset_x
            wz = z + offset_z

            # Multi-octave noise for terrain height
            h = 0
            h += smooth_noise(wx, wz, 128, 1) * 0.5
            h += smooth_noise(wx, wz, 64, 2) * 0.25
            h += smooth_noise(wx, wz, 32, 3) * 0.125
            h += smooth_noise(wx, wz, 16, 4) * 0.0625

            # Moisture noise for biome selection
            m = 0
            m += smooth_noise(wx, wz, 200, 10) * 0.6
            m += smooth_noise(wx, wz, 80, 11) * 0.4

            # Temperature noise
            t = 0
            t += smooth_noise(wx, wz, 256, 20) * 0.7
            t += smooth_noise(wx, wz, 100, 21) * 0.3

            # Determine biome and color
            r, g, b = 0, 0, 0

            if h < 0.30:
                # Deep water
                r, g, b = 30, 60, 150
            elif h < 0.35:
                # Shallow water
                r, g, b = 50, 90, 180
            elif h < 0.37:
                # Beach/sand
                r, g, b = 210, 200, 150
            elif h < 0.55:
                if m > 0.6 and t > 0.4:
                    # Forest
                    shade = 0.85 + noise2d(wx, wz, 100) * 0.15
                    r, g, b = int(50 * shade), int(120 * shade), int(35 * shade)
                elif m > 0.4:
                    # Plains
                    shade = 0.85 + noise2d(wx, wz, 101) * 0.15
                    r, g, b = int(90 * shade), int(160 * shade), int(55 * shade)
                elif t < 0.3:
                    # Snow/sparse
                    shade = 0.85 + noise2d(wx, wz, 102) * 0.15
                    r, g, b = int(180 * shade), int(200 * shade), int(180 * shade)
                elif m < 0.25 and t > 0.6:
                    # Desert
                    shade = 0.85 + noise2d(wx, wz, 103) * 0.15
                    r, g, b = int(210 * shade), int(190 * shade), int(130 * shade)
                else:
                    # Default grassland
                    shade = 0.85 + noise2d(wx, wz, 104) * 0.15
                    r, g, b = int(80 * shade), int(145 * shade), int(50 * shade)
            elif h < 0.70:
                # Hills
                shade = 0.8 + noise2d(wx, wz, 105) * 0.2
                if m > 0.5:
                    r, g, b = int(60 * shade), int(100 * shade), int(45 * shade)
                else:
                    r, g, b = int(110 * shade), int(110 * shade), int(100 * shade)
            elif h < 0.82:
                # Mountains (stone)
                shade = 0.75 + noise2d(wx, wz, 106) * 0.25
                r, g, b = int(128 * shade), int(128 * shade), int(128 * shade)
            else:
                # Snow peaks
                shade = 0.9 + noise2d(wx, wz, 107) * 0.1
                r, g, b = int(235 * shade), int(240 * shade), int(245 * shade)

            # Add slight shading for depth
            if h >= 0.37:
                # Calculate "slope" for terrain shading
                h_left = smooth_noise(wx - 1, wz, 64, 2) * 0.25 + smooth_noise(wx - 1, wz, 32, 3) * 0.125
                h_right = smooth_noise(wx + 1, wz, 64, 2) * 0.25 + smooth_noise(wx + 1, wz, 32, 3) * 0.125
                slope = (h_right - h_left) * 3
                shade_factor = max(0.7, min(1.3, 1.0 + slope))
                r = min(255, int(r * shade_factor))
                g = min(255, int(g * shade_factor))
                b = min(255, int(b * shade_factor))

            pixels.append((r, g, b, 255))

    return pixels


def main():
    output_dir = os.path.join(os.path.dirname(__file__), 'tiles')
    os.makedirs(output_dir, exist_ok=True)

    # Generate a 2x2 grid of regions (4 tiles)
    for rx in range(-1, 1):
        for rz in range(-1, 1):
            print(f"Generating region r.{rx}.{rz}.png ...")
            pixels = generate_terrain_tile(512, rx * 512, rz * 512)
            png_data = create_png(512, 512, pixels)

            filepath = os.path.join(output_dir, f'r.{rx}.{rz}.png')
            with open(filepath, 'wb') as f:
                f.write(png_data)
            print(f"  Saved: {filepath}")

    print("Done! Generated demo tiles in", output_dir)


if __name__ == '__main__':
    main()
