#!/bin/bash

# Script to generate all required data files for human-head-viewer
# This script should be run from the project root directory

set -e  # Exit on any error

echo "=========================================="
echo "Generating all data files"
echo "=========================================="
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "Error: This script must be run from the project root directory"
    exit 1
fi

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "Activating Python virtual environment..."
    source .venv/bin/activate
fi

# Step 1: Convert MIDA voxel data
echo "Step 1/5: Converting MIDA voxel data (MAT to VTK)..."
uv run python scripts/mesh-tools/convert-mat-to-vtk.py
echo "✓ MIDA voxel data converted"
echo ""

# Step 2: Generate tissue properties from IT'IS database
echo "Step 2/5: Generating tissue properties from IT'IS database..."
uv run python scripts/data-generation/generate-tissue-properties.py
echo "✓ Tissue properties generated"
echo ""

# Step 3: Merge STL files to PLY
echo "Step 3/5: Merging STL files and converting to PLY..."
node scripts/mesh-tools/convert-stl-to-ply.js
echo "✓ STL files merged to PLY"
echo ""

# Step 4: Downsample VTI file
echo "Step 4/5: Downsampling VTI file..."
uv run python scripts/data-generation/downsample-vti.py
echo "✓ VTI file downsampled"
echo ""

# Step 5: Downsample PLY file
echo "Step 5/5: Downsampling PLY file..."
uv run python scripts/data-generation/downsample-ply.py
echo "✓ PLY file downsampled"
echo ""

echo "=========================================="
echo "All data files generated successfully!"
echo "=========================================="
echo ""
echo "You can now run 'npm run dev' to start the viewer"
