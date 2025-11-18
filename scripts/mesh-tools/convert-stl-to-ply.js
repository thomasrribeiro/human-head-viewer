#!/usr/bin/env node

/**
 * Optimized STL merger that creates a compact PLY file with tissue IDs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const STL_DIR = path.join(__dirname, '../../data/MIDA_v1_surfaces');
const OUTPUT_DIR = path.join(__dirname, '../../data');
const MIDA_FILE = path.join(__dirname, '../../data/MIDA_v1_voxels/MIDA_v1.txt');

// Load tissue mapping
function loadTissueMapping() {
  const tissueMap = {};
  const content = fs.readFileSync(MIDA_FILE, 'utf-8');
  const lines = content.split('\n');

  lines.forEach(line => {
    const parts = line.split('\t');
    if (parts.length >= 5) {
      const id = parseInt(parts[0]);
      if (!isNaN(id)) {
        const name = parts.slice(4).join('\t').trim();
        if (name && name !== 'Background') {
          tissueMap[name] = id;
        }
      }
    }
  });

  return tissueMap;
}

// Parse STL and extract unique vertices
function parseSTLOptimized(buffer, tissueId) {
  const dataView = new DataView(buffer.buffer);
  const triangleCount = dataView.getUint32(80, true);

  const vertices = [];
  const faces = [];
  const vertexMap = new Map(); // For deduplication
  let vertexIndex = 0;

  let offset = 84;

  for (let i = 0; i < triangleCount; i++) {
    // Skip normal (12 bytes)
    offset += 12;

    const faceIndices = [];

    // Read 3 vertices
    for (let j = 0; j < 3; j++) {
      const x = dataView.getFloat32(offset, true);
      const y = dataView.getFloat32(offset + 4, true);
      const z = dataView.getFloat32(offset + 8, true);
      offset += 12;

      // Create vertex key for deduplication
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

      let index;
      if (vertexMap.has(key)) {
        index = vertexMap.get(key);
      } else {
        index = vertexIndex++;
        vertexMap.set(key, index);
        vertices.push({ x, y, z, tissueId });
      }

      faceIndices.push(index);
    }

    faces.push(faceIndices);

    // Skip attribute byte count (2 bytes)
    offset += 2;
  }

  return { vertices: Array.from(vertexMap, ([_, v]) => vertices[v]), faces };
}

// Create PLY format
function createPLYFormat(allVertices, allFaces) {
  // Create PLY header
  let header = 'ply\n';
  header += 'format binary_little_endian 1.0\n';
  header += 'comment Human Head Model - Merged Tissues\n';
  header += `element vertex ${allVertices.length}\n`;
  header += 'property float x\n';
  header += 'property float y\n';
  header += 'property float z\n';
  header += 'property uchar tissue_id\n';
  header += `element face ${allFaces.length}\n`;
  header += 'property list uchar int vertex_indices\n';
  header += 'end_header\n';

  // Create binary data
  const vertexSize = 4 * 3 + 1; // 3 floats + 1 byte
  const vertexBuffer = Buffer.alloc(allVertices.length * vertexSize);

  let offset = 0;
  allVertices.forEach(v => {
    vertexBuffer.writeFloatLE(v.x, offset); offset += 4;
    vertexBuffer.writeFloatLE(v.y, offset); offset += 4;
    vertexBuffer.writeFloatLE(v.z, offset); offset += 4;
    vertexBuffer.writeUInt8(v.tissueId, offset); offset += 1;
  });

  // Calculate face buffer size
  let faceBufferSize = 0;
  allFaces.forEach(face => {
    faceBufferSize += 1 + face.length * 4; // 1 byte count + indices
  });

  const faceBuffer = Buffer.alloc(faceBufferSize);
  offset = 0;

  allFaces.forEach(face => {
    faceBuffer.writeUInt8(face.length, offset); offset += 1;
    face.forEach(index => {
      faceBuffer.writeInt32LE(index, offset); offset += 4;
    });
  });

  // Combine header and binary data
  const headerBuffer = Buffer.from(header, 'ascii');
  return Buffer.concat([headerBuffer, vertexBuffer, faceBuffer]);
}

// Main function
async function mergeSTLFilesOptimized() {
  console.log('Loading tissue mapping...');
  const tissueMap = loadTissueMapping();

  console.log('Reading and optimizing STL files...');
  const stlFiles = fs.readdirSync(STL_DIR).filter(f => f.endsWith('.stl'));

  let allVertices = [];
  let allFaces = [];
  let totalOriginalSize = 0;
  let processedCount = 0;

  for (const file of stlFiles) {
    const filePath = path.join(STL_DIR, file);
    const fileStats = fs.statSync(filePath);
    totalOriginalSize += fileStats.size;

    // Extract tissue name from filename
    const tissueName = file.replace(/ ?\.stl$/, '').replace(/_/g, '/');
    const tissueId = tissueMap[tissueName];

    if (!tissueId) {
      console.log(`Warning: No tissue ID found for ${tissueName}`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const { vertices, faces } = parseSTLOptimized(buffer, tissueId);

    // Adjust face indices to account for offset
    const vertexOffset = allVertices.length;
    const adjustedFaces = faces.map(face =>
      face.map(idx => idx + vertexOffset)
    );

    // Use concat instead of spread to avoid stack overflow
    allVertices = allVertices.concat(vertices);
    allFaces = allFaces.concat(adjustedFaces);

    processedCount++;
    console.log(`Processed ${tissueName}: ${vertices.length} unique vertices, ${faces.length} triangles`);
  }

  console.log('\n=== Optimization Statistics ===');
  console.log(`Total STL files: ${stlFiles.length}`);
  console.log(`Successfully processed: ${processedCount}`);
  console.log(`Total unique vertices: ${allVertices.length.toLocaleString()}`);
  console.log(`Total triangles: ${allFaces.length.toLocaleString()}`);
  console.log(`Original size (all STLs): ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);

  // Create and save PLY file
  console.log('\nCreating optimized PLY file...');
  const plyBuffer = createPLYFormat(allVertices, allFaces);
  const plyPath = path.join(OUTPUT_DIR, 'merged_tissues.ply');
  fs.writeFileSync(plyPath, plyBuffer);

  console.log(`PLY file size: ${(plyBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Calculate savings
  const reduction = ((totalOriginalSize - plyBuffer.length) / totalOriginalSize * 100).toFixed(1);

  console.log('\n=== File Size Comparison ===');
  console.log(`Individual STL files: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Merged PLY file: ${(plyBuffer.length / 1024 / 1024).toFixed(2)} MB (${reduction}% reduction)`);

  // Save metadata
  const metadata = {
    format: 'PLY',
    compressed: true,
    vertexCount: allVertices.length,
    faceCount: allFaces.length,
    tissues: Object.keys(tissueMap).map(name => ({
      id: tissueMap[name],
      name
    }))
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'merged_tissues.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log('\nFiles created:');
  console.log(`  - ${plyPath}`);
  console.log(`  - ${path.join(OUTPUT_DIR, 'merged_tissues.json')}`);
}

// Run the optimized merger
mergeSTLFilesOptimized().catch(console.error);