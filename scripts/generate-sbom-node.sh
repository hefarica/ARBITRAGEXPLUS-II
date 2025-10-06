#!/usr/bin/env bash
set -euo pipefail

echo "📦 Generating Node.js SBOM (Software Bill of Materials)..."

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js."
    exit 1
fi

echo "📊 Using npm list to generate dependency tree..."
npm list --all --json > sbom-node-dependencies.json 2>/dev/null || true
npm list --all > sbom-node-dependencies.txt 2>/dev/null || true

echo "🔍 Generating audit report..."
npm audit --json > sbom-node-audit.json 2>/dev/null || echo '{"vulnerabilities":{}}' > sbom-node-audit.json

echo "✅ SBOM generated:"
echo "   - sbom-node-dependencies.txt (human-readable)"
echo "   - sbom-node-dependencies.json (npm format)"
echo "   - sbom-node-audit.json (security audit)"
echo ""
echo "📝 To install CycloneDX tool for complete SBOM:"
echo "   npm install -g @cyclonedx/cyclonedx-npm"
echo "   cyclonedx-npm --output-file sbom-node-cyclonedx.json"
