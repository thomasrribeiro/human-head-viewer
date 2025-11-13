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
import vtkCoordinate from '@kitware/vtk.js/Rendering/Core/Coordinate';

// ----------------------------------------------------------------------------
// Data source configuration
// ----------------------------------------------------------------------------

// Get data base URL - uses env variable or falls back to BASE_URL for backwards compatibility
const DATA_BASE_URL = import.meta.env.VITE_DATA_BASE_URL || `${import.meta.env.BASE_URL}data/`;

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
let tissueNamesByID = {};
let stlFiles = [];

async function loadTissueColors() {
  const response = await fetch(`${DATA_BASE_URL}MIDA_v1_voxels/MIDA_v1.txt`);
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
    tissueNamesByID[id] = name;

    const stlFilename = name.replace('/', '_') + '.stl';
    stlFiles.push(stlFilename);
  });

}

function getTissueColor(filename) {
  const tissueName = filename.replace('.stl', '').replace('_', '/');
  return tissueColorsByName[tissueName] || [0.5, 0.5, 0.5];
}

// ----------------------------------------------------------------------------
// Load all STL files and render
// ----------------------------------------------------------------------------

const basePath = `${DATA_BASE_URL}MIDA_v1_surfaces/`;
let loadedCount = 0;

// Create clipping plane (transverse/axial - horizontal slices)
const clippingPlane = vtkPlane.newInstance();
clippingPlane.setNormal(0, -1, 0);
clippingPlane.setOrigin(0, 1000, 0);

const mappers = [];
const actors = {};

async function loadAllData() {
  await loadTissueColors();

  stlFiles.forEach((filename) => {
    const reader = vtkSTLReader.newInstance();
    const mapper = vtkMapper.newInstance();
    const actor = vtkActor.newInstance();

    mapper.setInputConnection(reader.getOutputPort());
    actor.setMapper(mapper);

    mapper.addClippingPlane(clippingPlane);
    mappers.push(mapper);

    reader.setUrl(basePath + filename).then(() => {
      renderer.addActor(actor);
      actors[filename] = actor;

      const rgb = getTissueColor(filename);
      const property = actor.getProperty();

      property.setColor(rgb[0], rgb[1], rgb[2]);
      property.setAmbient(0.5);
      property.setDiffuse(0.8);
      property.setSpecular(0.1);
      property.setSpecularPower(10);
      property.setOpacity(0.2);

      mapper.setScalarVisibility(false);

      loadedCount++;

      if (loadedCount === stlFiles.length) {
        const stlBounds = renderer.computeVisiblePropBounds();
        loadVoxelSlice(stlBounds);
      }
    }).catch((error) => {
      console.error(`Failed to load ${filename}:`, error);
    });
  });
}

loadAllData();

// ----------------------------------------------------------------------------
// Load voxelized data for the slice
// ----------------------------------------------------------------------------

let imageSliceActor = null;
let voxelData = null;
let stlBounds = null;
let voxelColorTransferFunction = null;
let voxelOpacityFunction = null;
let yOffset = 0;

const CAMERA_VERTICAL_OFFSET = -20;

function loadVoxelSlice(bounds) {
  stlBounds = bounds;

  const voxelReader = vtkXMLImageDataReader.newInstance();

  voxelReader.setUrl(`${DATA_BASE_URL}MIDA_v1_voxels/MIDA_v1.vti`).then(() => {
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

    yOffset = stlBounds[2] - voxelBounds[2];
    const xOffset = stlBounds[0] - voxelBounds[0];
    const zOffset = stlBounds[4] - voxelBounds[4];

    const voxelCenterX = (voxelBounds[0] + voxelBounds[1]) / 2;
    const voxelCenterY = (voxelBounds[2] + voxelBounds[3]) / 2;
    const voxelCenterZ = (voxelBounds[4] + voxelBounds[5]) / 2;
    const stlCenterX = (stlBounds[0] + stlBounds[1]) / 2;
    const stlCenterY = (stlBounds[2] + stlBounds[3]) / 2;
    const stlCenterZ = (stlBounds[4] + stlBounds[5]) / 2;

    // Create color transfer function with anatomical colors
    voxelColorTransferFunction = vtkColorTransferFunction.newInstance();
    for (let i = 0; i <= 116; i++) {
      const rgb = tissueColorsByID[i] || [0.5, 0.5, 0.5];
      voxelColorTransferFunction.addRGBPoint(i, rgb[0], rgb[1], rgb[2]);
    }

    // Create opacity transfer function
    const ofun = vtkPiecewiseFunction.newInstance();
    voxelOpacityFunction = ofun;
    ofun.addPoint(0, 0.0);
    for (let i = 1; i <= 116; i++) {
      ofun.addPoint(i, 1.0);
    }

    // Create image slice actor
    const imageMapper = vtkImageMapper.newInstance();
    imageMapper.setInputData(voxelData);
    imageMapper.setSlicingMode(1);

    imageSliceActor = vtkImageSlice.newInstance();
    imageSliceActor.setMapper(imageMapper);

    const voxelCenterXAfterOffset = voxelCenterX + xOffset;
    const voxelCenterZAfterOffset = voxelCenterZ + zOffset;
    const xAdjust = stlCenterX - voxelCenterXAfterOffset;
    const zAdjust = stlCenterZ - voxelCenterZAfterOffset;

    const xManualOffset = 1;
    const zManualOffset = 2;

    const localOriginX = stlCenterX - xOffset - xAdjust;
    const localOriginY = stlCenterY - yOffset;
    const localOriginZ = stlCenterZ - zOffset - zAdjust;
    imageSliceActor.setOrigin(localOriginX, localOriginY, localOriginZ);

    const rotationY = -90;
    imageSliceActor.rotateY(rotationY);

    imageSliceActor.setPosition(xOffset + xAdjust + xManualOffset, yOffset, zOffset + zAdjust + zManualOffset);

    const sliceProperty = imageSliceActor.getProperty();
    sliceProperty.setRGBTransferFunction(voxelColorTransferFunction);
    sliceProperty.setPiecewiseFunction(ofun);
    sliceProperty.setUseLookupTableScalarRange(true);

    renderer.addActor(imageSliceActor);

    // Set up camera
    renderer.resetCamera();
    const camera = renderer.getActiveCamera();
    camera.azimuth(210);
    camera.elevation(30);
    camera.zoom(1.3);

    const position = camera.getPosition();
    camera.setPosition(position[0], position[1] + CAMERA_VERTICAL_OFFSET, position[2]);
    const focalPoint = camera.getFocalPoint();
    camera.setFocalPoint(focalPoint[0], focalPoint[1] + CAMERA_VERTICAL_OFFSET, focalPoint[2]);

    updateSlicePosition(66.67);

    renderWindow.getRenderWindow().render();

    // Set up slider
    const slider = document.getElementById('depth-slider');
    if (slider) {
      slider.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        updateSlicePosition(value);
      });
    }

    // Start animation after model is loaded
    startAnimation();
  });
}

// Animation control
let animationObject = { value: 0 };

function startAnimation() {
  anime({
    targets: animationObject,
    value: [100, 0],
    duration: 6000,
    easing: 'easeInOutSine',
    loop: true,
    direction: 'alternate',
    update: function() {
      const slider = document.getElementById('depth-slider');
      if (slider) {
        slider.value = animationObject.value;
      }
      updateSlicePosition(animationObject.value);
    }
  });
}

function updateSlicePosition(sliderValue) {
  if (!voxelData || !imageSliceActor || !stlBounds) return;

  const minY = stlBounds[2];
  const maxY = stlBounds[3];
  const yPosition = minY + (sliderValue / 100) * (maxY - minY);

  clippingPlane.setOrigin(0, yPosition, 0);

  const spacing = voxelData.getSpacing();
  const origin = voxelData.getOrigin();
  const voxelYPosition = yPosition - yOffset;

  const sliceIndex = Math.round((voxelYPosition - origin[1]) / spacing[1]);
  const dims = voxelData.getDimensions();
  const clampedIndex = Math.max(0, Math.min(dims[1] - 1, sliceIndex));

  imageSliceActor.getMapper().setSlice(clampedIndex);

  renderWindow.getRenderWindow().render();
}
