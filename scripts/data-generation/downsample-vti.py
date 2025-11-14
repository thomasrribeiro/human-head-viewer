#!/usr/bin/env python3
"""
Downsample VTI voxel file by factor of 2
Reduces memory usage and file size for faster loading
"""

import vtk
import sys
import os

def downsample_vti(input_file, output_file, factor=2):
    """
    Downsample a VTI file by the specified factor

    Args:
        input_file: Path to input VTI file
        output_file: Path to output downsampled VTI file
        factor: Downsampling factor (default: 2)
    """
    print(f"Reading VTI file: {input_file}")

    # Read the input VTI file
    reader = vtk.vtkXMLImageDataReader()
    reader.SetFileName(input_file)
    reader.Update()

    input_data = reader.GetOutput()
    dims = input_data.GetDimensions()
    spacing = input_data.GetSpacing()

    print(f"Original dimensions: {dims}")
    print(f"Original spacing: {spacing}")
    print(f"Original number of voxels: {dims[0] * dims[1] * dims[2]:,}")

    # Downsample using vtkImageResample
    resample = vtk.vtkImageResample()
    resample.SetInputData(input_data)
    resample.SetInterpolationModeToNearestNeighbor()  # Preserve tissue IDs

    # Set downsampling factor (0.5 = half resolution)
    magnification = 1.0 / factor
    resample.SetAxisMagnificationFactor(0, magnification)
    resample.SetAxisMagnificationFactor(1, magnification)
    resample.SetAxisMagnificationFactor(2, magnification)

    resample.Update()
    output_data = resample.GetOutput()

    new_dims = output_data.GetDimensions()
    new_spacing = output_data.GetSpacing()

    print(f"\nDownsampled dimensions: {new_dims}")
    print(f"Downsampled spacing: {new_spacing}")
    print(f"Downsampled number of voxels: {new_dims[0] * new_dims[1] * new_dims[2]:,}")

    reduction = (1 - (new_dims[0] * new_dims[1] * new_dims[2]) / (dims[0] * dims[1] * dims[2])) * 100
    print(f"Voxel count reduction: {reduction:.1f}%")

    # Write the downsampled VTI file
    print(f"\nWriting downsampled VTI to: {output_file}")
    writer = vtk.vtkXMLImageDataWriter()
    writer.SetFileName(output_file)
    writer.SetInputData(output_data)
    writer.Write()

    print("Done!")

if __name__ == "__main__":
    # Default paths relative to project root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.join(script_dir, "../..")

    input_file = os.path.join(project_root, "data/MIDA_v1_voxels/MIDA_v1.vti")
    output_file = os.path.join(project_root, "data/MIDA_v1_voxels/MIDA_v1_downsampled_2x.vti")

    # Allow command line arguments
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]

    downsample_vti(input_file, output_file, factor=2)
