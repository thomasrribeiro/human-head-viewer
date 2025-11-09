const fs = require('fs');
const path = require('path');

console.log('Parsing Water Content database...');

const databasePath = '/Users/thomasribeiro/Documents/tissue_database/Database-V5-0/Thermal_dielectric_acoustic_MR properties_database_V5.0(ASCII).txt';
const midaPath = '/Users/thomasribeiro/code/human-head-viewer/data/MIDA_v1.0/MIDA_v1_voxels/MIDA_v1.txt';
const outputPath = '/Users/thomasribeiro/code/human-head-viewer/data/water_content.json';

// Read database file
const lines = fs.readFileSync(databasePath, 'latin1').split('\n');

// Column 97 (0-indexed): Water Content [%] - average value
const waterContentColIdx = 97;

// Parse tissue data
const tissues = {};
let tissueCount = 0;
let alternativeNamesCount = 0;

// Start from line 4 (0-indexed line 3) - skip header lines
for (let i = 3; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const columns = line.split('\t');

  // Column 1 (0-indexed: 0) is the tissue name
  const tissueName = columns[0] ? columns[0].trim() : '';
  if (!tissueName) continue;

  // Get water content average value
  const waterContent = parseFloat(columns[waterContentColIdx]);
  const hasValidWaterContent = !isNaN(waterContent) && waterContent > 0;

  // Find alternative names column (column 41, 0-indexed: 40)
  const altNamesColumn = columns[40] ? columns[40].trim() : '';
  const alternativeNames = altNamesColumn
    .split('@')
    .map(name => name.trim())
    .filter(name => name.length > 0);

  const tissueData = {
    name: tissueName,
    alternativeNames,
    waterContent: hasValidWaterContent ? waterContent : null
  };

  // Store by main name
  tissues[tissueName] = tissueData;
  tissueCount++;

  // Also store by alternative names
  alternativeNames.forEach(altName => {
    tissues[altName] = tissueData;
    alternativeNamesCount++;
  });
}

console.log(`Parsed ${tissueCount} tissue entries (including alternative names)`);
console.log(`Unique tissues: ${tissueCount}`);

// Load MIDA tissue names to validate
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
let withData = 0;
const missingTissues = [];
const tissuesWithoutData = [];

midaTissueNames.forEach(tissueName => {
  if (tissues[tissueName]) {
    mappedCount++;
    const data = tissues[tissueName];
    if (data.waterContent !== null) {
      withData++;
    } else {
      tissuesWithoutData.push(tissueName);
    }
  } else {
    missingCount++;
    missingTissues.push(tissueName);
  }
});

// Manual fixes for MIDA tissues
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
console.log(`With water content data: ${withData} (${(withData/midaTissueNames.length*100).toFixed(1)}%)`);
console.log(`Without water content data (will be transparent): ${tissuesWithoutData.length} (${(tissuesWithoutData.length/midaTissueNames.length*100).toFixed(1)}%)`);
console.log(`Missing from database: ${missingCount}`);

if (tissuesWithoutData.length > 0) {
  console.log('\nTissues without water content data (will be transparent):');
  tissuesWithoutData.forEach(name => console.log(`  - ${name}`));
}

if (missingTissues.length > 0) {
  console.log('\nMissing MIDA tissues:');
  missingTissues.forEach(name => console.log(`  - ${name}`));
}

// Save to JSON
console.log(`\nSaving to ${outputPath}...`);
fs.writeFileSync(outputPath, JSON.stringify(tissues, null, 2));
console.log('Done!');
