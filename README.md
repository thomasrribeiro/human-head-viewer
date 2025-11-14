# Human Head Viewer

Interactive human head viewer in the browser. 

<img src="public/screenshots/gui.png" alt="User interface" width="300">

*Displays chemical, electromagnetic, mechanical and thermal tissue properties.*

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Obtain MIDA model data:
   - Visit the [MIDA Model page](https://itis.swiss/virtual-population/regional-human-models/mida-model/)
   - Request access to the MIDA v1.0 dataset
   - Once downloaded, place the following folders in the `data/` directory:
     - `MIDA_v1_surfaces/` (115 STL surface files)
     - `MIDA_v1_voxels/` (voxel data including MIDA_v1.vti and MIDA_v1.txt)

### Running the Viewer

```bash
npm run dev
```

Open your browser to the URL shown in the terminal.

## References

- [Human head model](https://itis.swiss/virtual-population/regional-human-models/mida-model/) (subject to [MIDA license terms](https://itis.swiss/assets/Downloads/VirtualPopulation/License_Agreements/LicenseAgreementMIDA_2024.pdf))

- [IT'IS Tissue Properties Database](https://itis.swiss/virtual-population/tissue-properties/database/)
