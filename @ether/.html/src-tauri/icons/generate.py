#!/usr/bin/env python3
"""Generate all Tauri app icons from a single source PNG.

Usage: python generate.py [source.png]
       Defaults to icon.png in the same directory.
"""
import struct, sys, os
from PIL import Image

DIR = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) < 2:
    print("Usage: python generate.py <source.png>", file=sys.stderr)
    sys.exit(1)
src = sys.argv[1]
img = Image.open(src).convert("RGBA")

def save_png(size, name):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(DIR, name))

# --- PNGs (Linux / generic) ---
save_png(32, "32x32.png")
save_png(128, "128x128.png")
save_png(256, "128x128@2x.png")

# --- ICO (Windows) ---
ico = img.resize((256, 256), Image.LANCZOS)
ico.save(os.path.join(DIR, "icon.ico"), format="ICO",
         sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

# --- ICNS (macOS) ---
# Modern ICNS: tagged entries with embedded PNGs
import io
ICNS_TYPES = [
    (b"ic07", 128),   # 128x128
    (b"ic08", 256),   # 256x256
    (b"ic09", 512),   # 512x512
    (b"ic13", 256),   # 128x128@2x
    (b"ic14", 512),   # 256x256@2x
]
entries = []
for tag, size in ICNS_TYPES:
    buf = io.BytesIO()
    img.resize((size, size), Image.LANCZOS).save(buf, format="PNG")
    data = buf.getvalue()
    entries.append(struct.pack(">4sI", tag, len(data) + 8) + data)

body = b"".join(entries)
icns = struct.pack(">4sI", b"icns", len(body) + 8) + body
with open(os.path.join(DIR, "icon.icns"), "wb") as f:
    f.write(icns)

# --- Android mipmap icons ---
ANDROID_RES = os.path.join(DIR, "..", "gen", "android", "app", "src", "main", "res")
MIPMAP_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
if os.path.isdir(ANDROID_RES):
    for folder, size in MIPMAP_SIZES.items():
        mipmap_dir = os.path.join(ANDROID_RES, folder)
        os.makedirs(mipmap_dir, exist_ok=True)
        resized = img.resize((size, size), Image.LANCZOS)
        # Composite onto #1c2127 background so Android doesn't show white
        bg = Image.new("RGBA", (size, size), (0x1c, 0x21, 0x27, 255))
        bg.paste(resized, (0, 0), resized)
        bg.save(os.path.join(mipmap_dir, "ic_launcher.png"))
        bg.save(os.path.join(mipmap_dir, "ic_launcher_round.png"))
        # Adaptive icon foreground: logo centered in 108dp canvas with safe zone padding
        # Safe zone is inner 66%, so scale icon to ~60% and center on transparent canvas
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        icon_size = int(size * 0.6)
        icon_resized = img.resize((icon_size, icon_size), Image.LANCZOS)
        offset = (size - icon_size) // 2
        fg.paste(icon_resized, (offset, offset), icon_resized)
        fg.save(os.path.join(mipmap_dir, "ic_launcher_foreground.png"))
    # Replace background with solid color
    bg_xml = os.path.join(ANDROID_RES, "drawable", "ic_launcher_background.xml")
    if os.path.isdir(os.path.join(ANDROID_RES, "drawable")):
        with open(bg_xml, "w") as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n')
            f.write('<vector xmlns:android="http://schemas.android.com/apk/res/android"\n')
            f.write('    android:width="108dp"\n')
            f.write('    android:height="108dp"\n')
            f.write('    android:viewportWidth="108"\n')
            f.write('    android:viewportHeight="108">\n')
            f.write('    <path\n')
            f.write('        android:fillColor="#1c2127"\n')
            f.write('        android:pathData="M0,0h108v108h-108z" />\n')
            f.write('</vector>\n')
    # Create adaptive icon XML (Android 8+) linking foreground + background
    anydpi_dir = os.path.join(ANDROID_RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi_dir, exist_ok=True)
    adaptive_xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@drawable/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n')
    with open(os.path.join(anydpi_dir, "ic_launcher.xml"), "w") as f:
        f.write(adaptive_xml)
    with open(os.path.join(anydpi_dir, "ic_launcher_round.xml"), "w") as f:
        f.write(adaptive_xml)
    print(f"  Android mipmap icons generated in {ANDROID_RES}")

# --- iOS app icons ---
IOS_ASSETS = os.path.join(DIR, "..", "gen", "apple", "Assets.xcassets", "AppIcon.appiconset")
IOS_SIZES = [20, 29, 40, 60, 76, 83.5, 1024]
IOS_SCALES = {20: [2,3], 29: [2,3], 40: [2,3], 60: [2,3], 76: [2], 83.5: [2], 1024: [1]}
if os.path.isdir(IOS_ASSETS):
    for base_size, scales in IOS_SCALES.items():
        for scale in scales:
            px = int(base_size * scale)
            name = f"AppIcon-{base_size}x{base_size}@{scale}x.png"
            img.resize((px, px), Image.LANCZOS).save(os.path.join(IOS_ASSETS, name))
    print(f"  iOS app icons generated in {IOS_ASSETS}")

print(f"Generated icons from {src}:")
for f in sorted(os.listdir(DIR)):
    if f == os.path.basename(__file__):
        continue
    path = os.path.join(DIR, f)
    print(f"  {f:20s} {os.path.getsize(path):>8d} bytes")
