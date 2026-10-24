#!/bin/bash
# Generate the Material 3 color roles from one seed color, the way Flutter's
# ColorScheme.fromSeed (Tonal Spot) does, plus one harmonized "caution" role.
#
# Usage: m3-palette.sh <seed-hex> [caution-source-hex]
#   m3-palette.sh "#6750A4"   (Material 3 baseline purple)
#
# Output: a CSS :root block (paste into src/styles.css) and a YAML block
# (paste into the DESIGN.md frontmatter `colors:`).
#
# Needs node + npm (network on first run). The library's ESM build has
# extensionless imports that Node cannot load directly, so it is bundled with
# esbuild in a throwaway directory first.
set -euo pipefail

SEED="${1:?usage: m3-palette.sh <seed-hex> [caution-source-hex]}"
# Amber source for the caution role; Material 3 has no warning role, so it is
# harmonized toward the seed instead of being used raw.
CAUTION="${2:-#E8A33D}"
for c in "$SEED" "$CAUTION"; do
  [[ "$c" =~ ^#[0-9A-Fa-f]{6}$ ]] || { echo "color must be #RRGGBB: $c" >&2; exit 1; }
done
# Pinned: role definitions change between releases and would shift every token.
LIB_VERSION="0.4.0"
ESBUILD_VERSION="0.28.2"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
npm init -y >/dev/null 2>&1
npm install --silent "@material/material-color-utilities@$LIB_VERSION" "esbuild@$ESBUILD_VERSION" > npm.log 2>&1 \
  || { echo "npm install failed (network or registry):" >&2; tail -20 npm.log >&2; exit 1; }

cat > gen.mjs <<'EOF'
import { argbFromHex, hexFromArgb, Hct, SchemeTonalSpot, MaterialDynamicColors, Blend, TonalPalette } from "@material/material-color-utilities";
const [seed, cautionSrc] = process.argv.slice(2);
// isDark = false (light theme only), contrastLevel = 0 (Material 3 standard contrast).
const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), false, 0);
const roles = [
  ["primary", "primary"], ["on-primary", "onPrimary"],
  ["primary-container", "primaryContainer"], ["on-primary-container", "onPrimaryContainer"],
  ["secondary-container", "secondaryContainer"], ["on-secondary-container", "onSecondaryContainer"],
  ["tertiary", "tertiary"], ["tertiary-container", "tertiaryContainer"], ["on-tertiary-container", "onTertiaryContainer"],
  ["error", "error"], ["error-container", "errorContainer"], ["on-error-container", "onErrorContainer"],
  ["surface", "surface"], ["on-surface", "onSurface"], ["on-surface-variant", "onSurfaceVariant"],
  ["sc-lowest", "surfaceContainerLowest"], ["sc-low", "surfaceContainerLow"], ["sc", "surfaceContainer"],
  ["sc-high", "surfaceContainerHigh"], ["sc-highest", "surfaceContainerHighest"],
  ["outline", "outline"], ["outline-variant", "outlineVariant"],
  ["inverse-surface", "inverseSurface"], ["inverse-on-surface", "inverseOnSurface"],
];
const out = roles.map(([css, key]) => [css, hexFromArgb(MaterialDynamicColors[key].getArgb(scheme))]);
// Caution: tone 40 for text/icons, 95 for the band, 30 for text on the band.
const caution = TonalPalette.fromInt(Blend.harmonize(argbFromHex(cautionSrc), argbFromHex(seed)));
out.push(["caution", hexFromArgb(caution.tone(40))], ["caution-container", hexFromArgb(caution.tone(95))], ["on-caution-container", hexFromArgb(caution.tone(30))]);
out.push(["brand", seed.toLowerCase()]);
console.log("/* CSS: paste into :root of src/styles.css */\n:root {");
for (const [k, v] of out) console.log(`  --${k}: ${v};`);
console.log("}\n\n# YAML: paste into DESIGN.md frontmatter\ncolors:");
for (const [k, v] of out) console.log(`  ${k}: "${v.toUpperCase()}"`);
EOF
./node_modules/.bin/esbuild gen.mjs --bundle --platform=node --outfile=gen.cjs --log-level=error
node gen.cjs "$SEED" "$CAUTION"
