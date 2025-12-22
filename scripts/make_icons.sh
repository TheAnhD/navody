#!/usr/bin/env bash
# Generates PNG sizes and an .icns file from assets/icon.svg
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="$ROOT/assets/icon.svg"
OUT="$ROOT/build_icons"
mkdir -p "$OUT/Icon.iconset"
SIZES=(16 32 64 128 256 512 1024)
for SIZE in "${SIZES[@]}"; do
  OUTPNG="$OUT/Icon.iconset/icon_${SIZE}x${SIZE}.png"
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w $SIZE -h $SIZE "$SRC" -o "$OUTPNG"
  elif command -v convert >/dev/null 2>&1; then
    convert -background transparent -resize ${SIZE}x${SIZE} "$SRC" "$OUTPNG"
  else
    echo "Please install librsvg2-bin or ImageMagick (convert) to auto-generate icons." >&2
    exit 1
  fi
done
# Create icns
ICONSET="$OUT/Icon.iconset"
if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "$ICONSET" -o "$ROOT/assets/app.icns"
  echo "Created $ROOT/assets/app.icns"
else
  echo "iconutil not found. On macOS run: iconutil -c icns $ICONSET -o assets/app.icns" >&2
  echo "Icon PNGs available in $ICONSET" >&2
fi
