#!/usr/bin/env bash
set -euo pipefail

echo "📦 Generating Rust SBOM (Software Bill of Materials)..."

if ! command -v cargo &> /dev/null; then
    echo "❌ cargo not found. Please install Rust toolchain."
    exit 1
fi

cd rust-mev-engine

echo "📊 Using cargo tree to generate dependency list..."
cargo tree --format "{p} {l}" > ../sbom-rust-dependencies.txt

echo "🔍 Generating detailed SBOM..."
cat > ../sbom-rust.json << 'EOF'
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.4",
  "version": 1,
  "metadata": {
    "timestamp": "TIMESTAMP_PLACEHOLDER",
    "component": {
      "type": "application",
      "name": "mev-engine-minimal",
      "version": "3.6.0"
    }
  },
  "components": []
}
EOF

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
sed -i "s/TIMESTAMP_PLACEHOLDER/$TIMESTAMP/" ../sbom-rust.json

echo "✅ SBOM generated:"
echo "   - sbom-rust-dependencies.txt (human-readable)"
echo "   - sbom-rust.json (CycloneDX format)"
echo ""
echo "📝 To install CycloneDX tool for complete SBOM:"
echo "   cargo install cargo-cyclonedx"
echo "   cargo cyclonedx --format json --output-file sbom-rust-full.json"
