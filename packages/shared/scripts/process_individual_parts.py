#!/usr/bin/env python3
"""
process_individual_parts.py
Processes newly generated individual miner parts:
- Removes white background to produce crisp transparent PNGs
- Crops each part to tight bounding box
- Normalizes dimensions and scales for seamless skeletal assembly
- Includes new LEFT HAND for arm_back
- Calculates pivot anchors and relative joint offsets from pelvis
- Exports to packages/shared/assets/sprites/characters/miner/ and client/admin public folders
"""

import os
import shutil
import json
from PIL import Image
import numpy as np

def remove_white_background(img: Image.Image, threshold: int = 240) -> Image.Image:
    """Convert white/near-white background to transparent alpha."""
    rgba = img.convert('RGBA')
    arr = np.array(rgba)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    
    # White or near-white mask
    white_mask = (r > threshold) & (g > threshold) & (b > threshold)
    arr[white_mask, 3] = 0
    
    # Optional smooth alpha for edges
    near_white_mask = (r > 220) & (g > 220) & (b > 220) & ~white_mask
    arr[near_white_mask, 3] = ((255 - np.mean(arr[near_white_mask, :3], axis=1)) * 4).astype(np.uint8)
    
    res = Image.fromarray(arr, mode='RGBA')
    return res

def crop_transparent(img: Image.Image, padding: int = 2, min_top_y: int = 0, min_left_x: int = 0) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Crop image to non-transparent bounding box with optional clamp."""
    arr = np.array(img)
    if min_top_y > 0:
        arr[:min_top_y, :, 3] = 0
    if min_left_x > 0:
        arr[:, :min_left_x, 3] = 0
        
    img = Image.fromarray(arr)
    bbox = img.getbbox()
    if not bbox:
        return img, (0, 0, img.width, img.height)
    
    min_x = max(0, bbox[0] - padding)
    min_y = max(0, bbox[1] - padding)
    max_x = min(img.width, bbox[2] + padding)
    max_y = min(img.height, bbox[3] + padding)
    
    cropped = img.crop((min_x, min_y, max_x, max_y))
    return cropped, (min_x, min_y, max_x, max_y)

def main():
    base_brain_dir = '/home/luke/.gemini/antigravity-ide/brain/b123f84c-88a7-44d6-930a-0e96d55fd395'
    
    parts_raw = {
        'head': (os.path.join(base_brain_dir, 'miner_head_part_1786911035006.jpg'), 0, 0),
        'torso': (os.path.join(base_brain_dir, 'miner_torso_part_1786911046367.jpg'), 0, 0),
        'arm_front': (os.path.join(base_brain_dir, 'miner_arm_front_part_1786911058506.jpg'), 510, 240),
        'arm_back': (os.path.join(base_brain_dir, 'miner_arm_back_left_1786911896539.jpg'), 0, 0),
        'leg_front': (os.path.join(base_brain_dir, 'miner_leg_front_part_1786911142325.jpg'), 248, 0),
        'leg_back': (os.path.join(base_brain_dir, 'miner_leg_back_part_1786911152691.jpg'), 0, 0),
    }

    out_dir = '/home/luke/code/mine-me/packages/shared/assets/sprites/characters/miner'
    client_public_dir = '/home/luke/code/mine-me/apps/client/public/assets/sprites/characters/miner'
    admin_public_dir = '/home/luke/code/mine-me/apps/admin/public/assets/sprites/characters/miner'

    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(client_public_dir, exist_ok=True)
    os.makedirs(admin_public_dir, exist_ok=True)

    processed = {}
    for part_name, (path, min_top, min_left) in parts_raw.items():
        if not os.path.exists(path):
            print(f'Error: File {path} not found!')
            continue
        
        raw_img = Image.open(path)
        clean_img = remove_white_background(raw_img)
        cropped, bbox = crop_transparent(clean_img, min_top_y=min_top, min_left_x=min_left)
        
        processed[part_name] = {
            'img': cropped,
            'orig_size': cropped.size,
            'bbox': bbox
        }

    targets = {
        'head': {
            'target_h': 260,
            'pivot_anchor': [0.46, 0.94], # Bottom of neck
            'offset_from_pelvis': [2, -245],
            'z_index': 30,
            'slot': 'HEAD'
        },
        'torso': {
            'target_h': 310,
            'pivot_anchor': [0.50, 0.94], # Pelvis base / belt
            'offset_from_pelvis': [0, 0],
            'z_index': 20,
            'slot': 'CHEST'
        },
        'arm_front': {
            'target_h': 210,
            'pivot_anchor': [0.08, 0.18], # Top of forearm (sleeve opening)
            'offset_from_pelvis': [-78, -145],
            'z_index': 40,
            'slot': 'WEAPON'
        },
        'arm_back': {
            'target_h': 260,
            'pivot_anchor': [0.52, 0.12], # Shoulder / top of arm
            'offset_from_pelvis': [90, -180],
            'z_index': 5,
            'slot': 'GAUNTLETS'
        },
        'leg_front': {
            'target_h': 380,
            'pivot_anchor': [0.52, 0.05], # Hip / waistband
            'offset_from_pelvis': [-20, -55], # Tucked behind belt
            'z_index': 15,
            'slot': 'BOOTS'
        },
        'leg_back': {
            'target_h': 380,
            'pivot_anchor': [0.48, 0.05], # Hip / waistband
            'offset_from_pelvis': [35, -55], # Tucked behind belt
            'z_index': 10,
            'slot': 'BOOTS'
        }
    }

    manifest = {
        'version': '2.0',
        'canvas_size': [1024, 1024],
        'pelvis_origin': [512, 590],
        'parts': {}
    }

    for part_name, tdef in targets.items():
        item = processed[part_name]
        orig_img = item['img']
        w, h = orig_img.size
        target_h = tdef['target_h']
        target_w = int(w * (target_h / h))
        
        resized = orig_img.resize((target_w, target_h), Image.Resampling.LANCZOS)
        
        filename = f'{part_name}.png'
        out_path = os.path.join(out_dir, filename)
        resized.save(out_path, 'PNG')
        
        manifest['parts'][part_name] = {
            'file': filename,
            'width': target_w,
            'height': target_h,
            'bbox': [0, 0, target_w, target_h],
            'pivot_anchor': tdef['pivot_anchor'],
            'offset_from_pelvis': tdef['offset_from_pelvis'],
            'z_index': tdef['z_index'],
            'slot': tdef['slot']
        }
        print(f'Saved {part_name}.png: {target_w}x{target_h}')

    # Save skeleton manifest JSON
    manifest_path = os.path.join(out_dir, 'miner_skeleton.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print('Saved manifest to', manifest_path)

    # Mirror to client and admin public directories
    for f in os.listdir(out_dir):
        src_f = os.path.join(out_dir, f)
        shutil.copy2(src_f, os.path.join(client_public_dir, f))
        shutil.copy2(src_f, os.path.join(admin_public_dir, f))
    print('Mirrored all assets to client and admin public directories.')

if __name__ == '__main__':
    main()
