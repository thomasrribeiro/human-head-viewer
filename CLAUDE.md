# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interactive 3D viewer for human head anatomy with tissue property visualization. Built with VTK.js, displaying chemical, electromagnetic, mechanical, and thermal properties of head tissues based on the MIDA anatomical model and IT'IS Foundation tissue database.

**Live Demo**: https://thomasrribeiro.github.io/human-head-viewer/

## Development Commands

```bash
# Start development server (Vite)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Development server runs on `http://localhost:5173` (default Vite port).

## Project Structure

```
human-head-viewer/
├── index.html                          # Main PLY viewer
├── index-stls.html                     # STL mode viewer
├── style.css                           # Global styles
│
├── public/                             # Static assets
│   ├── demos/                          # Demo GIFs/videos
│   ├── screenshots/                    # UI screenshots
│   ├── icons/                          # UI icons
│   └── images/                         # Project card images for external sites
│
├── src/
│   ├── viewers/                        # Viewer applications
│   │   ├── main-viewer.js              # PLY mode viewer
│   │   ├── main-viewer-stls.js         # STL mode viewer
│   │   ├── animate-viewer.js           # Animated slice (anatomical)
│   │   ├── animate-viewer-edges.js     # Animated slice (edge detection)
│   │   └── slice-generator.js          # Manual slice export tool
│   ├── utils/                          # Utility modules
│   │   ├── ply-loader.js               # PLY parser with tissue metadata
│   │   ├── cole-cole.js                # Electromagnetic properties
│   │   └── acoustic.js                 # Acoustic properties
│   └── demos/                          # Demo HTML files
│       ├── animate-viewer.html
│       ├── animate-viewer-edges.html
│       └── slice-generator.html
│
├── scripts/                            # Build/preprocessing (Node.js)
│   ├── data-generation/                # Property computation scripts
│   │   ├── compute-acoustic-properties.js
│   │   ├── compute-electromagnetic-properties.js
│   │   ├── compute-elemental-composition.js
│   │   ├── compute-nonlinearity-parameter.js
│   │   ├── compute-relaxation-times.js
│   │   ├── compute-thermal-properties.js
│   │   ├── compute-water-content.js
│   │   ├── generate-all-properties.js
│   │   └── tissue-properties-helper.js
│   └── mesh-tools/                     # Mesh conversion
│       └── convert-stl-to-ply.js
│
└── data/                               # Data files (symlinks/gitignored)
```

## Architecture

### Core Applications

**Main Viewer** ([index.html](index.html) + [src/viewers/main-viewer.js](src/viewers/main-viewer.js))
- Interactive 3D viewer with tissue property visualization
- Two loading modes:
  - PLY mode ([index.html](index.html)): Loads merged PLY volume from `data/merged_tissues.ply` via [src/utils/ply-loader.js](src/utils/ply-loader.js)
  - STL mode ([index-stls.html](index-stls.html)): Loads 117 individual STL surface files from `/data/MIDA_v1.0/MIDA_v1_surfaces/`
- Loads voxel slice data from `/data/MIDA_v1.0/MIDA_v1_voxels/MIDA_v1.vti`
- Supports multiple visualization modes via dropdown (anatomical, density, conductivity, etc.)
- Features clipping plane with vertical slider for axial slices
- Frequency-dependent property calculation for electromagnetic and acoustic properties

**Animation Viewers**
- [src/demos/animate-viewer.html](src/demos/animate-viewer.html) + [src/viewers/animate-viewer.js](src/viewers/animate-viewer.js): Animated slice with volume (0-100 range, 6000ms, anatomical colors)
- [src/demos/animate-viewer-edges.html](src/demos/animate-viewer-edges.html) + [src/viewers/animate-viewer-edges.js](src/viewers/animate-viewer-edges.js): Animated slice with edge detection (0-95 range, 6000ms, white background with black edges)

**Slice Generator** ([src/demos/slice-generator.html](src/demos/slice-generator.html) + [src/viewers/slice-generator.js](src/viewers/slice-generator.js))
- Manual slice export tool for generating edge-detected slices
- Features: vertical slider for slice selection, real-time edge detection, PNG export with transparent background
- Camera positioned to view slice face-on (looking down Y-axis)
- Adjustable rotation (`rotationAngle`) and zoom (`camera.zoom()`) parameters in code
- Canvas width adjustable in HTML (default 350px)

### Data Flow

1. **Tissue Metadata**: `MIDA_v1.txt` maps tissue IDs → RGB colors + names
2. **Property Data**: CSV files in `/data/Database-V5-0/` contain tissue properties
3. **Geometry**:
   - STL files: Surface meshes for each anatomical structure
   - VTI file: Voxelized volume data (flipped along Z-axis in code)
4. **Rendering Pipeline**: VTK.js actors/mappers with custom color transfer functions

### Key Modules

**[src/utils/ply-loader.js](src/utils/ply-loader.js)**
- Custom PLY parser supporting binary/ASCII formats with tissue ID metadata
- Parses `property uchar tissue_id` or `property uchar tissueId` from PLY header
- Returns tissue-separated polydata for individual tissue rendering
- Used by main viewer to load merged mesh instead of 117 individual STL files

**[src/utils/cole-cole.js](src/utils/cole-cole.js)**
- Implements 4-term Cole-Cole dispersion model
- Calculates frequency-dependent permittivity and conductivity
- Uses parameters: `{ef, terms: [{delta, tau, alpha}], sigmaIonic}`

**[src/utils/acoustic.js](src/utils/acoustic.js)**
- Calculates acoustic attenuation: `α = α0 * f^b`
- Frequency-dependent acoustic properties

**Property Loading Pattern**
- Each property type (density, conductivity, etc.) loaded from separate CSV
- Maps tissue name → property value
- Tracks min/max for colormap scaling
- For frequency-dependent properties: stores raw parameters, calculates on-the-fly

### Coordinate Systems & Transformations

**Critical Implementation Details:**
- Voxel data requires Z-axis flip (applied in all viewers)
- STL and voxel alignment uses offset calculations based on bounds
- Slice positioning: Y-axis aligned, requires manual offsets (`xManualOffset=1`, `zManualOffset=2`)
- Camera setup: `azimuth(210)`, `elevation(30)`, `zoom(1.3)`, vertical offset `-20`

### Visualization Modes

**Dropdown Categories (Alphabetically Ordered):**
1. **Chemical**: Elemental Composition (C, H, N, O, P, etc.), Water Content
2. **Electromagnetic**: Conductivity, Permittivity, Relaxation Time (T1/T2 at different field strengths)
3. **Mechanical**: Attenuation Constant, Density, Non-linearity Parameter, Speed of Sound
4. **Thermal**: Heat Capacity, Heat Generation Rate, Heat Transfer Rate, Thermal Conductivity

**Colormaps:**
- Chemical properties: Viridis colorscale
- Other properties: Mako colorscale (purple to green)
- Edge-detected animation: White tissues with black edges

### Animation Implementation

Both animation viewers use anime.js with:
- `direction: 'alternate'` for seamless looping
- `easing: 'easeInOutSine'` for smooth motion
- Real-time edge detection (edges viewer): Detects tissue boundaries by comparing neighbor voxel IDs

## Data Sources

- **MIDA Model**: Subject to [MIDA license terms](https://itis.swiss/assets/Downloads/VirtualPopulation/License_Agreements/LicenseAgreementMIDA_2024.pdf)
- **Tissue Properties**: IT'IS Foundation Database V5.0

## Special Considerations

- **Edge Detection**: VTK.js supports edge rendering on `vtkActor` (STL) via `setEdgeVisibility(true)` but NOT on `vtkImageSlice`. For voxel edge detection, must implement custom neighbor-comparison algorithm (see `updateEdgeDetection()` in [src/viewers/animate-viewer-edges.js](src/viewers/animate-viewer-edges.js)).
- **Slider Orientation**: Use `writing-mode: vertical-lr; direction: rtl;` for vertical sliders (NOT deprecated `-webkit-appearance: slider-vertical`)
- **Property Calculations**: Electromagnetic (Cole-Cole) and acoustic (attenuation) properties are calculated dynamically based on frequency input
- **Colorbar**: Positioned with careful CSS to avoid overlap with render area, displays 5 tick values with dynamic decimal precision
- **Transparent Background Export**: Set renderer background to `[0, 0, 0, 0]` and use edge opacity transfer function (`addPoint(0, 0.0)` for transparent, `addPoint(1, 1.0)` for opaque edges)
- **File Naming**: All files use kebab-case (hyphens) for consistency with modern frontend conventions

## Data Requirements

The project requires MIDA v1.0 dataset from IT'IS Foundation:
- Place in `/data/MIDA_v1.0/` directory
- Required files:
  - `MIDA_v1_surfaces/*.stl` (117 files for STL mode)
  - `MIDA_v1_voxels/MIDA_v1.vti` (voxel data)
  - `MIDA_v1_voxels/MIDA_v1.txt` (tissue ID/color mapping)
- Optional: `merged_tissues.ply` (pre-merged mesh for faster loading)
