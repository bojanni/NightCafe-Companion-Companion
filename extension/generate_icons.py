"""
Generate PNG icons for the NightCafe Importer extension.
Run: python generate_icons.py
"""
import os
from PIL import Image, ImageDraw, ImageFont
import math

def create_icon(size):
    """Create a purple gradient icon with an upward arrow."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background circle with gradient effect (approximated)
    # Draw layered circles for gradient effect
    steps = 30
    for i in range(steps, 0, -1):
        ratio = i / steps
        r = int(124 * ratio + 45 * (1 - ratio))  # 7c -> 2d purple
        g = int(58 * ratio + 20 * (1 - ratio))
        b = int(237 * ratio + 150 * (1 - ratio))
        alpha = 255

        margin = int((size * 0.08) * (steps - i) / steps)
        bbox = [margin, margin, size - margin, size - margin]
        draw.ellipse(bbox, fill=(r, g, b, alpha))

    # Draw upload arrow icon (white)
    cx = size // 2
    cy = size // 2
    s = size

    # Arrow shaft
    shaft_w = max(2, s // 12)
    shaft_top = int(cy - s * 0.05)
    shaft_bottom = int(cy + s * 0.2)
    draw.rectangle(
        [cx - shaft_w, shaft_top, cx + shaft_w, shaft_bottom],
        fill='white'
    )

    # Arrow head (triangle pointing up)
    head_size = max(3, s // 5)
    arrow_top = int(cy - s * 0.22)
    arrow_pts = [
        (cx, arrow_top),
        (cx - head_size, shaft_top + 2),
        (cx + head_size, shaft_top + 2)
    ]
    draw.polygon(arrow_pts, fill='white')

    # Bottom base line
    base_y = shaft_bottom
    base_w = int(s * 0.35)
    base_h = max(2, s // 16)
    draw.rectangle(
        [cx - base_w, base_y, cx + base_w, base_y + base_h],
        fill='white'
    )

    return img

# Generate icons
sizes = [16, 32, 48, 128]
output_dir = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(output_dir, exist_ok=True)

for size in sizes:
    icon = create_icon(size)
    path = os.path.join(output_dir, f'icon{size}.png')
    icon.save(path, 'PNG')
    print(f'Created {path}')

print('All icons generated!')
