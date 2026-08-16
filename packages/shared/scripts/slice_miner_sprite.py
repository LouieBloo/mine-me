#!/usr/bin/env python3
"""
slice_miner_sprite.py
Slices the base miner sprite (1024x1024) into articulated, registered skeletal parts:
- head (face, hard hat, headlamp)
- torso (chest, belly, suspenders)
- arm_front (near arm + hand)
- arm_back (far arm + hand)
- leg_front (near leg + boot)
- leg_back (far leg + boot)

Exports clean PNGs and miner_skeleton.json manifest defining pivot joints,
dimensions, z-order, and socket attachment points.
"""

import os
import shutil
import json
from PIL import Image, ImageDraw
import numpy as np

def main():
    src_path = '/home/luke/code/mine-me/packages/shared/assets/sprites/characters/miner_base.png'
    output_dir = '/home/luke/code/mine-me/packages/shared/assets/sprites/characters/miner'
    client_output_dir = '/home/luke/code/mine-me/apps/client/public/assets/sprites/characters/miner'
    
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(client_output_dir, exist_ok=True)

    img = Image.open(src_path).convert('RGBA')
    width, height = img.size # 1024, 1024
    
    # We define polygon masks for each anatomical segment in full-canvas space
    # so they fit together with 100% pixel-perfect alignment.
    # The origin/pelvis center is located around (512, 590).
    
    # Base pelvis origin for character coordinate system
    PELVIS_ORIGIN = (512, 590)

    # 1. Head: helmet, lamp, face, beard, neck down to collar
    # polygon coordinates
    head_poly = [
        (390, 80), (660, 80), (660, 200), (630, 320), (510, 340), 
        (470, 325), (420, 280), (390, 200)
    ]

    # 2. Arm Front (near arm: left side from viewer, on top of torso)
    arm_front_poly = [
        (290, 275), (445, 275), (460, 360), (430, 480), (455, 590),
        (455, 720), (330, 720), (290, 520), (290, 360)
    ]

    # 3. Arm Back (far arm: right side from viewer, behind torso/legs)
    arm_back_poly = [
        (600, 300), (735, 300), (735, 700), (620, 700), (600, 500)
    ]

    # 4. Leg Front (near leg: left side from viewer, lower body)
    leg_front_poly = [
        (340, 570), (510, 570), (510, 760), (515, 985), (340, 985),
        (340, 750)
    ]

    # 5. Leg Back (far leg: right side from viewer, lower body)
    leg_back_poly = [
        (505, 560), (700, 560), (700, 960), (505, 960), (505, 760)
    ]

    # 6. Torso (body trunk, suspenders, shoulders, waist)
    # everything between neck and pelvis, excluding front arm and back arm
    torso_poly = [
        (390, 280), (630, 280), (640, 450), (610, 600), (512, 600),
        (360, 600), (360, 450), (390, 320)
    ]

    parts_def = {
        'head': {
            'poly': head_poly,
            'pivot_local': [0.5, 0.9], # Pivot at neck
            'pivot_world': [520, 310],
            'z_index': 30,
            'slot': 'HEAD'
        },
        'torso': {
            'poly': torso_poly,
            'pivot_local': [0.5, 0.95], # Pivot at pelvis
            'pivot_world': [512, 590],
            'z_index': 20,
            'slot': 'CHEST'
        },
        'arm_front': {
            'poly': arm_front_poly,
            'pivot_local': [0.65, 0.12], # Pivot at shoulder
            'pivot_world': [385, 330],
            'z_index': 40,
            'slot': 'WEAPON'
        },
        'arm_back': {
            'poly': arm_back_poly,
            'pivot_local': [0.35, 0.12], # Pivot at back shoulder
            'pivot_world': [610, 340],
            'z_index': 5,
            'slot': 'GAUNTLETS'
        },
        'leg_front': {
            'poly': leg_front_poly,
            'pivot_local': [0.55, 0.08], # Pivot at near hip
            'pivot_world': [445, 600],
            'z_index': 25,
            'slot': 'BOOTS'
        },
        'leg_back': {
            'poly': leg_back_poly,
            'pivot_local': [0.45, 0.08], # Pivot at far hip
            'pivot_world': [580, 600],
            'z_index': 10,
            'slot': 'BOOTS'
        }
    }

    # Extract cropped images with bounding boxes
    manifest = {
        'version': '1.0',
        'canvas_size': [1024, 1024],
        'pelvis_origin': [512, 590],
        'parts': {}
    }

    src_arr = np.array(img)

    for part_name, pdef in parts_def.items():
        mask_img = Image.new('L', (width, height), 0)
        draw = ImageDraw.Draw(mask_img)
        draw.polygon(pdef['poly'], fill=255)
        
        mask_arr = np.array(mask_img) > 0
        part_arr = np.zeros_like(src_arr)
        part_arr[mask_arr] = src_arr[mask_arr]
        
        # Check non-transparent bbox
        alpha = part_arr[:, :, 3]
        y_indices, x_indices = np.where(alpha > 10)
        if len(y_indices) == 0:
            print(f'Warning: No pixels found for {part_name}')
            continue
            
        min_y, max_y = int(y_indices.min()), int(y_indices.max())
        min_x, max_x = int(x_indices.min()), int(x_indices.max())
        
        # Crop to tight bounding box
        cropped_arr = part_arr[min_y:max_y+1, min_x:max_x+1]
        part_cropped = Image.fromarray(cropped_arr, mode='RGBA')
        
        part_filename = f'{part_name}.png'
        part_filepath = os.path.join(output_dir, part_filename)
        part_cropped.save(part_filepath)
        
        c_w, c_h = part_cropped.size
        # Local pivot inside cropped bounding box
        pivot_w = pdef['pivot_world']
        pivot_in_crop_x = (pivot_w[0] - min_x) / c_w
        pivot_in_crop_y = (pivot_w[1] - min_y) / c_h
        
        # Offset of pivot relative to Pelvis Origin
        offset_from_pelvis = [pivot_w[0] - PELVIS_ORIGIN[0], pivot_w[1] - PELVIS_ORIGIN[1]]

        manifest['parts'][part_name] = {
            'file': part_filename,
            'width': c_w,
            'height': c_h,
            'bbox': [min_x, min_y, max_x, max_y],
            'pivot_anchor': [round(pivot_in_crop_x, 4), round(pivot_in_crop_y, 4)],
            'offset_from_pelvis': offset_from_pelvis,
            'z_index': pdef['z_index'],
            'slot': pdef['slot']
        }
        print(f'Exported {part_name}: size=({c_w}x{c_h}), pivot={pivot_in_crop_x:.3f}, {pivot_in_crop_y:.3f}')

    # Save manifest JSON
    manifest_path = os.path.join(output_dir, 'miner_skeleton.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print('Saved manifest to', manifest_path)

    # Mirror all generated files to client public directory
    for f in os.listdir(output_dir):
        shutil.copy2(os.path.join(output_dir, f), os.path.join(client_output_dir, f))
    print('Mirrored assets to client public directory.')

if __name__ == '__main__':
    main()
