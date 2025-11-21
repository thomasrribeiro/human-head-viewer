# Human Head Viewer

Interactive human head viewer in the browser.

**Live Demo:** https://thomasrribeiro.com/human-head-viewer/

<img src="public/screenshots/gui.png" alt="User interface" width="600">

*Displays chemical, electromagnetic, mechanical and thermal tissue properties.*

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm
- [uv](https://github.com/astral-sh/uv) package manager

### Installation

1. Create and activate Python virtual environment:
```bash
uv venv
source .venv/bin/activate 
```

2. Install Python dependencies:
```bash
uv pip install -r requirements.txt
```

3. Install Node.js dependencies:
```bash
npm install
```

4. Obtain required data:
   - **MIDA Model**: Visit the [MIDA Model page](https://itis.swiss/virtual-population/regional-human-models/mida-model/), request access to MIDA v1.0, and place in `data/`:
     - `MIDA_v1_surfaces/` (STL files)
     - `MIDA_v1_voxels/` (required MIDA_v1.mat and MIDA_v1.txt)
   - **IT'IS Tissue Database**: Download [Database V5.0](https://itis.swiss/virtual-population/tissue-properties/database/) and place `Database-V5-0/` folder in `data/` (requires `Thermal_dielectric_acoustic_MR properties_database_V5.0(Excel).xls` and `ElementalComposition_database V5.0(Excel).xls`)

5. Generate required files:
   ```bash
   ./scripts/generate-all-data.sh
   ```

   This script will:
   - Convert MIDA voxel data (MAT to VTK format)
   - Generate tissue properties from IT'IS database
   - Merge STL files and convert to PLY
   - Create downsampled versions of VTI and PLY files

### Running the Viewer

```bash
npm run dev
```

Open your browser to the URL shown in the terminal.

## References

- [Human head model](https://itis.swiss/virtual-population/regional-human-models/mida-model/) (subject to [MIDA license terms](https://itis.swiss/assets/Downloads/VirtualPopulation/License_Agreements/LicenseAgreementMIDA_2024.pdf))

- [IT'IS Tissue Properties Database](https://itis.swiss/virtual-population/tissue-properties/database/)

## License
© 2025 by [Thomas Ribeiro](https://thomasrribeiro.com). Licensed under the [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
