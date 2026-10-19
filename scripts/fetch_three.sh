#!/usr/bin/env bash
# Download three.js into <pageDir>/vendor so a WebGL page can run fully offline during capture.
#   fetch_three.sh <pageDir> [version=0.186.0]
# The page then uses:
#   <script type="importmap">{ "imports": { "three": "./vendor/three.module.js", "three/addons/": "./vendor/jsm/" } }</script>
set -euo pipefail
DIR=${1:?usage: fetch_three.sh <pageDir> [version]}; VER=${2:-0.186.0}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://registry.npmjs.org/three/-/three-$VER.tgz" -o "$TMP/three.tgz"
tar -xzf "$TMP/three.tgz" -C "$TMP"
mkdir -p "$DIR/vendor"
cp "$TMP/package/build/three.module.js" "$DIR/vendor/"
[ -f "$TMP/package/build/three.core.js" ] && cp "$TMP/package/build/three.core.js" "$DIR/vendor/"
rm -rf "$DIR/vendor/jsm"; cp -r "$TMP/package/examples/jsm" "$DIR/vendor/jsm"
cp "$TMP/package/LICENSE" "$DIR/vendor/LICENSE.three.txt"
echo "three.js $VER -> $DIR/vendor"
