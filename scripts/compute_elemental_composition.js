const fs = require('fs');
const path = require('path');

console.log('Parsing Elemental Composition database...');

const elementalDbPath = '/Users/thomasribeiro/code/human-head-viewer/data/Database-V5-0/Elemental_Composition_database V5.0(ASCII).txt';
const thermalDbPath = '/Users/thomasribeiro/Documents/tissue_database/Database-V5-0/Thermal_dielectric_acoustic_MR properties_database_V5.0(ASCII).txt';
const midaPath = '/Users/thomasribeiro/code/human-head-viewer/data/MIDA_v1.0/MIDA_v1_voxels/MIDA_v1.txt';
const outputPath = '/Users/thomasribeiro/code/human-head-viewer/data/elemental_composition.json';

// Element list from the header
const elements = ['hydrogen', 'carbon', 'nitrogen', 'oxygen', 'sodium', 'magnesium',
                  'silicon', 'phosphor', 'sulfur', 'chlorine', 'argon', 'potassium',
                  'calcium', 'scandium', 'iron', 'zinc', 'iodine'];

// Read elemental composition database
const elementalLines = fs.readFileSync(elementalDbPath, 'latin1').split('\n');

// Parse elemental data
const elementalData = {};
let currentTissue = null;

for (let i = 3; i < elementalLines.length; i++) {
  const line = elementalLines[i].trim();
  if (!line) continue;

  const columns = line.split('\t');
  const firstCol = columns[0] ? columns[0].trim() : '';

  // Check if this is a tissue name line (not "Standard Deviation", "Minimum", "Maximum", or empty space)
  if (firstCol && firstCol !== 'Standard Deviation' && firstCol !== 'Minimum' &&
      firstCol !== 'Maximum' && !firstCol.match(/^\s+$/)) {
    currentTissue = firstCol;

    // Check if second column is "Average"
    const secondCol = columns[1] ? columns[1].trim() : '';
    if (secondCol === 'Average') {
      // Parse elemental values (columns 2-18 map to elements 0-16)
      const composition = {};
      elements.forEach((element, idx) => {
        const value = parseFloat(columns[idx + 2]);
        composition[element] = (!isNaN(value) && value > 0) ? value : null;
      });

      elementalData[currentTissue] = {
        name: currentTissue,
        composition
      };
    }
  }
}

console.log(`Parsed ${Object.keys(elementalData).length} tissues from elemental database`);

// Load alternative names from thermal database
const thermalLines = fs.readFileSync(thermalDbPath, 'latin1').split('\n');
const alternativeNamesMap = {};

for (let i = 3; i < thermalLines.length; i++) {
  const line = thermalLines[i].trim();
  if (!line) continue;

  const columns = line.split('\t');
  const tissueName = columns[0] ? columns[0].trim() : '';
  if (!tissueName) continue;

  // Column 41 (0-indexed: 40) contains alternative names
  const altNamesColumn = columns[40] ? columns[40].trim() : '';
  const alternativeNames = altNamesColumn
    .split('@')
    .map(name => name.trim())
    .filter(name => name.length > 0);

  alternativeNamesMap[tissueName] = alternativeNames;
}

console.log(`Loaded alternative names for ${Object.keys(alternativeNamesMap).length} tissues`);

// Combine elemental data with alternative names
const tissues = {};

Object.keys(elementalData).forEach(tissueName => {
  const data = elementalData[tissueName];
  const alternativeNames = alternativeNamesMap[tissueName] || [];

  const tissueData = {
    name: tissueName,
    alternativeNames,
    composition: data.composition
  };

  // Store by main name
  tissues[tissueName] = tissueData;

  // Store by alternative names
  alternativeNames.forEach(altName => {
    tissues[altName] = tissueData;
  });
});

console.log(`Total entries (including alternative names): ${Object.keys(tissues).length}`);

// Load MIDA tissue names
const midaLines = fs.readFileSync(midaPath, 'utf-8').split('\n');
const midaTissueNames = [];

for (let i = 1; i < midaLines.length; i++) {
  const line = midaLines[i].trim();
  if (!line) continue;

  const parts = line.split(/\s+/);
  if (parts.length >= 5) {
    const tissueName = parts.slice(4).join(' ');
    midaTissueNames.push(tissueName);
  }
}

console.log(`\nLoading MIDA tissue names...`);
console.log(`Found ${midaTissueNames.length} MIDA tissues`);

// Validate MIDA tissues
console.log('\n=== MIDA Tissue Validation ===\n');

let mappedCount = 0;
let missingCount = 0;
const elementCoverage = {};
elements.forEach(el => elementCoverage[el] = 0);
const missingTissues = [];

midaTissueNames.forEach(tissueName => {
  if (tissues[tissueName]) {
    mappedCount++;
    const composition = tissues[tissueName].composition;

    // Count how many MIDA tissues have data for each element
    elements.forEach(element => {
      if (composition[element] !== null) {
        elementCoverage[element]++;
      }
    });
  } else {
    missingCount++;
    missingTissues.push(tissueName);
  }
});

// Manual fixes
if (tissues['Air']) {
  tissues['Background'] = tissues['Air'];
  console.log('Manual fix: Mapped Background → Air');
}

if (tissues['Eye (Sclera)']) {
  tissues['Eye Retina/Choroid/Sclera'] = tissues['Eye (Sclera)'];
  console.log('Manual fix: Mapped Eye Retina/Choroid/Sclera → Eye (Sclera)');
}

console.log('\n=== Summary ===');
console.log(`Total MIDA tissues: ${midaTissueNames.length}`);
console.log(`Mapped: ${mappedCount} (${(mappedCount/midaTissueNames.length*100).toFixed(1)}%)`);
console.log(`Missing from database: ${missingCount}`);

console.log('\n=== Element Coverage (MIDA tissues with data) ===');
elements.forEach(element => {
  const coverage = elementCoverage[element];
  const percent = (coverage / midaTissueNames.length * 100).toFixed(1);
  console.log(`${element.padEnd(12)}: ${coverage}/${midaTissueNames.length} (${percent}%)`);
});

if (missingTissues.length > 0) {
  console.log('\nMissing MIDA tissues:');
  missingTissues.forEach(name => console.log(`  - ${name}`));
}

// Save to JSON
console.log(`\nSaving to ${outputPath}...`);
fs.writeFileSync(outputPath, JSON.stringify(tissues, null, 2));
console.log('Done!');
