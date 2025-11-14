#!/usr/bin/env python3
"""
Downsample PLY mesh file by factor of 2
Reduces face count to 1/4 while preserving tissue IDs
"""

import numpy as np
import sys
import os
import struct

def read_ply_with_tissue_id(filepath):
    """Read PLY file and extract vertices, faces, and tissue IDs"""
    with open(filepath, 'rb') as f:
        # Read header
        line = f.readline().decode('ascii').strip()
        if line != 'ply':
            raise ValueError("Not a PLY file")

        format_type = None
        vertex_count = 0
        face_count = 0
        has_tissue_id = False

        while True:
            line = f.readline().decode('ascii').strip()
            if line == 'end_header':
                break
            elif line.startswith('format'):
                format_type = line.split()[1]
            elif line.startswith('element vertex'):
                vertex_count = int(line.split()[2])
            elif line.startswith('element face'):
                face_count = int(line.split()[2])
            elif line == 'property uchar tissue_id':
                has_tissue_id = True

        if not has_tissue_id:
            raise ValueError("PLY file does not have tissue_id property")

        print(f"Reading {vertex_count:,} vertices and {face_count:,} faces...")

        # Read vertex data (x, y, z as float32, tissue_id as uint8)
        vertices = np.zeros((vertex_count, 3), dtype=np.float32)
        tissue_ids = np.zeros(vertex_count, dtype=np.uint8)

        if format_type == 'binary_little_endian':
            for i in range(vertex_count):
                data = f.read(13)  # 3 floats (12 bytes) + 1 uchar (1 byte)
                x, y, z, tid = struct.unpack('<fffB', data)
                vertices[i] = [x, y, z]
                tissue_ids[i] = tid

            # Read face data
            faces = []
            for i in range(face_count):
                n_verts = struct.unpack('<B', f.read(1))[0]
                if n_verts != 3:
                    raise ValueError(f"Only triangular faces supported, got {n_verts}")
                face_indices = struct.unpack('<III', f.read(12))
                faces.append(face_indices)

            faces = np.array(faces, dtype=np.int32)
        else:
            raise ValueError("Only binary_little_endian format supported")

    return vertices, faces, tissue_ids

def write_ply_with_tissue_id(filepath, vertices, faces, tissue_ids):
    """Write PLY file with tissue IDs"""
    with open(filepath, 'wb') as f:
        # Write header
        header = f"""ply
format binary_little_endian 1.0
comment Downsampled human head model with tissue IDs
element vertex {len(vertices)}
property float x
property float y
property float z
property uchar tissue_id
element face {len(faces)}
property list uchar int vertex_indices
end_header
"""
        f.write(header.encode('ascii'))

        # Write vertices with tissue IDs
        for i in range(len(vertices)):
            data = struct.pack('<fffB',
                             vertices[i, 0],
                             vertices[i, 1],
                             vertices[i, 2],
                             tissue_ids[i])
            f.write(data)

        # Write faces
        for face in faces:
            f.write(struct.pack('<B', 3))  # Triangle
            f.write(struct.pack('<III', face[0], face[1], face[2]))

def downsample_ply(input_file, output_file, factor=2):
    """Downsample PLY with tissue ID preservation"""
    import pyfqmr

    print(f"Reading PLY file: {input_file}")
    vertices, faces, tissue_ids = read_ply_with_tissue_id(input_file)

    print(f"Original vertices: {len(vertices):,}")
    print(f"Original faces: {len(faces):,}")
    print(f"Unique tissues: {len(np.unique(tissue_ids))}")

    target_faces = len(faces) // (factor ** 2)
    print(f"\nDownsampling to ~{target_faces:,} faces...")

    # Simplify mesh
    mesh_simplifier = pyfqmr.Simplify()
    mesh_simplifier.setMesh(vertices, faces)
    mesh_simplifier.simplify_mesh(target_count=target_faces, aggressiveness=7, preserve_border=True, verbose=10)

    new_vertices, new_faces, _ = mesh_simplifier.getMesh()

    print(f"\nDownsampled vertices: {len(new_vertices):,}")
    print(f"Downsampled faces: {len(new_faces):,}")

    # Preserve tissue IDs via nearest neighbor
    from scipy.spatial import cKDTree
    print("Assigning tissue IDs to new vertices...")
    tree = cKDTree(vertices)
    distances, indices = tree.query(new_vertices)
    new_tissue_ids = tissue_ids[indices]

    print(f"Preserved {len(np.unique(new_tissue_ids))} unique tissues")

    vertex_reduction = (1 - len(new_vertices) / len(vertices)) * 100
    face_reduction = (1 - len(new_faces) / len(faces)) * 100
    print(f"Vertex reduction: {vertex_reduction:.1f}%")
    print(f"Face reduction: {face_reduction:.1f}%")

    # Write output
    print(f"\nWriting downsampled PLY to: {output_file}")
    write_ply_with_tissue_id(output_file, new_vertices, new_faces, new_tissue_ids)
    print("Done!")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.join(script_dir, "../..")

    input_file = os.path.join(project_root, "data/merged_tissues.ply")
    output_file = os.path.join(project_root, "data/merged_tissues_downsampled_2x.ply")

    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]

    downsample_ply(input_file, output_file, factor=2)
