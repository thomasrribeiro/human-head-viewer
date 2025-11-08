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
  container: document.getElementById('render-wrapper'),
});
const renderer = renderWindow.getRenderer();

// ----------------------------------------------------------------------------
// Load tissue color mapping from MIDA data file
// ----------------------------------------------------------------------------

let tissueColorsByID = {};
let tissueColorsByName = {};
let tissueNamesByID = {}; // Map tissue ID to name
let stlFiles = [];
let densityByTissueName = {};
let densityByTissueID = {};
let visualizationMode = 'default'; // 'default' or 'density'
let minDensity = Infinity;
let maxDensity = -Infinity;

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
    tissueNamesByID[id] = name; // Store ID to name mapping

    // Build STL filename from tissue name
    const stlFilename = name.replace('/', '_') + '.stl';
    stlFiles.push(stlFilename);
  });

  console.log(`Loaded ${Object.keys(tissueColorsByID).length} tissue colors from MIDA_v1.txt`);
  console.log(`Generated ${stlFiles.length} STL filenames`);
}

async function loadDensityData() {
  const response = await fetch('/data/Database-V5-0/Thermal_dielectric_acoustic_MR properties_database_V5.0(ASCII).txt');
  const text = await response.text();
  const lines = text.trim().split('\n');

  // Find the column index for "Alternative Names"
  const headerLine = lines[1];
  const headers = headerLine.split('\t');
  const altNamesIndex = headers.indexOf('Alternative Names');

  console.log(`Alternative Names column index: ${altNamesIndex}`);
  console.log(`Number of columns in header: ${headers.length}`);

  // Skip header lines (first 3 lines: blank, main headers, sub-headers)
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // Skip empty lines

    const parts = line.split('\t');

    // First column is empty, actual data starts at index 1
    const tissueName = parts[1];
    const densityAvg = parseFloat(parts[2]);
    const semcadNames = altNamesIndex >= 0 ? parts[altNamesIndex] : null;

    // Debug first few rows
    if (i < 6) {
      console.log(`Row ${i}: tissue="${tissueName}", density=${densityAvg}, numCols=${parts.length}, altNames="${semcadNames}"`);
    }

    if (!isNaN(densityAvg) && densityAvg > 0) {
      // Update min/max for normalization
      minDensity = Math.min(minDensity, densityAvg);
      maxDensity = Math.max(maxDensity, densityAvg);

      // Parse alternative names separated by @
      if (semcadNames && semcadNames !== 'None' && semcadNames.length > 0) {
        const altNames = semcadNames.replace(/"/g, '').split('@');
        altNames.forEach(altName => {
          const cleanName = altName.trim();
          if (cleanName && cleanName !== 'None') {
            densityByTissueName[cleanName] = densityAvg;
          }
        });
      }

      // Also store by primary tissue name
      densityByTissueName[tissueName] = densityAvg;
    }
  }

  console.log(`Loaded density data for ${Object.keys(densityByTissueName).length} tissues`);
  console.log(`Density range: ${minDensity} - ${maxDensity} kg/m³`);
  console.log(`Sample densities: Dura=${densityByTissueName['Dura']}, Adrenal Gland=${densityByTissueName['Adrenal Gland']}`);
}

// Bone colormap: maps normalized value (0-1) to grayscale bone color
function boneColormap(value) {
  // Bone colormap: black to white through gray/brown tones
  // Similar to MATLAB's bone colormap
  const t = Math.max(0, Math.min(1, value)); // Clamp to [0, 1]

  let r, g, b;
  if (t < 0.375) {
    // Dark blue-gray to gray
    const s = t / 0.375;
    r = 0.32 * s;
    g = 0.32 * s;
    b = 0.45 + 0.22 * s;
  } else if (t < 0.75) {
    // Gray to light bone color
    const s = (t - 0.375) / 0.375;
    r = 0.32 + 0.47 * s;
    g = 0.32 + 0.47 * s;
    b = 0.67 + 0.22 * s;
  } else {
    // Light bone to white
    const s = (t - 0.75) / 0.25;
    r = 0.79 + 0.21 * s;
    g = 0.79 + 0.21 * s;
    b = 0.89 + 0.11 * s;
  }

  return [r, g, b];
}

function getDensityColor(tissueName) {
  const density = densityByTissueName[tissueName];
  if (!density) {
    return [0.5, 0.5, 0.5]; // Gray for unknown
  }

  // Normalize density to [0, 1] and use grayscale
  const normalized = (density - minDensity) / (maxDensity - minDensity);
  return [normalized, normalized, normalized];
}

function getTissueColor(filename) {
  // Strip .stl extension and look up by tissue name
  const tissueName = filename.replace('.stl', '').replace('_', '/');

  if (visualizationMode === 'density') {
    return getDensityColor(tissueName);
  }

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
const actors = {}; // Store actors by filename for updates

async function loadAllData() {
  // Load tissue colors and density data
  await loadTissueColors();
  await loadDensityData();

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

      // Store actor for later updates
      actors[filename] = actor;

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
    }).catch((error) => {
      console.error(`Failed to load ${filename}:`, error);
      // Update status to error
      const statusIndicator = document.getElementById('status-indicator');
      const statusText = document.getElementById('status-text');
      if (statusIndicator && statusText) {
        statusIndicator.className = 'error';
        statusText.textContent = 'Failed to load';
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
let voxelColorTransferFunction = null;

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
    voxelColorTransferFunction = vtkColorTransferFunction.newInstance();
    for (let i = 0; i <= 116; i++) {
      const rgb = tissueColorsByID[i] || [0.5, 0.5, 0.5];
      voxelColorTransferFunction.addRGBPoint(i, rgb[0], rgb[1], rgb[2]);
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
    sliceProperty.setRGBTransferFunction(voxelColorTransferFunction);
    sliceProperty.setPiecewiseFunction(ofun);
    sliceProperty.setUseLookupTableScalarRange(true);

    renderer.addActor(imageSliceActor);
    renderer.resetCamera();

    const camera = renderer.getActiveCamera();
    camera.azimuth(210);
    camera.elevation(30);
    camera.zoom(1.5);

    // Move camera position up to shift view up
    const position = camera.getPosition();
    camera.setPosition(position[0], position[1] - 30, position[2]);
    const focalPoint = camera.getFocalPoint();
    camera.setFocalPoint(focalPoint[0], focalPoint[1] - 30, focalPoint[2]);

    updateSlicePosition(66.67); // Start at 1/3 down from top

    renderWindow.getRenderWindow().render();

    // Update loading status to success
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    if (statusIndicator && statusText) {
      statusIndicator.className = 'loaded';
      statusText.textContent = 'Model loaded!';
    }

    // Set up slider control
    const slider = document.getElementById('depth-slider');
    slider.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      updateSlicePosition(value);
    });

    // Set up visualization mode dropdown
    const modeSelector = document.getElementById('viz-mode-selector');
    modeSelector.addEventListener('change', (event) => {
      setVisualizationMode(event.target.value);
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

// Draw colorbar on canvas
function drawColorbar() {
  const canvas = document.getElementById('colorbar');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  // Draw gradient from top (high density) to bottom (low density)
  for (let y = 0; y < height; y++) {
    const value = y / height; // top = 0 (high), bottom = 1 (low)
    const gray = Math.floor((1 - value) * 255); // Invert for grayscale

    ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
    ctx.fillRect(0, y, width, 1);
  }

  // Update labels and tick marks - 7 ticks total
  const tickContainer = document.getElementById('colorbar-tick-marks');
  const ticksContainer = document.getElementById('colorbar-ticks');
  tickContainer.innerHTML = '';
  ticksContainer.innerHTML = '';

  const numTicks = 7;
  for (let i = 0; i < numTicks; i++) {
    const pos = i / (numTicks - 1); // 0 to 1

    // Draw tick mark
    const tick = document.createElement('div');
    tick.className = 'tick-mark';
    tick.style.top = `${pos * height}px`;
    tickContainer.appendChild(tick);

    // Add label
    const label = document.createElement('div');
    label.className = 'colorbar-tick';
    const value = maxDensity - (pos * (maxDensity - minDensity));
    label.textContent = Math.round(value);
    ticksContainer.appendChild(label);
  }
}

// Function to switch visualization modes
function setVisualizationMode(mode) {
  visualizationMode = mode;

  // Show/hide colorbar
  const colorbarContainer = document.getElementById('colorbar-container');
  if (mode === 'density') {
    colorbarContainer.classList.add('visible');
    drawColorbar();
  } else {
    colorbarContainer.classList.remove('visible');
  }

  // Update STL surface colors
  Object.keys(actors).forEach(filename => {
    const actor = actors[filename];
    const rgb = getTissueColor(filename);
    actor.getProperty().setColor(rgb[0], rgb[1], rgb[2]);
  });

  // Update voxel slice colors
  if (voxelColorTransferFunction) {
    voxelColorTransferFunction.removeAllPoints();

    if (mode === 'density') {
      // Build density-based color mapping for each tissue ID
      for (let i = 0; i <= 116; i++) {
        const tissueName = tissueNamesByID[i];
        let rgb;

        if (tissueName) {
          rgb = getDensityColor(tissueName);
        } else {
          rgb = [0.5, 0.5, 0.5]; // Default gray for unknown tissues
        }

        voxelColorTransferFunction.addRGBPoint(i, rgb[0], rgb[1], rgb[2]);
      }
    } else {
      // Restore default anatomical colors
      for (let i = 0; i <= 116; i++) {
        const rgb = tissueColorsByID[i] || [0.5, 0.5, 0.5];
        voxelColorTransferFunction.addRGBPoint(i, rgb[0], rgb[1], rgb[2]);
      }
    }
  }

  // Re-render the scene
  renderWindow.getRenderWindow().render();

  console.log(`Visualization mode set to: ${mode}`);
}
