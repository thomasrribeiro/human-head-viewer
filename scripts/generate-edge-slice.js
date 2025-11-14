const vtk = require('@kitware/vtk.js/vtk');
require('@kitware/vtk.js/Rendering/Profiles/Geometry');
const vtkFullScreenRenderWindow = require('@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow');
const vtkImageSlice = require('@kitware/vtk.js/Rendering/Core/ImageSlice');
const vtkImageMapper = require('@kitware/vtk.js/Rendering/Core/ImageMapper');
const vtkColorTransferFunction = require('@kitware/vtk.js/Rendering/Core/ColorTransferFunction');
const vtkPiecewiseFunction = require('@kitware/vtk.js/Common/DataModel/PiecewiseFunction');
const vtkXMLImageDataReader = require('@kitware/vtk.js/IO/XML/XMLImageDataReader');
const vtkImageData = require('@kitware/vtk.js/Common/DataModel/ImageData');
const vtkDataArray = require('@kitware/vtk.js/Common/Core/DataArray');
const fs = require('fs');
const path = require('path');

const DATA_BASE_URL = path.join(__dirname, '../data/MIDA_v1.0/MIDA_v1_voxels/');
const OUTPUT_PATH = path.join(__dirname, '../assets/edge-slice-50.png');

// Approximate bounds from MIDA model
const approximateBounds = [-90, 90, -120, 120, -90, 90];

// Create offscreen renderer
const renderWindow = vtkFullScreenRenderWindow.newInstance({
  background: [0, 0, 0, 0], // Transparent background
  container: null,
});
const renderer = renderWindow.getRenderer();

let voxelData = null;
let edgeImageData = null;
let yOffset = 0;

async function generateEdgeSlice() {
  // Load voxel data
  const voxelReader = vtkXMLImageDataReader.newInstance();
  const vtiPath = path.join(DATA_BASE_URL, 'MIDA_v1.vti');

  const vtiBuffer = fs.readFileSync(vtiPath);
  voxelReader.parseAsArrayBuffer(vtiBuffer.buffer);

  const rawVoxelData = voxelReader.getOutputData();

  if (!rawVoxelData) {
    console.error('Failed to load voxel data');
    return;
  }

  // Flip the voxel data along Z axis
  const dims = rawVoxelData.getDimensions();
  const scalars = rawVoxelData.getPointData().getScalars();
  const scalarData = scalars.getData();
  const flippedData = new scalarData.constructor(scalarData.length);

  for (let y = 0; y < dims[1]; y++) {
    for (let z = 0; z < dims[2]; z++) {
      for (let x = 0; x < dims[0]; x++) {
        const srcIdx = x + y * dims[0] + z * dims[0] * dims[1];
        const flippedZ = dims[2] - 1 - z;
        const dstIdx = x + y * dims[0] + flippedZ * dims[0] * dims[1];
        flippedData[dstIdx] = scalarData[srcIdx];
      }
    }
  }

  voxelData = vtkImageData.newInstance();
  voxelData.setDimensions(dims);
  voxelData.setSpacing(rawVoxelData.getSpacing());
  voxelData.setOrigin(rawVoxelData.getOrigin());
  const flippedScalars = vtkDataArray.newInstance({
    name: 'Scalars',
    values: flippedData
  });
  voxelData.getPointData().setScalars(flippedScalars);

  const voxelBounds = voxelData.getBounds();
  yOffset = approximateBounds[2] - voxelBounds[2];
  const xOffset = approximateBounds[0] - voxelBounds[0];
  const zOffset = approximateBounds[4] - voxelBounds[4];

  const voxelCenterX = (voxelBounds[0] + voxelBounds[1]) / 2;
  const voxelCenterY = (voxelBounds[2] + voxelBounds[3]) / 2;
  const voxelCenterZ = (voxelBounds[4] + voxelBounds[5]) / 2;
  const stlCenterX = (approximateBounds[0] + approximateBounds[1]) / 2;
  const stlCenterY = (approximateBounds[2] + approximateBounds[3]) / 2;
  const stlCenterZ = (approximateBounds[4] + approximateBounds[5]) / 2;

  // Create edge-detected image data
  edgeImageData = vtkImageData.newInstance();
  edgeImageData.setDimensions(dims);
  edgeImageData.setSpacing(voxelData.getSpacing());
  edgeImageData.setOrigin(voxelData.getOrigin());

  const edgeData = new Uint8Array(dims[0] * dims[1] * dims[2]);
  const edgeScalars = vtkDataArray.newInstance({
    name: 'EdgeScalars',
    values: edgeData
  });
  edgeImageData.getPointData().setScalars(edgeScalars);

  // Calculate slice at 50%
  const minY = approximateBounds[2];
  const maxY = approximateBounds[3];
  const yPosition = minY + (50 / 100) * (maxY - minY);

  const spacing = voxelData.getSpacing();
  const origin = voxelData.getOrigin();
  const voxelYPosition = yPosition - yOffset;

  const sliceIndex = Math.round((voxelYPosition - origin[1]) / spacing[1]);
  const clampedIndex = Math.max(0, Math.min(dims[1] - 1, sliceIndex));

  console.log(`Generating edge slice at index ${clampedIndex} (50%)`);

  // Detect edges on the slice
  edgeData.fill(0);
  const voxelScalars = voxelData.getPointData().getScalars().getData();

  for (let z = 1; z < dims[2] - 1; z++) {
    for (let x = 1; x < dims[0] - 1; x++) {
      const idx = x + clampedIndex * dims[0] + z * dims[0] * dims[1];
      const current = voxelScalars[idx];

      const left = voxelScalars[(x - 1) + clampedIndex * dims[0] + z * dims[0] * dims[1]];
      const right = voxelScalars[(x + 1) + clampedIndex * dims[0] + z * dims[0] * dims[1]];
      const top = voxelScalars[x + clampedIndex * dims[0] + (z - 1) * dims[0] * dims[1]];
      const bottom = voxelScalars[x + clampedIndex * dims[0] + (z + 1) * dims[0] * dims[1]];

      if (current !== left || current !== right || current !== top || current !== bottom) {
        edgeData[idx] = 1;
      }
    }
  }

  edgeImageData.modified();

  // Create edge slice actor
  const edgeMapper = vtkImageMapper.newInstance();
  edgeMapper.setInputData(edgeImageData);
  edgeMapper.setSlicingMode(1);
  edgeMapper.setSlice(clampedIndex);

  const edgeSliceActor = vtkImageSlice.newInstance();
  edgeSliceActor.setMapper(edgeMapper);

  const voxelCenterXAfterOffset = voxelCenterX + xOffset;
  const voxelCenterZAfterOffset = voxelCenterZ + zOffset;
  const xAdjust = stlCenterX - voxelCenterXAfterOffset;
  const zAdjust = stlCenterZ - voxelCenterZAfterOffset;

  const xManualOffset = 1;
  const zManualOffset = 2;

  const localOriginX = stlCenterX - xOffset - xAdjust;
  const localOriginY = stlCenterY - yOffset;
  const localOriginZ = stlCenterZ - zOffset - zAdjust;
  edgeSliceActor.setOrigin(localOriginX, localOriginY, localOriginZ);

  edgeSliceActor.rotateY(-90);
  edgeSliceActor.setPosition(xOffset + xAdjust + xManualOffset, yOffset, zOffset + zAdjust + zManualOffset);

  // Transparent background, black edges
  const edgeColorTransferFunction = vtkColorTransferFunction.newInstance();
  edgeColorTransferFunction.addRGBPoint(0, 0, 0, 0); // Transparent
  edgeColorTransferFunction.addRGBPoint(1, 0, 0, 0); // Black edges

  const edgeOpacityFunction = vtkPiecewiseFunction.newInstance();
  edgeOpacityFunction.addPoint(0, 0.0); // Transparent
  edgeOpacityFunction.addPoint(1, 1.0); // Opaque edges

  const edgeProperty = edgeSliceActor.getProperty();
  edgeProperty.setRGBTransferFunction(edgeColorTransferFunction);
  edgeProperty.setPiecewiseFunction(edgeOpacityFunction);
  edgeProperty.setUseLookupTableScalarRange(true);

  renderer.addActor(edgeSliceActor);

  // Set up camera (same as animation viewer)
  renderer.resetCamera();
  const camera = renderer.getActiveCamera();
  camera.azimuth(210);
  camera.elevation(30);
  camera.zoom(1.3);

  const CAMERA_VERTICAL_OFFSET = -20;
  const position = camera.getPosition();
  camera.setPosition(position[0], position[1] + CAMERA_VERTICAL_OFFSET, position[2]);
  const focalPoint = camera.getFocalPoint();
  camera.setFocalPoint(focalPoint[0], focalPoint[1] + CAMERA_VERTICAL_OFFSET, focalPoint[2]);

  // Render and capture
  renderWindow.getRenderWindow().render();

  // Export to PNG
  const canvas = renderWindow.getRenderWindow().captureImages()[0];
  const pngData = canvas.toDataURL('image/png');
  const base64Data = pngData.replace(/^data:image\/png;base64,/, '');

  fs.writeFileSync(OUTPUT_PATH, Buffer.from(base64Data, 'base64'));
  console.log(`Edge slice saved to ${OUTPUT_PATH}`);
}

generateEdgeSlice().catch(console.error);
