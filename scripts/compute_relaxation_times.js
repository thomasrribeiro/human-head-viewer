const fs = require('fs');
const path = require('path');

console.log('Parsing Relaxation Time database...');

const databasePath = '/Users/thomasribeiro/Documents/tissue_database/Database-V5-0/Thermal_dielectric_acoustic_MR properties_database_V5.0(ASCII).txt';
const midaPath = '/Users/thomasribeiro/code/human-head-viewer/data/MIDA_v1.0/MIDA_v1_voxels/MIDA_v1.txt';
const outputPath = '/Users/thomasribeiro/code/human-head-viewer/data/relaxation_times.json';

// Read database file
const lines = fs.readFileSync(databasePath, 'latin1').split('\n');

// Find header line (line 2) to identify column positions
const headerLine = lines[1]; // Line 2 (0-indexed line 1)
const headers = headerLine.split('\t');

// Find the column indices for relaxation times
let t1_15T_idx = -1, t2_15T_idx = -1, t1_30T_idx = -1, t2_30T_idx = -1;

headers.forEach((header, idx) => {
  const trimmed = header.trim();
  if (trimmed.includes('1.5T') && trimmed.includes('T1')) {
    t1_15T_idx = idx;
    console.log(`Found 1.5T T1 at column ${idx}: "${trimmed}"`);
  }
  if (trimmed.includes('1.5T') && trimmed.includes('T2')) {
    t2_15T_idx = idx;
    console.log(`Found 1.5T T2 at column ${idx}: "${trimmed}"`);
  }
  if (trimmed.includes('3.0T') && trimmed.includes('T1')) {
    t1_30T_idx = idx;
    console.log(`Found 3.0T T1 at column ${idx}: "${trimmed}"`);
  }
  if (trimmed.includes('3.0T') && trimmed.includes('T2')) {
    t2_30T_idx = idx;
    console.log(`Found 3.0T T2 at column ${idx}: "${trimmed}"`);
  }
});

console.log(`\nColumn indices: 1.5T T1=${t1_15T_idx}, 1.5T T2=${t2_15T_idx}, 3.0T T1=${t1_30T_idx}, 3.0T T2=${t2_30T_idx}\n`);

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

  // Get relaxation times (average values)
  const t1_15T = parseFloat(columns[t1_15T_idx]);
  const t2_15T = parseFloat(columns[t2_15T_idx]);
  const t1_30T = parseFloat(columns[t1_30T_idx]);
  const t2_30T = parseFloat(columns[t2_30T_idx]);

  // Check if any values are valid
  const hasT1_15T = !isNaN(t1_15T) && t1_15T > 0;
  const hasT2_15T = !isNaN(t2_15T) && t2_15T > 0;
  const hasT1_30T = !isNaN(t1_30T) && t1_30T > 0;
  const hasT2_30T = !isNaN(t2_30T) && t2_30T > 0;

  // Find alternative names column (column 41, 0-indexed: 40)
  const altNamesColumn = columns[40] ? columns[40].trim() : '';
  const alternativeNames = altNamesColumn
    .split('@')
    .map(name => name.trim())
    .filter(name => name.length > 0);

  const tissueData = {
    name: tissueName,
    alternativeNames,
    t1_15T: hasT1_15T ? t1_15T : null,
    t2_15T: hasT2_15T ? t2_15T : null,
    t1_30T: hasT1_30T ? t1_30T : null,
    t2_30T: hasT2_30T ? t2_30T : null
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
let withData_15T_T1 = 0;
let withData_15T_T2 = 0;
let withData_30T_T1 = 0;
let withData_30T_T2 = 0;
const missingTissues = [];
const tissuesWithoutData = [];

midaTissueNames.forEach(tissueName => {
  if (tissues[tissueName]) {
    mappedCount++;
    const data = tissues[tissueName];
    if (data.t1_15T !== null) withData_15T_T1++;
    if (data.t2_15T !== null) withData_15T_T2++;
    if (data.t1_30T !== null) withData_30T_T1++;
    if (data.t2_30T !== null) withData_30T_T2++;

    if (data.t1_15T === null && data.t2_15T === null &&
        data.t1_30T === null && data.t2_30T === null) {
      tissuesWithoutData.push(tissueName);
    }
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
console.log(`With 1.5T T1 data: ${withData_15T_T1} (${(withData_15T_T1/midaTissueNames.length*100).toFixed(1)}%)`);
console.log(`With 1.5T T2 data: ${withData_15T_T2} (${(withData_15T_T2/midaTissueNames.length*100).toFixed(1)}%)`);
console.log(`With 3.0T T1 data: ${withData_30T_T1} (${(withData_30T_T1/midaTissueNames.length*100).toFixed(1)}%)`);
console.log(`With 3.0T T2 data: ${withData_30T_T2} (${(withData_30T_T2/midaTissueNames.length*100).toFixed(1)}%)`);
console.log(`Without any data (will be transparent): ${tissuesWithoutData.length} (${(tissuesWithoutData.length/midaTissueNames.length*100).toFixed(1)}%)`);
console.log(`Missing from database: ${missingCount}`);

if (tissuesWithoutData.length > 0) {
  console.log('\nTissues without any relaxation time data (will be transparent):');
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
