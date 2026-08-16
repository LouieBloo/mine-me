#!/usr/bin/env python3
"""
assemble_preview.py
Assembles the 6 sliced parts into a single composite character image to verify perfect alignment,
joint positioning, and visual proportions.
"""

import os
import json
from PIL import Image, ImageOps

def main():
    parts_dir = '/home/luke/code/mine-me/packages/shared/assets/sprites/characters/miner'
    manifest_path = os.path.join(parts_dir, 'miner_skeleton.json')
    
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)

    # Let's clean leg_front if it has the ball at top
    leg_front_path = os.path.join(parts_dir, 'leg_front.png')
    lf_img = Image.open(leg_front_path)
    
    # Create canvas 1024x1024
    canvas = Image.new('RGBA', (1024, 1024), (255, 255, 255, 0))
    center_x, center_y = 512, 600

    parts_info = manifest['parts']
    
    # Sort parts by z_index
    sorted_parts = sorted(parts_info.items(), key=lambda x: x[1]['z_index'])
    
    for part_name, info in sorted_parts:
        img_path = os.path.join(parts_dir, info['file'])
        part_img = Image.open(img_path)
        
        pivot_x = int(info['pivot_anchor'][0] * part_img.width)
        pivot_y = int(info['pivot_anchor'][1] * part_img.height)
        
        # Position in world
        # If torso, pos = center + offset
        # If child of torso (head, arms), pos = torso_joint + offset
        offset_x, offset_y = info['offset_from_pelvis']
        
        pos_x = center_x + offset_x - pivot_x
        pos_y = center_y + offset_y - pivot_y
        
        canvas.paste(part_img, (int(pos_x), int(pos_y)), part_img)
        print(f'Pasted {part_name} at ({pos_x}, {pos_y})')

    preview_path = '/home/luke/.gemini/antigravity-ide/brain/b123f84c-88a7-44d6-930a-0e96d55fd395/assembled_character_preview.png'
    canvas.save(preview_path)
    print('Saved preview to', preview_path)

if __name__ == '__main__':
    main()
