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
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
import { calculateElectromagneticProperties, parseFrequencyInput, formatFrequency } from './cole-cole.js';
import { calculateAttenuationConstant } from './acoustic.js';

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const renderWindow = vtkFullScreenRenderWindow.newInstance({
  background: [1, 1, 1],
  container: document.getElementById('render-wrapper'),
});
const renderer = renderWindow.getRenderer();

// Add orientation axes widget
const axes = vtkAxesActor.newInstance();
const orientationWidget = vtkOrientationMarkerWidget.newInstance({
  actor: axes,
  interactor: renderWindow.getInteractor(),
});
orientationWidget.setEnabled(true);
orientationWidget.setViewportCorner(
  vtkOrientationMarkerWidget.Corners.TOP_RIGHT
);
orientationWidget.setViewportSize(0.15);
orientationWidget.setMinPixelSize(100);
orientationWidget.setMaxPixelSize(300);

// ----------------------------------------------------------------------------
// Load tissue color mapping from MIDA data file
// ----------------------------------------------------------------------------

let tissueColorsByID = {};
let tissueColorsByName = {};
let tissueNamesByID = {}; // Map tissue ID to name
let stlFiles = [];
let densityByTissueName = {};
let heatCapacityByTissueName = {};
let thermalConductivityByTissueName = {};
let heatTransferRateByTissueName = {};
let heatGenerationRateByTissueName = {};
let speedOfSoundByTissueName = {};
let lfConductivityByTissueName = {};
let dielectricPropertiesData = {}; // Cole-Cole parameters for each tissue
let conductivityByTissueName = {};
let permittivityByTissueName = {};
let acousticAttenuationData = {}; // Attenuation parameters {alpha0, b} for each tissue
let attenuationConstantByTissueName = {};
let nonlinearityParameterData = {}; // B/A parameter for each tissue
let nonlinearityParameterByTissueName = {};
let relaxationTimeData = {}; // T1/T2 relaxation times for each tissue at different field strengths
let relaxationTimeByTissueName = {};
let currentFieldStrength = '1.5T'; // Default: 1.5T
let currentRelaxationParameter = 'T1'; // Default: T1
let currentFrequency = 100e6; // Default: 100 MHz (for electromagnetic and acoustic)
let visualizationMode = 'default';
let minDensity = Infinity;
let maxDensity = -Infinity;
let minHeatCapacity = Infinity;
let maxHeatCapacity = -Infinity;
let minThermalConductivity = Infinity;
let maxThermalConductivity = -Infinity;
let minHeatTransferRate = Infinity;
let maxHeatTransferRate = -Infinity;
let minHeatGenerationRate = Infinity;
let maxHeatGenerationRate = -Infinity;
let minSpeedOfSound = Infinity;
let maxSpeedOfSound = -Infinity;
let minLFConductivity = Infinity;
let maxLFConductivity = -Infinity;
let minConductivity = Infinity;
let maxConductivity = -Infinity;
let minPermittivity = Infinity;
let maxPermittivity = -Infinity;
let minAttenuationConstant = Infinity;
let maxAttenuationConstant = -Infinity;
let minNonlinearityParameter = Infinity;
let maxNonlinearityParameter = -Infinity;
let minRelaxationTime = Infinity;
let maxRelaxationTime = -Infinity;
let waterContentData = {}; // Water content for each tissue
let waterContentByTissueName = {};
let minWaterContent = Infinity;
let maxWaterContent = -Infinity;
let elementalCompositionData = {}; // Elemental composition for each tissue
let elementalCompositionByTissueName = {};
let currentElement = 'hydrogen'; // Default element
let minElementalComposition = Infinity;
let maxElementalComposition = -Infinity;

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

  // console.log(`Loaded ${Object.keys(tissueColorsByID).length} tissue colors from MIDA_v1.txt`);
  // console.log(`Generated ${stlFiles.length} STL filenames`);
}

// Helper function to calculate percentile
function calculatePercentile(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

async function loadDensityData() {
  const response = await fetch('/data/Database-V5-0/Thermal_dielectric_acoustic_MR properties_database_V5.0(ASCII).txt');
  const text = await response.text();
  const lines = text.trim().split('\n');

  // Find the column index for "Alternative Names"
  const headerLine = lines[1];
  const headers = headerLine.split('\t');
  const altNamesIndex = headers.indexOf('Alternative Names');

  // Arrays to collect all values for percentile calculation
  const densityValues = [];
  const heatCapacityValues = [];
  const thermalConductivityValues = [];
  const heatTransferRateValues = [];
  const heatGenerationRateValues = [];
  const speedOfSoundValues = [];
  const lfConductivityValues = [];

  // Skip header lines (first 3 lines: blank, main headers, sub-headers)
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const parts = line.split('\t');

    // First column is empty, actual data starts at index 1
    const tissueName = parts[1];
    const densityAvg = parseFloat(parts[2]);
    const heatCapacityAvg = parseFloat(parts[6]);
    const thermalConductivityAvg = parseFloat(parts[10]);
    const heatTransferRateAvg = parseFloat(parts[14]);
    const heatGenerationRateAvg = parseFloat(parts[18]);
    const speedOfSoundAvg = parseFloat(parts[65]);
    const lfConductivityAvg = parseFloat(parts[22]); // LF Conductivity column
    const semcadNames = altNamesIndex >= 0 ? parts[altNamesIndex] : null;

    // Helper function to store value by tissue name and alternative names
    const storeValue = (valueMap, valuesArray, value) => {
      if (isNaN(value) || value <= 0) return;

      // Collect value for percentile calculation
      valuesArray.push(value);

      if (semcadNames && semcadNames !== 'None' && semcadNames.length > 0) {
        const altNames = semcadNames.replace(/"/g, '').split('@');
        altNames.forEach(altName => {
          const cleanName = altName.trim();
          if (cleanName && cleanName !== 'None') {
            valueMap[cleanName] = value;
          }
        });
      }
      valueMap[tissueName] = value;
    };

    storeValue(densityByTissueName, densityValues, densityAvg);
    storeValue(heatCapacityByTissueName, heatCapacityValues, heatCapacityAvg);
    storeValue(thermalConductivityByTissueName, thermalConductivityValues, thermalConductivityAvg);
    storeValue(heatTransferRateByTissueName, heatTransferRateValues, heatTransferRateAvg);
    storeValue(heatGenerationRateByTissueName, heatGenerationRateValues, heatGenerationRateAvg);
    storeValue(speedOfSoundByTissueName, speedOfSoundValues, speedOfSoundAvg);
    storeValue(lfConductivityByTissueName, lfConductivityValues, lfConductivityAvg);
  }

  // Use 10th to 90th percentile bounds
  minDensity = calculatePercentile(densityValues, 10);
  maxDensity = calculatePercentile(densityValues, 90);
  minHeatCapacity = calculatePercentile(heatCapacityValues, 10);
  maxHeatCapacity = calculatePercentile(heatCapacityValues, 90);
  minThermalConductivity = calculatePercentile(thermalConductivityValues, 10);
  maxThermalConductivity = calculatePercentile(thermalConductivityValues, 90);
  minHeatTransferRate = calculatePercentile(heatTransferRateValues, 10);
  maxHeatTransferRate = calculatePercentile(heatTransferRateValues, 90);
  minHeatGenerationRate = calculatePercentile(heatGenerationRateValues, 10);
  maxHeatGenerationRate = calculatePercentile(heatGenerationRateValues, 90);
  minSpeedOfSound = calculatePercentile(speedOfSoundValues, 10);
  maxSpeedOfSound = calculatePercentile(speedOfSoundValues, 90);
  minLFConductivity = calculatePercentile(lfConductivityValues, 10);
  maxLFConductivity = calculatePercentile(lfConductivityValues, 90);
}

// Load dielectric properties and compute electromagnetic properties at current frequency
async function loadDielectricProperties() {
  const response = await fetch('/data/dielectric_properties.json');
  dielectricPropertiesData = await response.json();

  // Compute properties at current frequency
  computeElectromagneticProperties(currentFrequency);
}

async function loadAcousticAttenuationData() {
  const response = await fetch('/data/acoustic_attenuation.json');
  acousticAttenuationData = await response.json();

  // Compute attenuation at current frequency
  computeAcousticAttenuation(currentFrequency);
}

async function loadNonlinearityParameterData() {
  const response = await fetch('/data/nonlinearity_parameter.json');
  nonlinearityParameterData = await response.json();

  // Process nonlinearity parameter for all tissues
  const baValues = [];

  Object.keys(nonlinearityParameterData).forEach(tissueName => {
    const tissueData = nonlinearityParameterData[tissueName];
    const baValue = tissueData.nonlinearityParameter;

    nonlinearityParameterByTissueName[tissueName] = baValue;

    if (baValue !== null && baValue > 0) {
      baValues.push(baValue);
    }
  });

  // Use full min/max range for better differentiation (data already has limited variation)
  if (baValues.length > 0) {
    minNonlinearityParameter = Math.min(...baValues);
    maxNonlinearityParameter = Math.max(...baValues);
  }
}

async function loadRelaxationTimeData() {
  const response = await fetch('/data/relaxation_times.json');
  relaxationTimeData = await response.json();
}

async function loadWaterContentData() {
  const response = await fetch('/data/water_content.json');
  waterContentData = await response.json();

  // Process water content for all tissues
  const waterValues = [];

  Object.keys(waterContentData).forEach(tissueName => {
    const tissueData = waterContentData[tissueName];
    const waterContent = tissueData.waterContent;

    waterContentByTissueName[tissueName] = waterContent;

    if (waterContent !== null && waterContent > 0) {
      waterValues.push(waterContent);
    }
  });

  // Use 10th to 90th percentile bounds
  if (waterValues.length > 0) {
    minWaterContent = calculatePercentile(waterValues, 10);
    maxWaterContent = calculatePercentile(waterValues, 90);
  }
}

async function loadElementalCompositionData() {
  const response = await fetch('/data/elemental_composition.json');
  elementalCompositionData = await response.json();
}

// Compute elemental composition for current element
function computeElementalComposition(element) {
  const elementValues = [];

  Object.keys(elementalCompositionData).forEach(tissueName => {
    const tissueData = elementalCompositionData[tissueName];
    const value = tissueData.composition[element];

    elementalCompositionByTissueName[tissueName] = value;

    if (value !== null && value > 0) {
      elementValues.push(value);
    }
  });

  // Use 10th to 90th percentile bounds
  if (elementValues.length > 0) {
    minElementalComposition = calculatePercentile(elementValues, 10);
    maxElementalComposition = calculatePercentile(elementValues, 90);
  }
}

// Compute relaxation times for current field strength and parameter
function computeRelaxationTimes(fieldStrength, parameter) {
  const relaxationValues = [];
  const key = `${parameter.toLowerCase()}_${fieldStrength.replace('.', '')}`;  // e.g., "t1_15T"

  Object.keys(relaxationTimeData).forEach(tissueName => {
    const tissueData = relaxationTimeData[tissueName];
    const value = tissueData[key];

    relaxationTimeByTissueName[tissueName] = value;

    if (value !== null && value > 0) {
      relaxationValues.push(value);
    }
  });

  // Use 10th to 90th percentile bounds
  if (relaxationValues.length > 0) {
    minRelaxationTime = calculatePercentile(relaxationValues, 10);
    maxRelaxationTime = calculatePercentile(relaxationValues, 90);
  }
}

// Compute conductivity and permittivity for all tissues at given frequency
function computeElectromagneticProperties(frequency) {
  const conductivityValues = [];
  const permittivityValues = [];

  Object.keys(dielectricPropertiesData).forEach(tissueName => {
    const tissueData = dielectricPropertiesData[tissueName];
    const props = calculateElectromagneticProperties(tissueData, frequency);

    conductivityByTissueName[tissueName] = props.conductivity;
    permittivityByTissueName[tissueName] = props.permittivity;

    if (props.conductivity > 0) {
      conductivityValues.push(props.conductivity);
    }
    if (props.permittivity > 0) {
      permittivityValues.push(props.permittivity);
    }
  });

  // Use 10th to 90th percentile bounds
  minConductivity = calculatePercentile(conductivityValues, 10);
  maxConductivity = calculatePercentile(conductivityValues, 90);
  minPermittivity = calculatePercentile(permittivityValues, 10);
  maxPermittivity = calculatePercentile(permittivityValues, 90);
}

// Compute acoustic attenuation for all tissues at given frequency
function computeAcousticAttenuation(frequency) {
  const attenuationValues = [];

  Object.keys(acousticAttenuationData).forEach(tissueName => {
    const tissueData = acousticAttenuationData[tissueName];
    const attenuation = calculateAttenuationConstant(tissueData.attenuation, frequency);

    attenuationConstantByTissueName[tissueName] = attenuation;

    if (attenuation > 0) {
      attenuationValues.push(attenuation);
    }
  });

  // Use 10th to 90th percentile bounds
  minAttenuationConstant = calculatePercentile(attenuationValues, 10);
  maxAttenuationConstant = calculatePercentile(attenuationValues, 90);
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

// Hot colormap: black -> red -> orange -> yellow -> white
function hotColormap(value) {
  const t = Math.max(0, Math.min(1, value));

  if (t < 0.375) {
    // Black to red
    const s = t / 0.375;
    return [s, 0, 0];
  } else if (t < 0.75) {
    // Red to yellow
    const s = (t - 0.375) / 0.375;
    return [1, s, 0];
  } else {
    // Yellow to white
    const s = (t - 0.75) / 0.25;
    return [1, 1, s];
  }
}

// Seismic colormap: blue -> white -> red
function seismicColormap(value) {
  const t = Math.max(0, Math.min(1, value));

  if (t < 0.5) {
    // Blue to white
    const s = t / 0.5;
    return [s, s, 1];
  } else {
    // White to red
    const s = (t - 0.5) / 0.5;
    return [1, 1 - s, 1 - s];
  }
}

// ColorBrewer RdBu (Red-Blue diverging) colormap for mechanical properties
function rdbuColormap(value) {
  const t = Math.max(0, Math.min(1, value));

  // ColorBrewer RdBu diverging scheme (red at low, white at middle, blue at high)
  if (t < 0.5) {
    // Red to white
    const s = t / 0.5;
    return [0.698 + s * (1 - 0.698), 0.094 + s * (1 - 0.094), 0.169 + s * (1 - 0.169)];
  } else {
    // White to blue
    const s = (t - 0.5) / 0.5;
    return [1 - s * (1 - 0.019), 1 - s * (1 - 0.188), 1 - s * (1 - 0.380)];
  }
}

// Blue-Yellow colormap for electromagnetic properties
function blueYellowColormap(value) {
  const t = Math.max(0, Math.min(1, value));

  // Blue to yellow
  if (t < 0.5) {
    // Blue to cyan
    const s = t / 0.5;
    return [0, s, 1];
  } else {
    // Cyan to yellow
    const s = (t - 0.5) / 0.5;
    return [s, 1, 1 - s];
  }
}

// ColorBrewer YlGnBu (Yellow-Green-Blue) colormap - flipped to go from blue to yellow
function ylgnbuColormap(value) {
  const t = Math.max(0, Math.min(1, value));

  // Flip the colormap: blue at low values, yellow at high values
  const flipped = 1 - t;

  // ColorBrewer YlGnBu 9-class scheme (now: blue at low, yellow at high)
  if (flipped < 0.125) {
    // #ffffd9 to #edf8b1
    const s = flipped / 0.125;
    return [1, 1, 0.851 + s * (0.933 - 0.851)];
  } else if (flipped < 0.25) {
    // #edf8b1 to #c7e9b4
    const s = (flipped - 0.125) / 0.125;
    return [0.933 - s * (0.933 - 0.780), 0.973 - s * (0.973 - 0.914), 0.694 + s * (0.706 - 0.694)];
  } else if (flipped < 0.375) {
    // #c7e9b4 to #7fcdbb
    const s = (flipped - 0.25) / 0.125;
    return [0.780 - s * (0.780 - 0.498), 0.914 - s * (0.914 - 0.804), 0.706 + s * (0.733 - 0.706)];
  } else if (flipped < 0.5) {
    // #7fcdbb to #41b6c4
    const s = (flipped - 0.375) / 0.125;
    return [0.498 - s * (0.498 - 0.255), 0.804 - s * (0.804 - 0.714), 0.733 + s * (0.769 - 0.733)];
  } else if (flipped < 0.625) {
    // #41b6c4 to #1d91c0
    const s = (flipped - 0.5) / 0.125;
    return [0.255 - s * (0.255 - 0.114), 0.714 - s * (0.714 - 0.569), 0.769 - s * (0.769 - 0.753)];
  } else if (flipped < 0.75) {
    // #1d91c0 to #225ea8
    const s = (flipped - 0.625) / 0.125;
    return [0.114 + s * (0.133 - 0.114), 0.569 - s * (0.569 - 0.369), 0.753 - s * (0.753 - 0.659)];
  } else if (flipped < 0.875) {
    // #225ea8 to #253494
    const s = (flipped - 0.75) / 0.125;
    return [0.133 + s * (0.145 - 0.133), 0.369 - s * (0.369 - 0.204), 0.659 - s * (0.659 - 0.580)];
  } else {
    // #253494 to #081d58
    const s = (flipped - 0.875) / 0.125;
    return [0.145 - s * (0.145 - 0.031), 0.204 - s * (0.204 - 0.114), 0.580 - s * (0.580 - 0.345)];
  }
}

// Mako colormap - purple to green
function viridisColormap(value) {
  const t = Math.max(0, Math.min(1, value));

  // Mako color scheme (dark purple to bright green)
  if (t < 0.125) {
    const s = t / 0.125;
    return [0.044 + s * (0.096 - 0.044), 0.017 + s * (0.052 - 0.017), 0.090 + s * (0.165 - 0.090)];
  } else if (t < 0.25) {
    const s = (t - 0.125) / 0.125;
    return [0.096 + s * (0.161 - 0.096), 0.052 + s * (0.094 - 0.052), 0.165 + s * (0.251 - 0.165)];
  } else if (t < 0.375) {
    const s = (t - 0.25) / 0.125;
    return [0.161 + s * (0.231 - 0.161), 0.094 + s * (0.141 - 0.094), 0.251 + s * (0.333 - 0.251)];
  } else if (t < 0.5) {
    const s = (t - 0.375) / 0.125;
    return [0.231 + s * (0.298 - 0.231), 0.141 + s * (0.192 - 0.141), 0.333 + s * (0.404 - 0.333)];
  } else if (t < 0.625) {
    const s = (t - 0.5) / 0.125;
    return [0.298 + s * (0.259 - 0.298), 0.192 + s * (0.298 - 0.192), 0.404 + s * (0.427 - 0.404)];
  } else if (t < 0.75) {
    const s = (t - 0.625) / 0.125;
    return [0.259 + s * (0.180 - 0.259), 0.298 + s * (0.443 - 0.298), 0.427 + s * (0.427 - 0.427)];
  } else if (t < 0.875) {
    const s = (t - 0.75) / 0.125;
    return [0.180 + s * (0.161 - 0.180), 0.443 + s * (0.604 - 0.443), 0.427 + s * (0.412 - 0.427)];
  } else {
    const s = (t - 0.875) / 0.125;
    return [0.161 + s * (0.267 - 0.161), 0.604 + s * (0.765 - 0.604), 0.412 + s * (0.404 - 0.412)];
  }
}

function getDensityColor(tissueName) {
  const density = densityByTissueName[tissueName];
  if (!density) {
    return [0.5, 0.5, 0.5];
  }
  const normalized = (density - minDensity) / (maxDensity - minDensity);
  const clampedNormalized = Math.max(0, Math.min(1, normalized));
  return [clampedNormalized, clampedNormalized, clampedNormalized];
}

function getPropertyColor(tissueName, propertyMap, minVal, maxVal, colormapFunc) {
  const value = propertyMap[tissueName];
  if (!value || value <= 0) {
    return [0.5, 0.5, 0.5];
  }
  const normalized = (value - minVal) / (maxVal - minVal);
  const clampedNormalized = Math.max(0, Math.min(1, normalized));
  return colormapFunc(clampedNormalized);
}

function getTissueColor(filename) {
  // Strip .stl extension and look up by tissue name
  const tissueName = filename.replace('.stl', '').replace('_', '/');

  switch (visualizationMode) {
    case 'density':
      return getPropertyColor(tissueName, densityByTissueName, minDensity, maxDensity, rdbuColormap);
    case 'speedOfSound':
      return getPropertyColor(tissueName, speedOfSoundByTissueName, minSpeedOfSound, maxSpeedOfSound, rdbuColormap);
    case 'attenuationConstant':
      return getPropertyColor(tissueName, attenuationConstantByTissueName, minAttenuationConstant, maxAttenuationConstant, rdbuColormap);
    case 'nonlinearityParameter':
      // Return null for tissues without data (will make them transparent)
      const baValue = nonlinearityParameterByTissueName[tissueName];
      if (baValue === null || baValue === undefined) {
        return null; // Transparent
      }
      return getPropertyColor(tissueName, nonlinearityParameterByTissueName, minNonlinearityParameter, maxNonlinearityParameter, rdbuColormap);
    case 'heatCapacity':
      return getPropertyColor(tissueName, heatCapacityByTissueName, minHeatCapacity, maxHeatCapacity, hotColormap);
    case 'thermalConductivity':
      return getPropertyColor(tissueName, thermalConductivityByTissueName, minThermalConductivity, maxThermalConductivity, hotColormap);
    case 'heatTransferRate':
      return getPropertyColor(tissueName, heatTransferRateByTissueName, minHeatTransferRate, maxHeatTransferRate, hotColormap);
    case 'heatGenerationRate':
      return getPropertyColor(tissueName, heatGenerationRateByTissueName, minHeatGenerationRate, maxHeatGenerationRate, hotColormap);
    case 'conductivity':
      return getPropertyColor(tissueName, conductivityByTissueName, minConductivity, maxConductivity, ylgnbuColormap);
    case 'permittivity':
      return getPropertyColor(tissueName, permittivityByTissueName, minPermittivity, maxPermittivity, ylgnbuColormap);
    case 'relaxationTime':
      // Return null for tissues without data (will make them transparent)
      const relaxationValue = relaxationTimeByTissueName[tissueName];
      if (relaxationValue === null || relaxationValue === undefined) {
        return null; // Transparent
      }
      return getPropertyColor(tissueName, relaxationTimeByTissueName, minRelaxationTime, maxRelaxationTime, ylgnbuColormap);
    case 'waterContent':
      // Return null for tissues without data (will make them transparent)
      const waterValue = waterContentByTissueName[tissueName];
      if (waterValue === null || waterValue === undefined) {
        return null; // Transparent
      }
      return getPropertyColor(tissueName, waterContentByTissueName, minWaterContent, maxWaterContent, viridisColormap);
    case 'elementalComposition':
      // Return null for tissues without data (will make them transparent)
      const elementValue = elementalCompositionByTissueName[tissueName];
      if (elementValue === null || elementValue === undefined) {
        return null; // Transparent
      }
      return getPropertyColor(tissueName, elementalCompositionByTissueName, minElementalComposition, maxElementalComposition, viridisColormap);
    default:
      return tissueColorsByName[tissueName] || [0.5, 0.5, 0.5];
  }
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
  // Load tissue colors, density, and dielectric data
  await loadTissueColors();
  await loadDensityData();
  await loadDielectricProperties();
  await loadAcousticAttenuationData();
  await loadNonlinearityParameterData();
  await loadRelaxationTimeData();
  await loadWaterContentData();
  await loadElementalCompositionData();

  // Compute default element (hydrogen)
  computeElementalComposition(currentElement);

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

      // Handle transparency for tissues without data
      if (rgb === null) {
        property.setOpacity(0); // Fully transparent
      } else {
        property.setColor(rgb[0], rgb[1], rgb[2]);
        property.setAmbient(0.5);
        property.setDiffuse(0.8);
        property.setSpecular(0.1);
        property.setSpecularPower(10);
        property.setOpacity(0.2); // More transparent to see the slice
      }

      // Force color mode
      mapper.setScalarVisibility(false);

      loadedCount++;

      // After all STL files are loaded, load the voxel slice
      if (loadedCount === stlFiles.length) {
        // Get bounds of STL data to align with voxel data
        const stlBounds = renderer.computeVisiblePropBounds();
        // console.log('STL bounds:', stlBounds);
        loadVoxelSlice(stlBounds);
      }
    }).catch((error) => {
      console.error(`Failed to load ${filename}:`, error);

      loadedCount++;

      // Update status to error
      const statusIndicator = document.getElementById('status-indicator');
      const statusText = document.getElementById('status-text');
      if (statusIndicator && statusText) {
        statusIndicator.className = 'error';
        statusText.textContent = 'Failed to load';
      }

      // Continue loading if all files are processed (even with errors)
      if (loadedCount === stlFiles.length) {
        const stlBounds = renderer.computeVisiblePropBounds();
        if (stlBounds && stlBounds[0] !== Infinity) {
          loadVoxelSlice(stlBounds);
        }
      }
    });
  });
}

// Removed adjustDropdownWidth as we now use custom dropdown

// Add window resize listener to debug position
window.addEventListener('resize', debugRenderPosition);

// Debug initial position after a short delay
setTimeout(debugRenderPosition, 1000);

// Start loading
loadAllData();

// ----------------------------------------------------------------------------
// Load voxelized data for the slice
// ----------------------------------------------------------------------------

let imageSliceActor = null;
let voxelData = null;
let stlBounds = null;
let voxelColorTransferFunction = null;
let voxelOpacityFunction = null;
let defaultCameraState = null;

// Manual camera vertical offset - adjust this to shift view up/down
const CAMERA_VERTICAL_OFFSET = -20;

function loadVoxelSlice(bounds) {
  stlBounds = bounds;

  const voxelReader = vtkXMLImageDataReader.newInstance();

  voxelReader.setUrl('/data/MIDA_v1.0/MIDA_v1_voxels/MIDA_v1.vti').then(() => {
    console.log('Voxel reader promise resolved');
    let rawVoxelData;

    try {
      rawVoxelData = voxelReader.getOutputData();
      console.log('Raw voxel data:', rawVoxelData);
    } catch (error) {
      console.error('Error getting voxel output data:', error);
      alert('Memory allocation error loading voxel data. Try closing other browser tabs and refreshing.');
      return;
    }

    if (!rawVoxelData) {
      console.error('Failed to load voxel data - getOutputData returned undefined');
      return;
    }

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
    // console.log('STL bounds:', stlBounds);
    // console.log('Voxel data spacing:', voxelData.getSpacing());
    // console.log('Voxel data origin:', voxelData.getOrigin());
    // console.log('Voxel data bounds:', voxelBounds);

    // Calculate offset to align voxel coordinate system with STL coordinate system
    yOffset = stlBounds[2] - voxelBounds[2]; // Align min Y values
    const xOffset = stlBounds[0] - voxelBounds[0]; // Align min X values
    const zOffset = stlBounds[4] - voxelBounds[4]; // Align min Z values
    // console.log('Offsets to align coordinate systems - X:', xOffset, 'Y:', yOffset, 'Z:', zOffset);

    // Calculate centers for rotation
    const voxelCenterX = (voxelBounds[0] + voxelBounds[1]) / 2;
    const voxelCenterY = (voxelBounds[2] + voxelBounds[3]) / 2;
    const voxelCenterZ = (voxelBounds[4] + voxelBounds[5]) / 2;
    const stlCenterX = (stlBounds[0] + stlBounds[1]) / 2;
    const stlCenterY = (stlBounds[2] + stlBounds[3]) / 2;
    const stlCenterZ = (stlBounds[4] + stlBounds[5]) / 2;
    // console.log('Voxel center:', voxelCenterX, voxelCenterY, voxelCenterZ);
    // console.log('STL center:', stlCenterX, stlCenterY, stlCenterZ);

    // Create color transfer function for voxel data
    voxelColorTransferFunction = vtkColorTransferFunction.newInstance();
    for (let i = 0; i <= 116; i++) {
      const rgb = tissueColorsByID[i] || [0.5, 0.5, 0.5];
      voxelColorTransferFunction.addRGBPoint(i, rgb[0], rgb[1], rgb[2]);
    }

    // Create opacity transfer function - make background (ID 0) transparent
    const ofun = vtkPiecewiseFunction.newInstance();
    voxelOpacityFunction = ofun; // Store reference for later updates
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

    // console.log('Auto-calculated adjustments - xAdjust:', xAdjust, 'zAdjust:', zAdjust);
    // console.log('Manual offsets - xManualOffset:', xManualOffset, 'zManualOffset:', zManualOffset);

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

    // Set up initial camera position
    renderer.resetCamera();
    const camera = renderer.getActiveCamera();
    camera.azimuth(210);
    camera.elevation(30);
    camera.zoom(1.3);

    // Move camera position with manual vertical offset
    const position = camera.getPosition();
    camera.setPosition(position[0], position[1] + CAMERA_VERTICAL_OFFSET, position[2]);
    const focalPoint = camera.getFocalPoint();
    camera.setFocalPoint(focalPoint[0], focalPoint[1] + CAMERA_VERTICAL_OFFSET, focalPoint[2]);

    // Save default camera state (before any user interaction)
    defaultCameraState = {
      position: [...camera.getPosition()],
      focalPoint: [...camera.getFocalPoint()],
      viewUp: [...camera.getViewUp()],
      viewAngle: camera.getViewAngle(),
      clippingRange: [...camera.getClippingRange()],
      parallelScale: camera.getParallelScale()
    };

    updateSlicePosition(66.67); // Start at 1/3 down from top

    renderWindow.getRenderWindow().render();

    // Update loading status to success
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    if (statusIndicator && statusText) {
      statusIndicator.className = 'loaded';
      statusText.textContent = 'Model loaded!';
    }

    // Fade in UI elements after volume is loaded
    const vizModeContainer = document.getElementById('viz-mode-container');
    const sliderContainer = document.getElementById('slider-container');
    const resetButton = document.getElementById('reset-camera-btn');

    if (vizModeContainer) vizModeContainer.style.opacity = '1';
    if (sliderContainer) sliderContainer.style.opacity = '1';
    if (resetButton) resetButton.style.opacity = '1';

    // Set up slider control
    const slider = document.getElementById('depth-slider');
    slider.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      updateSlicePosition(value);
    });

    // Set up custom visualization mode dropdown
    const modeSelector = document.getElementById('viz-mode-selector');
    const modeCurrent = document.getElementById('viz-mode-current');
    const modeDropdown = document.getElementById('viz-mode-dropdown');

    // Toggle dropdown on click
    modeSelector.addEventListener('click', (event) => {
      if (event.target.classList.contains('dropdown-item')) return; // Don't toggle if clicking an item
      modeDropdown.classList.toggle('dropdown-hidden');
    });

    // Handle item selection
    modeDropdown.addEventListener('click', (event) => {
      if (event.target.classList.contains('dropdown-item')) {
        const value = event.target.getAttribute('data-value');
        const text = event.target.textContent;
        modeCurrent.textContent = text;
        modeDropdown.classList.add('dropdown-hidden');
        setVisualizationMode(value);

        // Show/hide frequency controls for frequency-dependent properties
        const frequencyControls = document.getElementById('frequency-controls');
        const relaxationTimeControls = document.getElementById('relaxation-time-controls');
        const elementControls = document.getElementById('element-controls');
        if (value === 'conductivity' || value === 'permittivity' || value === 'attenuationConstant') {
          frequencyControls.classList.add('visible');
          relaxationTimeControls.classList.remove('visible');
          elementControls.classList.remove('visible');
        } else if (value === 'relaxationTime') {
          frequencyControls.classList.remove('visible');
          relaxationTimeControls.classList.add('visible');
          elementControls.classList.remove('visible');
          // Compute with default values (1.5T, T1)
          computeRelaxationTimes(currentFieldStrength, currentRelaxationParameter);
          setVisualizationMode('relaxationTime');
        } else if (value === 'elementalComposition') {
          frequencyControls.classList.remove('visible');
          relaxationTimeControls.classList.remove('visible');
          elementControls.classList.add('visible');
          // Compute with default element (hydrogen)
          computeElementalComposition(currentElement);
          setVisualizationMode('elementalComposition');
        } else {
          frequencyControls.classList.remove('visible');
          relaxationTimeControls.classList.remove('visible');
          elementControls.classList.remove('visible');
        }
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
      if (!modeSelector.contains(event.target)) {
        modeDropdown.classList.add('dropdown-hidden');
      }
    });

    // Set up reset camera button
    const resetCameraBtn = document.getElementById('reset-camera-btn');
    if (resetCameraBtn) {
      resetCameraBtn.addEventListener('click', () => {
        resetCameraToDefault();
        renderWindow.getRenderWindow().render();
      });
    }

    // Set up frequency compute button
    const computeFrequencyBtn = document.getElementById('compute-frequency-btn');
    const frequencyInput = document.getElementById('frequency-input');
    const frequencyUnit = document.getElementById('frequency-unit');

    if (computeFrequencyBtn && frequencyInput && frequencyUnit) {
      // Validate numeric input only
      frequencyInput.addEventListener('input', (event) => {
        const value = event.target.value;
        // Allow only numbers and decimal point
        if (value && !/^\d*\.?\d*$/.test(value)) {
          alert('Please enter only numeric values.');
          event.target.value = value.slice(0, -1); // Remove last character
        }
      });

      computeFrequencyBtn.addEventListener('click', () => {
        const inputValue = frequencyInput.value.trim();

        // Check if empty
        if (!inputValue) {
          alert('Please enter a frequency value.');
          return;
        }

        const numValue = parseFloat(inputValue);

        // Check if valid number
        if (isNaN(numValue) || numValue <= 0) {
          alert('Please enter a valid positive number.');
          return;
        }

        // Get unit multiplier
        const unitMultiplier = parseFloat(frequencyUnit.value);
        const frequency = numValue * unitMultiplier;

        // Validate range based on current visualization mode
        if (visualizationMode === 'attenuationConstant') {
          // Acoustic attenuation: 10 Hz to 1 GHz
          if (frequency < 10 || frequency > 1e9) {
            alert('Please choose a frequency between 10 Hz and 1 GHz for acoustic attenuation.');
            return;
          }
        } else {
          // Electromagnetic properties: 10 Hz to 100 GHz
          if (frequency < 10 || frequency > 100e9) {
            alert('Please choose a frequency between 10 Hz and 100 GHz for electromagnetic properties.');
            return;
          }
        }

        // Update current frequency and recompute properties
        currentFrequency = frequency;
        computeElectromagneticProperties(frequency);
        computeAcousticAttenuation(frequency);

        // Update visualization if in frequency-dependent mode
        if (visualizationMode === 'conductivity' || visualizationMode === 'permittivity' || visualizationMode === 'attenuationConstant') {
          setVisualizationMode(visualizationMode);
        }

        console.log(`Computed frequency-dependent properties at ${formatFrequency(frequency)}`);
      });

      // Allow Enter key to compute
      frequencyInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
          computeFrequencyBtn.click();
        }
      });
    }

    // Set up relaxation time controls
    const displayRelaxationBtn = document.getElementById('display-relaxation-btn');
    const fieldStrengthSelect = document.getElementById('field-strength-select');
    const relaxationParameterSelect = document.getElementById('relaxation-parameter-select');

    if (displayRelaxationBtn && fieldStrengthSelect && relaxationParameterSelect) {
      displayRelaxationBtn.addEventListener('click', () => {
        currentFieldStrength = fieldStrengthSelect.value;
        currentRelaxationParameter = relaxationParameterSelect.value;

        // Compute relaxation times with selected parameters
        computeRelaxationTimes(currentFieldStrength, currentRelaxationParameter);

        // Update visualization
        if (visualizationMode === 'relaxationTime') {
          setVisualizationMode('relaxationTime');
        }

        console.log(`Computed relaxation times for ${currentFieldStrength} ${currentRelaxationParameter}`);
      });
    }

    // Set up element composition controls
    const displayElementBtn = document.getElementById('display-element-btn');
    const elementSelect = document.getElementById('element-select');

    if (displayElementBtn && elementSelect) {
      displayElementBtn.addEventListener('click', () => {
        currentElement = elementSelect.value;

        // Compute elemental composition for selected element
        computeElementalComposition(currentElement);

        // Update visualization
        if (visualizationMode === 'elementalComposition') {
          setVisualizationMode('elementalComposition');
        }

        console.log(`Computed elemental composition for ${currentElement}`);
      });
    }
  });
}

function resetCameraToDefault() {
  if (!defaultCameraState) return;

  const camera = renderer.getActiveCamera();
  camera.setPosition(...defaultCameraState.position);
  camera.setFocalPoint(...defaultCameraState.focalPoint);
  camera.setViewUp(...defaultCameraState.viewUp);
  camera.setViewAngle(defaultCameraState.viewAngle);
  camera.setClippingRange(...defaultCameraState.clippingRange);
  camera.setParallelScale(defaultCameraState.parallelScale);
  renderer.resetCameraClippingRange();
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
function drawColorbar(mode) {
  const canvas = document.getElementById('colorbar');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  // Determine colormap function, min/max values, and units
  let colormapFunc, minVal, maxVal, units;
  switch (mode) {
    case 'default':
      // For default mode, show tissue ID range (0-116) with default colors
      colormapFunc = null; // Will draw default anatomical colors
      minVal = 0;
      maxVal = 116;
      units = null; // No units for default
      break;
    case 'density':
      colormapFunc = rdbuColormap;
      minVal = minDensity;
      maxVal = maxDensity;
      units = 'kg/m³';
      break;
    case 'speedOfSound':
      colormapFunc = rdbuColormap;
      minVal = minSpeedOfSound;
      maxVal = maxSpeedOfSound;
      units = 'm/s';
      break;
    case 'attenuationConstant':
      colormapFunc = rdbuColormap;
      minVal = minAttenuationConstant;
      maxVal = maxAttenuationConstant;
      units = 'Np/m';
      break;
    case 'nonlinearityParameter':
      colormapFunc = rdbuColormap;
      minVal = minNonlinearityParameter;
      maxVal = maxNonlinearityParameter;
      units = 'B/A';
      break;
    case 'heatCapacity':
      colormapFunc = hotColormap;
      minVal = minHeatCapacity;
      maxVal = maxHeatCapacity;
      units = 'J/kg/°C';
      break;
    case 'thermalConductivity':
      colormapFunc = hotColormap;
      minVal = minThermalConductivity;
      maxVal = maxThermalConductivity;
      units = 'W/m/°C';
      break;
    case 'heatTransferRate':
      colormapFunc = hotColormap;
      minVal = minHeatTransferRate;
      maxVal = maxHeatTransferRate;
      units = 'ml/min/kg';
      break;
    case 'heatGenerationRate':
      colormapFunc = hotColormap;
      minVal = minHeatGenerationRate;
      maxVal = maxHeatGenerationRate;
      units = 'W/kg';
      break;
    case 'conductivity':
      colormapFunc = ylgnbuColormap;
      minVal = minConductivity;
      maxVal = maxConductivity;
      units = 'S/m';
      break;
    case 'permittivity':
      colormapFunc = ylgnbuColormap;
      minVal = minPermittivity;
      maxVal = maxPermittivity;
      units = 'ε_r';
      break;
    case 'relaxationTime':
      colormapFunc = ylgnbuColormap;
      minVal = minRelaxationTime;
      maxVal = maxRelaxationTime;
      units = 'ms';
      break;
    case 'waterContent':
      colormapFunc = viridisColormap;
      minVal = minWaterContent;
      maxVal = maxWaterContent;
      units = '%';
      break;
    case 'elementalComposition':
      colormapFunc = viridisColormap;
      // Convert to percentage (multiply by 100)
      minVal = minElementalComposition * 100;
      maxVal = maxElementalComposition * 100;
      units = '%';
      break;
    default:
      return;
  }

  // Draw gradient from top (high) to bottom (low)
  if (colormapFunc === null) {
    // For default mode, draw anatomical colors for each tissue ID
    const idsPerPixel = 117 / height; // 117 tissue IDs (0-116)
    for (let y = 0; y < height; y++) {
      const tissueID = Math.floor(116 - (y * idsPerPixel)); // top = 116, bottom = 0
      const rgb = tissueColorsByID[tissueID] || [0.5, 0.5, 0.5];
      const r = Math.floor(rgb[0] * 255);
      const g = Math.floor(rgb[1] * 255);
      const b = Math.floor(rgb[2] * 255);

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(0, y, width, 1);
    }
  } else {
    // For other modes, use the colormap function
    for (let y = 0; y < height; y++) {
      const value = 1 - (y / height); // top = 1 (high), bottom = 0 (low)
      const rgb = colormapFunc(value);
      const r = Math.floor(rgb[0] * 255);
      const g = Math.floor(rgb[1] * 255);
      const b = Math.floor(rgb[2] * 255);

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(0, y, width, 1);
    }
  }

  // Update title (centered via CSS)
  const titleElement = document.querySelector('.colorbar-title');
  if (titleElement) {
    if (units) {
      titleElement.textContent = units;
      titleElement.style.visibility = 'visible';
    } else {
      titleElement.textContent = '';
      titleElement.style.visibility = 'hidden';
    }
  }

  // Update labels and tick marks - 7 ticks total (hide for default mode)
  const tickContainer = document.getElementById('colorbar-tick-marks');
  const ticksContainer = document.getElementById('colorbar-ticks');
  tickContainer.innerHTML = '';
  ticksContainer.innerHTML = '';

  if (mode !== 'default') {
    const numTicks = 7;

    for (let i = 0; i < numTicks; i++) {
      const pos = i / (numTicks - 1); // 0 to 1

      // Draw tick mark
      const tick = document.createElement('div');
      tick.className = 'tick-mark';
      tick.style.top = `${pos * height}px`;
      tickContainer.appendChild(tick);

      // Add label with linear spacing
      const label = document.createElement('div');
      label.className = 'colorbar-tick';
      const value = maxVal - (pos * (maxVal - minVal));

      // Use scientific notation for conductivity and permittivity if values are small
      if ((mode === 'conductivity' || mode === 'permittivity') && Math.abs(value) < 1) {
        label.textContent = value.toExponential(1);
      } else if (mode === 'elementalComposition') {
        // Use exponential notation for elemental composition
        label.textContent = value.toExponential(2);
      } else if (mode === 'nonlinearityParameter') {
        // Show 2 decimal places for nonlinearity parameter (B/A)
        label.textContent = value.toFixed(2);
      } else {
        label.textContent = Math.round(value);
      }

      ticksContainer.appendChild(label);
    }
  }
}

// Debug function to print render element center position
function debugRenderPosition() {
  const renderWrapper = document.getElementById('render-wrapper');
  const colorbar = document.getElementById('colorbar-container');
  const slider = document.getElementById('slider-container');

  if (!renderWrapper) return;

  const renderRect = renderWrapper.getBoundingClientRect();
  const centerX = renderRect.left + renderRect.width / 2;
  const centerY = renderRect.top + renderRect.height / 2;
  const pageWidth = window.innerWidth;
  const pageCenterX = pageWidth / 2;
  const offset = centerX - pageCenterX;

  console.log('=== Render Element Position Debug ===');
  console.log(`Page width: ${pageWidth}px`);
  console.log(`Page center X: ${pageCenterX}px`);
  console.log(`Render element center X: ${centerX.toFixed(2)}px`);
  console.log(`Render element center Y: ${centerY.toFixed(2)}px`);
  console.log(`Offset from page center: ${offset.toFixed(2)}px ${offset > 0 ? '(right)' : '(left)'}`);
  console.log(`Render element: top=${renderRect.top.toFixed(2)}px, height=${renderRect.height}px`);

  if (colorbar) {
    const colorbarRect = colorbar.getBoundingClientRect();
    const colorbarCenterY = colorbarRect.top + colorbarRect.height / 2;
    const yOffset = colorbarCenterY - centerY;
    console.log(`Colorbar center Y: ${colorbarCenterY.toFixed(2)}px`);
    console.log(`Colorbar Y offset from render center: ${yOffset.toFixed(2)}px ${yOffset > 0 ? '(below)' : '(above)'}`);
  }

  if (slider) {
    const sliderRect = slider.getBoundingClientRect();
    const sliderCenterY = sliderRect.top + sliderRect.height / 2;
    const yOffset = sliderCenterY - centerY;
    console.log(`Slider center Y: ${sliderCenterY.toFixed(2)}px`);
    console.log(`Slider Y offset from render center: ${yOffset.toFixed(2)}px ${yOffset > 0 ? '(below)' : '(above)'}`);
  }

  console.log('====================================');
}

// Function to switch visualization modes
function setVisualizationMode(mode) {
  visualizationMode = mode;

  // Show/hide colorbar
  const colorbarContainer = document.getElementById('colorbar-container');
  if (mode !== 'default') {
    colorbarContainer.classList.add('visible');
    drawColorbar(mode);
  } else {
    colorbarContainer.classList.remove('visible');
  }

  // Debug position after colorbar visibility changes
  setTimeout(debugRenderPosition, 350); // Wait for transition to complete

  // Update STL surface colors
  Object.keys(actors).forEach(filename => {
    const actor = actors[filename];
    const rgb = getTissueColor(filename);
    const property = actor.getProperty();

    // Handle transparency for tissues without data
    if (rgb === null) {
      property.setOpacity(0); // Fully transparent
    } else {
      property.setColor(rgb[0], rgb[1], rgb[2]);
      property.setOpacity(0.2); // Reset to normal opacity
    }
  });

  // Update voxel slice colors and opacity
  if (voxelColorTransferFunction && voxelOpacityFunction) {
    voxelColorTransferFunction.removeAllPoints();
    voxelOpacityFunction.removeAllPoints();

    // Background always transparent
    voxelColorTransferFunction.addRGBPoint(0, 0, 0, 0);
    voxelOpacityFunction.addPoint(0, 0.0);

    if (mode !== 'default') {
      // Build property-based color mapping for each tissue ID (skip background at i=0)
      for (let i = 1; i <= 116; i++) {
        const tissueName = tissueNamesByID[i];
        let rgb;

        if (tissueName) {
          switch (mode) {
            case 'density':
              rgb = getPropertyColor(tissueName, densityByTissueName, minDensity, maxDensity, rdbuColormap);
              break;
            case 'speedOfSound':
              rgb = getPropertyColor(tissueName, speedOfSoundByTissueName, minSpeedOfSound, maxSpeedOfSound, rdbuColormap);
              break;
            case 'attenuationConstant':
              rgb = getPropertyColor(tissueName, attenuationConstantByTissueName, minAttenuationConstant, maxAttenuationConstant, rdbuColormap);
              break;
            case 'nonlinearityParameter':
              // Check if tissue has data
              const baValue = nonlinearityParameterByTissueName[tissueName];
              if (baValue === null || baValue === undefined) {
                rgb = null; // Will be handled below for transparency
              } else {
                rgb = getPropertyColor(tissueName, nonlinearityParameterByTissueName, minNonlinearityParameter, maxNonlinearityParameter, rdbuColormap);
              }
              break;
            case 'heatCapacity':
              rgb = getPropertyColor(tissueName, heatCapacityByTissueName, minHeatCapacity, maxHeatCapacity, hotColormap);
              break;
            case 'thermalConductivity':
              rgb = getPropertyColor(tissueName, thermalConductivityByTissueName, minThermalConductivity, maxThermalConductivity, hotColormap);
              break;
            case 'heatTransferRate':
              rgb = getPropertyColor(tissueName, heatTransferRateByTissueName, minHeatTransferRate, maxHeatTransferRate, hotColormap);
              break;
            case 'heatGenerationRate':
              rgb = getPropertyColor(tissueName, heatGenerationRateByTissueName, minHeatGenerationRate, maxHeatGenerationRate, hotColormap);
              break;
            case 'conductivity':
              rgb = getPropertyColor(tissueName, conductivityByTissueName, minConductivity, maxConductivity, ylgnbuColormap);
              break;
            case 'permittivity':
              rgb = getPropertyColor(tissueName, permittivityByTissueName, minPermittivity, maxPermittivity, ylgnbuColormap);
              break;
            case 'relaxationTime':
              // Check if tissue has data
              const relaxationValue = relaxationTimeByTissueName[tissueName];
              if (relaxationValue === null || relaxationValue === undefined) {
                rgb = null; // Will be handled below for transparency
              } else {
                rgb = getPropertyColor(tissueName, relaxationTimeByTissueName, minRelaxationTime, maxRelaxationTime, ylgnbuColormap);
              }
              break;
            case 'waterContent':
              // Check if tissue has data
              const waterValue = waterContentByTissueName[tissueName];
              if (waterValue === null || waterValue === undefined) {
                rgb = null; // Will be handled below for transparency
              } else {
                rgb = getPropertyColor(tissueName, waterContentByTissueName, minWaterContent, maxWaterContent, viridisColormap);
              }
              break;
            case 'elementalComposition':
              // Check if tissue has data
              const elementValue = elementalCompositionByTissueName[tissueName];
              if (elementValue === null || elementValue === undefined) {
                rgb = null; // Will be handled below for transparency
              } else {
                rgb = getPropertyColor(tissueName, elementalCompositionByTissueName, minElementalComposition, maxElementalComposition, viridisColormap);
              }
              break;
            default:
              rgb = [0.5, 0.5, 0.5];
          }
        } else {
          rgb = [0.5, 0.5, 0.5]; // Default gray for unknown tissues
        }

        // Handle color and opacity
        if (rgb === null) {
          // Tissue has no data - make it transparent
          voxelColorTransferFunction.addRGBPoint(i, 0, 0, 0);
          voxelOpacityFunction.addPoint(i, 0.0); // Transparent
        } else {
          voxelColorTransferFunction.addRGBPoint(i, rgb[0], rgb[1], rgb[2]);
          voxelOpacityFunction.addPoint(i, 1.0); // Opaque
        }
      }
    } else {
      // Restore default anatomical colors (skip background at i=0)
      for (let i = 1; i <= 116; i++) {
        const rgb = tissueColorsByID[i] || [0.5, 0.5, 0.5];
        voxelColorTransferFunction.addRGBPoint(i, rgb[0], rgb[1], rgb[2]);
        voxelOpacityFunction.addPoint(i, 1.0); // All opaque in default mode
      }
    }
  }

  // Re-render the scene
  renderWindow.getRenderWindow().render();
}
