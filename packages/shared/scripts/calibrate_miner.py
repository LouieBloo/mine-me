#!/usr/bin/env python3
"""
calibrate_miner.py
Fine-tunes offsets, pivots, scales and positions for the newly generated individual parts.
"""

import os
import json
import shutil
from PIL import Image

def main():
    parts_dir = '/home/luke/code/mine-me/packages/shared/assets/sprites/characters/miner'
    client_public_dir = '/home/luke/code/mine-me/apps/client/public/assets/sprites/characters/miner'
    admin_public_dir = '/home/luke/code/mine-me/apps/admin/public/assets/sprites/characters/miner'
    
    # Load each part image
    head_img = Image.open(os.path.join(parts_dir, 'head.png'))
    torso_img = Image.open(os.path.join(parts_dir, 'torso.png'))
    arm_front_img = Image.open(os.path.join(parts_dir, 'arm_front.png'))
    arm_back_img = Image.open(os.path.join(parts_dir, 'arm_back.png'))
    leg_front_img = Image.open(os.path.join(parts_dir, 'leg_front.png'))
    leg_back_img = Image.open(os.path.join(parts_dir, 'leg_back.png'))

    # Fine-tuned target specs
    # Torso: width=322, height=330.
    # Shoulder sockets on torso:
    #   Front shoulder (left in image): x ~ 70 from torso left edge, y ~ 120 from torso top.
    #   Back shoulder (right in image): x ~ 250 from torso left edge, y ~ 120 from torso top.
    # Neck collar on torso: x ~ 160 from torso left edge, y ~ 45 from torso top.
    # Waist on torso: x ~ 160, y ~ 310 (bottom of belt).
    
    # Relative to Pelvis (center of belt, i.e. torso center bottom [0, 0]):
    #   Torso origin / pivot: [0.50, 0.94]
    #   Head pivot: [0.46, 0.94], offset: [2, -245]
    #   Front Arm (near): pivot: [0.65, 0.22], offset: [-70, -195], z: 40
    #   Back Arm (far): pivot: [0.35, 0.22], offset: [75, -200], z: 5
    #   Front Leg (near): pivot: [0.52, 0.08], offset: [-35, -5], z: 25
    #   Back Leg (far): pivot: [0.48, 0.08], offset: [45, -5], z: 10
    
    manifest = {
        "version": "2.0",
        "canvas_size": [1024, 1024],
        "pelvis_origin": [512, 590],
        "parts": {
            "head": {
                "file": "head.png",
                "width": head_img.width,
                "height": head_img.height,
                "bbox": [0, 0, head_img.width, head_img.height],
                "pivot_anchor": [0.46, 0.94],
                "offset_from_pelvis": [2, -245],
                "z_index": 30,
                "slot": "HEAD"
            },
            "torso": {
                "file": "torso.png",
                "width": torso_img.width,
                "height": torso_img.height,
                "bbox": [0, 0, torso_img.width, torso_img.height],
                "pivot_anchor": [0.50, 0.94],
                "offset_from_pelvis": [0, 0],
                "z_index": 20,
                "slot": "CHEST"
            },
            "arm_front": {
                "file": "arm_front.png",
                "width": arm_front_img.width,
                "height": arm_front_img.height,
                "bbox": [0, 0, arm_front_img.width, arm_front_img.height],
                "pivot_anchor": [0.62, 0.22],
                "offset_from_pelvis": [-72, -195],
                "z_index": 40,
                "slot": "WEAPON"
            },
            "arm_back": {
                "file": "arm_back.png",
                "width": arm_back_img.width,
                "height": arm_back_img.height,
                "bbox": [0, 0, arm_back_img.width, arm_back_img.height],
                "pivot_anchor": [0.35, 0.22],
                "offset_from_pelvis": [75, -200],
                "z_index": 5,
                "slot": "GAUNTLETS"
            },
            "leg_front": {
                "file": "leg_front.png",
                "width": leg_front_img.width,
                "height": leg_front_img.height,
                "bbox": [0, 0, leg_front_img.width, leg_front_img.height],
                "pivot_anchor": [0.52, 0.08],
                "offset_from_pelvis": [-35, -5],
                "z_index": 25,
                "slot": "BOOTS"
            },
            "leg_back": {
                "file": "leg_back.png",
                "width": leg_back_img.width,
                "height": leg_back_img.height,
                "bbox": [0, 0, leg_back_img.width, leg_back_img.height],
                "pivot_anchor": [0.48, 0.08],
                "offset_from_pelvis": [45, -5],
                "z_index": 10,
                "slot": "BOOTS"
            }
        }
    }

    manifest_path = os.path.join(parts_dir, 'miner_skeleton.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print('Updated manifest at', manifest_path)

    # Re-generate assemble preview
    canvas = Image.new('RGBA', (1024, 1024), (255, 255, 255, 0))
    center_x, center_y = 512, 600
    sorted_parts = sorted(manifest['parts'].items(), key=lambda x: x[1]['z_index'])
    
    for part_name, info in sorted_parts:
        part_img = Image.open(os.path.join(parts_dir, info['file']))
        pivot_x = int(info['pivot_anchor'][0] * part_img.width)
        pivot_y = int(info['pivot_anchor'][1] * part_img.height)
        offset_x, offset_y = info['offset_from_pelvis']
        
        pos_x = center_x + offset_x - pivot_x
        pos_y = center_y + offset_y - pivot_y
        
        canvas.paste(part_img, (int(pos_x), int(pos_y)), part_img)

    preview_path = '/home/luke/.gemini/antigravity-ide/brain/b123f84c-88a7-44d6-930a-0e96d55fd395/assembled_character_preview.png'
    canvas.save(preview_path)
    print('Saved preview to', preview_path)

    # Mirror to client & admin
    for f in os.listdir(parts_dir):
        src_f = os.path.join(parts_dir, f)
        shutil.copy2(src_f, os.path.join(client_public_dir, f))
        shutil.copy2(src_f, os.path.join(admin_public_dir, f))
    print('Mirrored to client & admin.')

if __name__ == '__main__':
    main()
