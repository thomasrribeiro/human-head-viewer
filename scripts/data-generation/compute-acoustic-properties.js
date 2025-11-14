/**
 * Compute frequency-dependent acoustic attenuation properties
 * Based on IT'IS Foundation database
 * Formula: α = α0 * f^b
 * where α (Np/m) is attenuation coefficient, f is frequency, α0 (Np/m/MHz), b is tissue constant
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse the IT'IS database to extract acoustic attenuation parameters
 */
function parseAcousticDatabase(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Skip first 3 header lines, start from line 4 (index 3)
  const tissues = {};

  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const columns = line.split('\t');

    // Column 2: Tissue Name
    const tissueName = columns[1]?.trim();
    if (!tissueName) continue;

    // Column 76: α0 [Np/m/MHz] (0-indexed: column 75)
    // Column 77: b (0-indexed: column 76)
    const alpha0 = parseFloat(columns[75]) || 0;
    const b = parseFloat(columns[76]) || 1; // Default b=1 if not specified

    // Column 42: Alternative Names (0-indexed: column 41)
    const altNamesRaw = columns[41] || '';
    const alternativeNames = [];
    if (altNamesRaw && altNamesRaw !== 'None' && altNamesRaw.length > 0) {
      const names = altNamesRaw.replace(/"/g, '').split('@');
      names.forEach(name => {
        const cleanName = name.trim();
        if (cleanName && cleanName !== 'None') {
          alternativeNames.push(cleanName);
        }
      });
    }

    const tissueData = {
      name: tissueName,
      alternativeNames,
      attenuation: {
        alpha0,  // Np/m/MHz
        b        // Exponent
      }
    };

    // Store under main name
    tissues[tissueName] = tissueData;

    // Also store under all alternative names for easy lookup
    alternativeNames.forEach(altName => {
      tissues[altName] = tissueData;
    });
  }

  // Manual fixes for MIDA tissue name mismatches
  // Background maps to Air
  if (tissues['Air']) {
    tissues['Background'] = tissues['Air'];
  }

  // Eye Retina/Choroid/Sclera maps to Eye (Sclera)
  if (tissues['Eye (Sclera)']) {
    tissues['Eye Retina/Choroid/Sclera'] = tissues['Eye (Sclera)'];
  }

  return tissues;
}

/**
 * Calculate attenuation coefficient at given frequency
 * @param {Object} params - Attenuation parameters {alpha0, b}
 * @param {number} frequency - Frequency in Hz
 * @returns {number} Attenuation coefficient in Np/m
 */
function calculateAttenuation(params, frequency) {
  const { alpha0, b } = params;

  // Convert frequency to MHz
  const freqMHz = frequency / 1e6;

  // α = α0 * f^b
  const alpha = alpha0 * Math.pow(freqMHz, b);

  return alpha;
}

/**
 * Load MIDA tissue names
 */
function loadMIDATissueNames(midaFilePath) {
  const content = fs.readFileSync(midaFilePath, 'utf-8');
  const lines = content.trim().split('\n');

  const tissueNames = [];
  lines.forEach(line => {
    const parts = line.split('\t');
    if (parts.length >= 5) {
      const name = parts.slice(4).join('\t').trim();
      tissueNames.push(name);
    }
  });

  return tissueNames;
}

/**
 * Validate against reference data at 1MHz for MIDA tissues only
 */
function validate(tissues, validationFilePath, midaTissueNames) {
  const validationContent = fs.readFileSync(validationFilePath, 'utf-8');
  const validationLines = validationContent.split('\n');

  // Build validation map
  const validationMap = {};
  for (let i = 1; i < validationLines.length; i++) {
    const line = validationLines[i].trim();
    if (!line) continue;

    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const tissueName = parts[0].trim();
    const referenceAlpha = parseFloat(parts[1]);
    validationMap[tissueName] = referenceAlpha;
  }

  let totalTissues = 0;
  let correctTissues = 0;
  let missingTissues = 0;
  let noReference = 0;


  midaTissueNames.forEach(tissueName => {
    totalTissues++;

    if (!tissues[tissueName]) {
      missingTissues++;
      return;
    }

    if (!validationMap[tissueName]) {
      noReference++;
      return;
    }

    const referenceAlpha = validationMap[tissueName];
    const tissueData = tissues[tissueName];
    const calculatedAlpha = calculateAttenuation(tissueData.attenuation, 1e6); // 1 MHz

    const percentError = Math.abs((calculatedAlpha - referenceAlpha) / referenceAlpha) * 100;

    if (percentError < 1.0) {
      correctTissues++;
    } else if (Math.abs(calculatedAlpha - referenceAlpha) < 0.001) {
      // Both very close to zero
      correctTissues++;
    } else {
    }
  });

}

// Main execution
const databasePath = path.join(__dirname, '../data/Database-V5-0/Thermal_dielectric_acoustic_MR properties_database_V5.0(ASCII).txt');
const validationPath = path.join(__dirname, '../data/Database-V5-0/attenuation_constant_1MHz.txt');
const midaPath = path.join(__dirname, '../data/MIDA_v1_voxels/MIDA_v1.txt');
const outputPath = path.join(__dirname, '../data/acoustic_attenuation.json');

const tissues = parseAcousticDatabase(databasePath);


// Count unique tissues
const uniqueTissues = new Set();
Object.values(tissues).forEach(t => uniqueTissues.add(t.name));

// Load MIDA tissue names
const midaTissueNames = loadMIDATissueNames(midaPath);

// Validate against MIDA tissues only
validate(tissues, validationPath, midaTissueNames);

// Update unified tissue properties file
const { loadTissueProperties, getOrCreateTissue, saveTissueProperties } = require('./tissue-properties-helper');

const tissueProperties = loadTissueProperties();

Object.entries(tissues).forEach(([tissueName, tissueData]) => {
  const tissue = getOrCreateTissue(tissueProperties, tissueName, tissueData);
  if (!tissue.properties.acoustic) {
    tissue.properties.acoustic = {};
  }
  tissue.properties.acoustic.attenuation = tissueData.attenuation;
});

saveTissueProperties(tissueProperties);
