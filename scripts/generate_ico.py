from PIL import Image
import os

png_sizes = [256,128,64,48,32,16]
png_files = [f"assets/app-{s}.png" for s in png_sizes]
available = [f for f in png_files if os.path.exists(f)]

if not available:
    print('No PNGs found to build ICO. Generate app-<size>.png files first.')
    raise SystemExit(1)

# Use the largest available as base and request sizes for ICO
base = Image.open(available[0]).convert('RGBA')
# PIL will include provided sizes; it will re-scale the base image for each size
sizes = [(s, s) for s in png_sizes if os.path.exists(f"assets/app-{s}.png")]

print('Creating assets/app.ico with sizes:', sizes)
base.save('assets/app.ico', format='ICO', sizes=sizes)
print('Saved assets/app.ico')
