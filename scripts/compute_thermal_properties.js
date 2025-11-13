/**
 * Extract thermal and mechanical properties from IT'IS database
 * Including: density, heat capacity, thermal conductivity, heat transfer/generation rates, and speed of sound
 */

const fs = require('fs');
const path = require('path');

const databasePath = path.join(__dirname, '../data/Database-V5-0/Thermal_dielectric_acoustic_MR properties_database_V5.0(ASCII).txt');


// Read database file
const content = fs.readFileSync(databasePath, 'utf-8');
const lines = content.split('\n');

// Parse tissue data starting from line 4 (0-indexed line 3)
const tissues = {};
let tissueCount = 0;
let alternativeNamesCount = 0;

for (let i = 3; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  const columns = line.split('\t');

  // Column 2: Tissue Name (0-indexed: 1)
  const tissueName = columns[1]?.trim();
  if (!tissueName) continue;

  // Parse thermal properties
  // Note: These column indices have been verified against the database
  const density = parseFloat(columns[2]) || null;           // Column 3 (0-indexed: 2)
  const heatCapacity = parseFloat(columns[6]) || null;      // Column 7 (0-indexed: 6)
  const thermalConductivity = parseFloat(columns[12]) || null; // Column 13 (0-indexed: 12)
  const heatTransferRate = parseFloat(columns[14]) || null;    // Column 15 (0-indexed: 14)
  const heatGenerationRate = parseFloat(columns[18]) || null;  // Column 19 (0-indexed: 18)

  // Speed of sound (mechanical property)
  const speedOfSound = parseFloat(columns[65]) || null;     // Column 66 (0-indexed: 65)

  // Alternative Names (column 42, 0-indexed: 41)
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
    thermal: {
      density,
      heatCapacity,
      thermalConductivity,
      heatTransferRate,
      heatGenerationRate
    },
    speedOfSound
  };

  // Store under main name
  tissues[tissueName] = tissueData;
  tissueCount++;

  // Also store under all alternative names for easy lookup
  alternativeNames.forEach(altName => {
    tissues[altName] = tissueData;
    alternativeNamesCount++;
  });
}


// Add manual fixes for MIDA tissue name mismatches
if (tissues['Air']) {
  tissues['Background'] = tissues['Air'];
}
if (tissues['Eye (Sclera)']) {
  tissues['Eye Retina/Choroid/Sclera'] = tissues['Eye (Sclera)'];
}

// Log some sample values for verification
const testTissues = ['Brain (Grey Matter)', 'Bone (Cancellous)', 'Blood'];
testTissues.forEach(tissueName => {
  if (tissues[tissueName]) {
    const t = tissues[tissueName];
  }
});

// Update unified tissue properties file
const { loadTissueProperties, getOrCreateTissue, saveTissueProperties } = require('./tissue-properties-helper');

const tissueProperties = loadTissueProperties();

Object.entries(tissues).forEach(([tissueName, tissueData]) => {
  const tissue = getOrCreateTissue(tissueProperties, tissueName, tissueData);

  // Add thermal properties
  tissue.properties.thermal = tissueData.thermal;

  // Add speed of sound to acoustic properties
  if (!tissue.properties.acoustic) {
    tissue.properties.acoustic = {};
  }
  tissue.properties.acoustic.speedOfSound = tissueData.speedOfSound;
});

saveTissueProperties(tissueProperties);
