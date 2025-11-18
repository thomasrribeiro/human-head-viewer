#!/usr/bin/env python3
"""
Convert MIDA .mat file to VTK ImageData format (.vti)
This script reads the tissuedistrib array from the .mat file and saves it as a VTK file
"""

import numpy as np
import scipy.io as sio
from pathlib import Path

BACKGROUND_VALUE = 50  # value used in the MAT file to encode empty space
TRANSPARENT_VALUE = 0  # value we remap the background voxels to in the VTI

def convert_mat_to_vti(mat_file_path, output_path):
    """
    Convert .mat file containing tissuedistrib to .vti format

    Args:
        mat_file_path: Path to input .mat file
        output_path: Path to output .vti file
    """
    print(f"Loading {mat_file_path}...")

    # Load the .mat file
    mat_data = sio.loadmat(mat_file_path)

    # Extract the tissuedistrib array
    if 'tissuedistrib' not in mat_data:
        raise KeyError("'tissuedistrib' key not found in .mat file")

    tissue_data = mat_data['tissuedistrib'].astype(np.uint16, copy=False)
    print(f"Data shape: {tissue_data.shape}")
    print(f"Data type: {tissue_data.dtype}")
    print(f"Data range: [{tissue_data.min()}, {tissue_data.max()}]")

    # Remap background voxels to the transparent value so the renderer
    # can skip them without per-frame checks.
    background_mask = tissue_data == BACKGROUND_VALUE
    background_count = int(np.count_nonzero(background_mask))
    if background_count:
        tissue_data = tissue_data.copy()
        tissue_data[background_mask] = TRANSPARENT_VALUE
        print(f"Remapped {background_count} background voxels (value {BACKGROUND_VALUE}) to {TRANSPARENT_VALUE}.")

    new_min = tissue_data.min()
    new_max = tissue_data.max()
    print(f"Post-remap data range: [{new_min}, {new_max}]")

    # Get dimensions
    dims = tissue_data.shape

    # Create VTI file (XML format)
    print(f"Writing to {output_path}...")

    # MIDA spatial steps are 0.0005m = 0.5mm per voxel
    spacing = "0.5 0.5 0.5"

    with open(output_path, 'w') as f:
        # Write VTK header
        f.write('<?xml version="1.0"?>\n')
        f.write('<VTKFile type="ImageData" version="1.0" byte_order="LittleEndian" header_type="UInt64">\n')
        f.write(f'  <ImageData WholeExtent="0 {dims[0]-1} 0 {dims[1]-1} 0 {dims[2]-1}" ')
        f.write(f'Origin="0 0 0" Spacing="{spacing}">\n')
        f.write(f'    <Piece Extent="0 {dims[0]-1} 0 {dims[1]-1} 0 {dims[2]-1}">\n')
        f.write('      <PointData Scalars="tissue">\n')

        # Flatten and encode data
        flat_data = tissue_data.flatten('F')  # Fortran order (column-major)

        # Write as binary data (base64 encoded with size header)
        import base64
        import struct

        binary_data = flat_data.astype(np.uint8).tobytes()

        # Prepend the size as UInt64 (8 bytes)
        size_header = struct.pack('<Q', len(binary_data))
        full_binary = size_header + binary_data
        encoded_data = base64.b64encode(full_binary).decode('ascii')

        f.write(f'        <DataArray type="UInt8" Name="tissue" format="binary">\n')
        f.write(f'          {encoded_data}\n')
        f.write('        </DataArray>\n')
        f.write('      </PointData>\n')
        f.write('    </Piece>\n')
        f.write('  </ImageData>\n')
        f.write('</VTKFile>\n')

    print("Conversion complete!")
    print(f"Output file: {output_path}")

if __name__ == "__main__":
    # Set paths (using symlink structure)
    mat_file = Path("data/MIDA_v1_voxels/MIDA_v1.mat")
    output_file = Path("data/MIDA_v1_voxels/MIDA_v1.vti")

    # Create output directory if it doesn't exist
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # Convert
    convert_mat_to_vti(mat_file, output_file)
