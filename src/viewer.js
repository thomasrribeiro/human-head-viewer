import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';

import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkXMLImageDataReader from '@kitware/vtk.js/IO/XML/XMLImageDataReader';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const renderWindow = vtkFullScreenRenderWindow.newInstance({
  background: [1, 1, 1],
});
const renderer = renderWindow.getRenderer();

// ----------------------------------------------------------------------------
// Load tissue color mapping from MIDA data file
// ----------------------------------------------------------------------------

let tissueColorsByID = {};
let tissueColorsByName = {};
let stlFiles = [];

async function loadTissueColors() {
  const response = await fetch('/data/MIDA_v1.0/MIDA_v1_voxels/MIDA_v1.txt');
  const text = await response.text();
  const lines = text.trim().split('\n');

  lines.forEach(line => {
    const parts = line.split('\t');
    const id = parseInt(parts[0]);
    const r = parseFloat(parts[1]);
    const g = parseFloat(parts[2]);
    const b = parseFloat(parts[3]);
    const name = parts.slice(4).join('\t').trim();

    const color = [r, g, b];
    tissueColorsByID[id] = color;
    tissueColorsByName[name] = color;

    // Build STL filename from tissue name
    const stlFilename = name.replace('/', '_') + '.stl';
    stlFiles.push(stlFilename);
  });

  console.log(`Loaded ${Object.keys(tissueColorsByID).length} tissue colors from MIDA_v1.txt`);
  console.log(`Generated ${stlFiles.length} STL filenames`);
}

function getTissueColor(filename) {
  // Strip .stl extension and look up by tissue name
  const tissueName = filename.replace('.stl', '').replace('_', '/');
  return tissueColorsByName[tissueName] || [0.5, 0.5, 0.5];
}

// ----------------------------------------------------------------------------
// Load all STL files and render
// ----------------------------------------------------------------------------
// Note: stlFiles array is dynamically generated from MIDA_v1.txt in loadTissueColors()

const basePath = '/data/MIDA_v1.0/MIDA_v1_surfaces/';
let loadedCount = 0;

// Create clipping plane (transverse/axial - horizontal slices)
const clippingPlane = vtkPlane.newInstance();
clippingPlane.setNormal(0, -1, 0);
clippingPlane.setOrigin(0, 1000, 0);

const mappers = [];

async function loadAllData() {
  // Load tissue colors first
  await loadTissueColors();

  // Then load STL files
  stlFiles.forEach((filename, index) => {
    const reader = vtkSTLReader.newInstance();
    const mapper = vtkMapper.newInstance();
    const actor = vtkActor.newInstance();

    mapper.setInputConnection(reader.getOutputPort());
    actor.setMapper(mapper);

    // Add clipping plane to mapper
    mapper.addClippingPlane(clippingPlane);
    mappers.push(mapper);

    reader.setUrl(basePath + filename).then(() => {
      renderer.addActor(actor);

      // Assign anatomically correct color based on tissue type
      const rgb = getTissueColor(filename);

      const property = actor.getProperty();
      property.setColor(rgb[0], rgb[1], rgb[2]);
      property.setAmbient(0.5);
      property.setDiffuse(0.8);
      property.setSpecular(0.1);
      property.setSpecularPower(10);
      property.setOpacity(0.3); // More transparent to see the slice

      // Force color mode
      mapper.setScalarVisibility(false);

      loadedCount++;

      // After all STL files are loaded, load the voxel slice
      if (loadedCount === stlFiles.length) {
        // Get bounds of STL data to align with voxel data
        const stlBounds = renderer.computeVisiblePropBounds();
        console.log('STL bounds:', stlBounds);
        loadVoxelSlice(stlBounds);
      }
    });
  });
}

// Start loading
loadAllData();

// ----------------------------------------------------------------------------
// Load voxelized data for the slice
// ----------------------------------------------------------------------------

let imageSliceActor = null;
let voxelData = null;
let stlBounds = null;

function loadVoxelSlice(bounds) {
  stlBounds = bounds;

  const voxelReader = vtkXMLImageDataReader.newInstance();

  voxelReader.setUrl('/data/MIDA_v1.0/MIDA_v1_voxels/MIDA_v1.vti').then(() => {
    const rawVoxelData = voxelReader.getOutputData();

    // Flip the voxel data along Z axis to correct orientation
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

    const dataRange = voxelData.getPointData().getScalars().getRange();

    // The VTI file should already have correct spacing (0.0005m = 0.5mm per voxel)
    // Verify and log the spacing
    const voxelBounds = voxelData.getBounds();
    console.log('STL bounds:', stlBounds);
    console.log('Voxel data spacing:', voxelData.getSpacing());
    console.log('Voxel data origin:', voxelData.getOrigin());
    console.log('Voxel data bounds:', voxelBounds);

    // Calculate offset to align voxel coordinate system with STL coordinate system
    yOffset = stlBounds[2] - voxelBounds[2]; // Align min Y values
    const xOffset = stlBounds[0] - voxelBounds[0]; // Align min X values
    const zOffset = stlBounds[4] - voxelBounds[4]; // Align min Z values
    console.log('Offsets to align coordinate systems - X:', xOffset, 'Y:', yOffset, 'Z:', zOffset);

    // Calculate centers for rotation
    const voxelCenterX = (voxelBounds[0] + voxelBounds[1]) / 2;
    const voxelCenterY = (voxelBounds[2] + voxelBounds[3]) / 2;
    const voxelCenterZ = (voxelBounds[4] + voxelBounds[5]) / 2;
    const stlCenterX = (stlBounds[0] + stlBounds[1]) / 2;
    const stlCenterY = (stlBounds[2] + stlBounds[3]) / 2;
    const stlCenterZ = (stlBounds[4] + stlBounds[5]) / 2;
    console.log('Voxel center:', voxelCenterX, voxelCenterY, voxelCenterZ);
    console.log('STL center:', stlCenterX, stlCenterY, stlCenterZ);

    // Create color transfer function for voxel data
    const ctfun = vtkColorTransferFunction.newInstance();
    for (let i = 0; i <= 116; i++) {
      const rgb = tissueColorsByID[i] || [0.5, 0.5, 0.5];
      ctfun.addRGBPoint(i, rgb[0], rgb[1], rgb[2]);
    }

    // Create opacity transfer function - make background (ID 0) transparent
    const ofun = vtkPiecewiseFunction.newInstance();
    ofun.addPoint(0, 0.0); // Background fully transparent
    for (let i = 1; i <= 116; i++) {
      ofun.addPoint(i, 1.0); // All tissues fully opaque
    }

    // Create image slice actor
    const imageMapper = vtkImageMapper.newInstance();
    imageMapper.setInputData(voxelData);
    imageMapper.setSlicingMode(1); // YZ plane (along Y axis)

    imageSliceActor = vtkImageSlice.newInstance();
    imageSliceActor.setMapper(imageMapper);

    // Rotate around STL center
    // Calculate adjustments to center voxel data with STL data
    const voxelCenterXAfterOffset = voxelCenterX + xOffset;
    const voxelCenterZAfterOffset = voxelCenterZ + zOffset;
    const xAdjust = stlCenterX - voxelCenterXAfterOffset;
    const zAdjust = stlCenterZ - voxelCenterZAfterOffset;

    // Manual fine-tuning for X and Z offsets
    const xManualOffset = 1; // Adjust this value to fine-tune X alignment
    const zManualOffset = 2; // Adjust this value to fine-tune Z alignment

    console.log('Auto-calculated adjustments - xAdjust:', xAdjust, 'zAdjust:', zAdjust);
    console.log('Manual offsets - xManualOffset:', xManualOffset, 'zManualOffset:', zManualOffset);

    // Set the origin to STL center in local coordinates (relative to voxel data)
    // STL center in world space - voxel offset = STL center in voxel local space
    const localOriginX = stlCenterX - xOffset - xAdjust;
    const localOriginY = stlCenterY - yOffset;
    const localOriginZ = stlCenterZ - zOffset - zAdjust;
    imageSliceActor.setOrigin(localOriginX, localOriginY, localOriginZ);

    // Apply Y rotation around STL center
    const rotationY = -90; // Adjust this value for alignment
    imageSliceActor.rotateY(rotationY);

    // No additional rotation needed - the voxel data is already flipped

    // Apply translation after rotation
    imageSliceActor.setPosition(xOffset + xAdjust + xManualOffset, yOffset, zOffset + zAdjust + zManualOffset);

    // Set the lookup table and opacity on the property
    const sliceProperty = imageSliceActor.getProperty();
    sliceProperty.setRGBTransferFunction(ctfun);
    sliceProperty.setPiecewiseFunction(ofun);
    sliceProperty.setUseLookupTableScalarRange(true);

    renderer.addActor(imageSliceActor);
    renderer.resetCamera();

    const camera = renderer.getActiveCamera();
    camera.azimuth(210);
    camera.elevation(30);

    updateSlicePosition(66.67); // Start at 1/3 down from top

    renderWindow.getRenderWindow().render();

    // Set up slider control
    const slider = document.getElementById('depth-slider');
    slider.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      updateSlicePosition(value);
    });
  });
}

let yOffset = 0; // Store the offset globally

function updateSlicePosition(sliderValue) {
  if (!voxelData || !imageSliceActor || !stlBounds) return;

  // Use STL bounds for slider range
  const minY = stlBounds[2];
  const maxY = stlBounds[3];

  // Calculate Y position in STL coordinate space
  const yPosition = minY + (sliderValue / 100) * (maxY - minY);

  // Update clipping plane for STL surfaces
  clippingPlane.setOrigin(0, yPosition, 0);

  // Update slice position for voxel data
  const spacing = voxelData.getSpacing();
  const origin = voxelData.getOrigin();
  const voxelBounds = voxelData.getBounds();

  // Map STL Y position to voxel Y position (accounting for coordinate offset)
  const voxelYPosition = yPosition - yOffset;

  // Convert to slice index in voxel space
  const sliceIndex = Math.round((voxelYPosition - origin[1]) / spacing[1]);
  const dims = voxelData.getDimensions();
  const clampedIndex = Math.max(0, Math.min(dims[1] - 1, sliceIndex));

  imageSliceActor.getMapper().setSlice(clampedIndex);

  renderWindow.getRenderWindow().render();
}
