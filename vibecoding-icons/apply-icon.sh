#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$(cd "$DIR/../public" && pwd)"

CHOICE="${1:-2}"

case "$CHOICE" in
  1) TARGET="concept-1-card" ;;
  2) TARGET="concept-2-bold" ;;
  3) TARGET="concept-3-split" ;;
  4) TARGET="concept-4-doc" ;;
  5) TARGET="concept-5-geo" ;;
  *) echo "Usage: $0 [1-5]"; exit 1 ;;
esac

echo "Applying $TARGET to $PUBLIC_DIR..."

cp "$DIR/$TARGET/icon.svg" "$PUBLIC_DIR/favicon.svg"
cp "$DIR/$TARGET/icon-32.png" "$PUBLIC_DIR/favicon-32x32.png"
cp "$DIR/$TARGET/icon-16.png" "$PUBLIC_DIR/favicon-16x16.png"
cp "$DIR/$TARGET/icon-256.png" "$PUBLIC_DIR/apple-touch-icon.png"
cp "$DIR/$TARGET/icon-256.png" "$PUBLIC_DIR/icon-256.png"
cp "$DIR/$TARGET/favicon.ico" "$PUBLIC_DIR/favicon.ico"

echo "Done! Active icon updated in public/."
