/**
 * PLY file loader for merged mesh with tissue identification
 */

import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';

/**
 * Parse PLY file and extract mesh data with tissue IDs
 * @param {ArrayBuffer} arrayBuffer - The PLY file content
 * @returns {Object} Object containing vertices and faces with tissue IDs
 */
export function parsePLY(arrayBuffer) {
  // First, parse the header (which is always ASCII)
  const uint8Array = new Uint8Array(arrayBuffer);
  let headerEnd = 0;
  let isBinary = false;
  let vertexCount = 0;
  let faceCount = 0;
  let hasCustomProperty = false;

  // Find end of header
  const headerBytes = [];
  for (let i = 0; i < uint8Array.length; i++) {
    headerBytes.push(uint8Array[i]);
    if (i > 10) {
      // Check for "end_header\n"
      const last11 = String.fromCharCode(...uint8Array.slice(i - 10, i + 1));
      if (last11 === 'end_header\n') {
        headerEnd = i + 1;
        break;
      }
    }
  }

  // Parse header
  const headerText = new TextDecoder('utf-8').decode(new Uint8Array(headerBytes));
  const headerLines = headerText.split('\n');

  for (const line of headerLines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('format binary')) {
      isBinary = true;
    } else if (trimmedLine.startsWith('format ascii')) {
      isBinary = false;
    } else if (trimmedLine.startsWith('element vertex')) {
      vertexCount = parseInt(trimmedLine.split(' ')[2]);
    } else if (trimmedLine.startsWith('element face')) {
      faceCount = parseInt(trimmedLine.split(' ')[2]);
    } else if (trimmedLine === 'property uchar tissue_id' || trimmedLine === 'property uchar tissueId') {
      hasCustomProperty = true;
    }
  }

  if (!hasCustomProperty) {
    console.error('PLY header:', headerText);
    throw new Error('PLY file does not contain tissue ID information');
  }

  const vertices = [];
  const vertexTissueIds = new Uint8Array(vertexCount);
  const faces = [];
  const faceTissueIds = [];

  if (isBinary) {
    // Create DataView for binary parsing
    const dataView = new DataView(arrayBuffer, headerEnd);
    let offset = 0;

    // Parse vertices (3 floats + 1 byte per vertex)
    for (let i = 0; i < vertexCount; i++) {
      const x = dataView.getFloat32(offset, true); offset += 4;
      const y = dataView.getFloat32(offset, true); offset += 4;
      const z = dataView.getFloat32(offset, true); offset += 4;
      const tissueId = dataView.getUint8(offset); offset += 1;

      vertices.push(x, y, z);
      vertexTissueIds[i] = tissueId;
    }

    // Parse faces
    for (let i = 0; i < faceCount; i++) {
      const vertexCount = dataView.getUint8(offset); offset += 1;

      if (vertexCount !== 3) {
        throw new Error(`Only triangular faces are supported (got ${vertexCount} vertices at face ${i})`);
      }

      const v1 = dataView.getInt32(offset, true); offset += 4;
      const v2 = dataView.getInt32(offset, true); offset += 4;
      const v3 = dataView.getInt32(offset, true); offset += 4;

      faces.push(3, v1, v2, v3);
      faceTissueIds.push(vertexTissueIds[v1]);
    }

  } else {
    // ASCII format parsing (keeping existing logic for fallback)

    const dataText = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer.slice(headerEnd)));
    const lines = dataText.split('\n');
    let lineIndex = 0;

    // Parse vertices
    for (let i = 0; i < vertexCount; i++) {
      const parts = lines[lineIndex++].trim().split(' ');
      vertices.push(
        parseFloat(parts[0]),
        parseFloat(parts[1]),
        parseFloat(parts[2])
      );
      vertexTissueIds[i] = parseInt(parts[3]);
    }

    // Parse faces
    for (let i = 0; i < faceCount; i++) {
      const parts = lines[lineIndex++].trim().split(' ');
      const vCount = parseInt(parts[0]);

      if (vCount !== 3) {
        throw new Error(`Only triangular faces are supported`);
      }

      faces.push(3, parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3]));
      faceTissueIds.push(vertexTissueIds[parseInt(parts[1])]);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    faces: new Uint32Array(faces),
    vertexTissueIds,
    faceTissueIds: new Uint8Array(faceTissueIds)
  };
}

/**
 * Create separate polydata objects for each tissue from merged mesh
 * @param {Object} meshData - Parsed PLY data
 * @returns {Map} Map of tissueId to vtkPolyData
 */
export function createTissuePolyData(meshData) {
  const tissuePolyDataMap = new Map();
  const { vertices, faces, vertexTissueIds, faceTissueIds } = meshData;

  // Group faces by tissue ID
  const tissueGroups = new Map();

  for (let i = 0; i < faceTissueIds.length; i++) {
    const tissueId = faceTissueIds[i];
    if (!tissueGroups.has(tissueId)) {
      tissueGroups.set(tissueId, []);
    }
    // Each face is 4 values: [3, v1, v2, v3]
    const faceStart = i * 4;
    tissueGroups.get(tissueId).push(
      faces[faceStart + 1], // v1
      faces[faceStart + 2], // v2
      faces[faceStart + 3]  // v3
    );
  }

  // Create polydata for each tissue
  let tissueIndex = 0;
  for (const [tissueId, faceVertices] of tissueGroups) {
    tissueIndex++;

    // Find unique vertices used by this tissue
    const uniqueVertexIndices = new Set(faceVertices);
    const vertexMap = new Map(); // Map old index to new index
    const tissueVertices = [];

    let newVertexIndex = 0;
    for (const oldIndex of uniqueVertexIndices) {
      vertexMap.set(oldIndex, newVertexIndex);
      // Extract x, y, z for this vertex
      tissueVertices.push(
        vertices[oldIndex * 3],
        vertices[oldIndex * 3 + 1],
        vertices[oldIndex * 3 + 2]
      );
      newVertexIndex++;
    }

    const polyData = vtkPolyData.newInstance();

    // Set only the vertices used by this tissue
    const points = vtkPoints.newInstance();
    points.setData(new Float32Array(tissueVertices), 3);
    polyData.setPoints(points);

    // Create cell array with remapped vertex indices
    const polys = vtkCellArray.newInstance();
    const cellData = new Uint32Array(faceVertices.length + faceVertices.length / 3);

    let cellDataIndex = 0;
    for (let i = 0; i < faceVertices.length; i += 3) {
      cellData[cellDataIndex++] = 3; // Triangle
      cellData[cellDataIndex++] = vertexMap.get(faceVertices[i]);
      cellData[cellDataIndex++] = vertexMap.get(faceVertices[i + 1]);
      cellData[cellDataIndex++] = vertexMap.get(faceVertices[i + 2]);
    }

    polys.setData(cellData);
    polyData.setPolys(polys);

    tissuePolyDataMap.set(tissueId, polyData);
  }

  return tissuePolyDataMap;
}

/**
 * Load merged PLY file and create tissue polydata objects
 * @param {string} url - URL to the PLY file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Map>} Map of tissueId to vtkPolyData
 */
export async function loadMergedPLY(url, onProgress) {
  const response = await fetch(url);

  if (!response.ok) {
    console.error('Failed to fetch PLY:', response.status, response.statusText);
    throw new Error(`Failed to load PLY file: ${response.statusText}`);
  }

  // Handle both compressed and uncompressed files
  const isGzipped = url.endsWith('.gz');
  let arrayBuffer;

  try {
    if (isGzipped) {
      // Decompress gzip
      const blob = await response.blob();
      const ds = new DecompressionStream('gzip');
      const decompressedStream = blob.stream().pipeThrough(ds);
      const decompressedBlob = await new Response(decompressedStream).blob();
      arrayBuffer = await decompressedBlob.arrayBuffer();
    } else {
      arrayBuffer = await response.arrayBuffer();
    }
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }

  if (onProgress) {
    onProgress('Parsing merged mesh data...');
  }

  const meshData = parsePLY(arrayBuffer);

  if (onProgress) {
    onProgress('Creating tissue geometry...');
  }

  return createTissuePolyData(meshData);
}