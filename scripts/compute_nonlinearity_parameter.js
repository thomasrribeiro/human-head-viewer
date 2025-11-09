/**
 * Extract Non-linearity Parameter (B/A) from IT'IS database
 * Column 71 contains the average B/A value
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse the IT'IS database to extract B/A parameters
 */
function parseNonlinearityDatabase(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const tissues = {};

  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const columns = line.split('\t');

    const tissueName = columns[1]?.trim();
    if (!tissueName) continue;

    // Column 71: B/A average (0-indexed: column 70)
    const baValue = parseFloat(columns[70]);
    const hasValidBA = !isNaN(baValue) && baValue > 0;

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
      nonlinearityParameter: hasValidBA ? baValue : null
    };

    // Store under main name
    tissues[tissueName] = tissueData;

    // Also store under all alternative names
    alternativeNames.forEach(altName => {
      tissues[altName] = tissueData;
    });
  }

  // Manual fix for Background -> Air
  if (tissues['Air']) {
    tissues['Background'] = tissues['Air'];
  }

  // Manual fix for Eye Retina/Choroid/Sclera
  if (tissues['Eye (Sclera)']) {
    tissues['Eye Retina/Choroid/Sclera'] = tissues['Eye (Sclera)'];
  }

  return tissues;
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
 * Validate MIDA tissue mapping and data availability
 */
function validate(tissues, midaTissueNames) {
  let totalTissues = 0;
  let mapped = 0;
  let withData = 0;
  let withoutData = 0;
  let missing = 0;

  console.log('\n=== MIDA Tissue Validation ===\n');

  const tissuesWithoutData = [];
  const missingTissues = [];

  midaTissueNames.forEach(tissueName => {
    totalTissues++;

    if (!tissues[tissueName]) {
      console.log(`❌ MISSING: ${tissueName}`);
      missing++;
      missingTissues.push(tissueName);
      return;
    }

    mapped++;

    if (tissues[tissueName].nonlinearityParameter !== null) {
      withData++;
    } else {
      withoutData++;
      tissuesWithoutData.push(tissueName);
    }
  });

  console.log('\n=== Summary ===');
  console.log(`Total MIDA tissues: ${totalTissues}`);
  console.log(`Mapped: ${mapped} (${((mapped/totalTissues)*100).toFixed(1)}%)`);
  console.log(`With B/A data: ${withData} (${((withData/totalTissues)*100).toFixed(1)}%)`);
  console.log(`Without B/A data (will be transparent): ${withoutData} (${((withoutData/totalTissues)*100).toFixed(1)}%)`);
  console.log(`Missing from database: ${missing}`);

  if (withoutData > 0) {
    console.log('\nTissues without B/A data (will be transparent):');
    tissuesWithoutData.forEach(name => console.log(`  - ${name}`));
  }

  if (missing > 0) {
    console.log('\nMissing tissues:');
    missingTissues.forEach(name => console.log(`  - ${name}`));
  }
}

// Main execution
const databasePath = path.join(__dirname, '../data/Database-V5-0/Thermal_dielectric_acoustic_MR properties_database_V5.0(ASCII).txt');
const midaPath = path.join(__dirname, '../data/MIDA_v1.0/MIDA_v1_voxels/MIDA_v1.txt');
const outputPath = path.join(__dirname, '../data/nonlinearity_parameter.json');

console.log('Parsing Non-linearity Parameter (B/A) database...');
const tissues = parseNonlinearityDatabase(databasePath);

console.log(`Parsed ${Object.keys(tissues).length} tissue entries (including alternative names)`);

// Count unique tissues
const uniqueTissues = new Set();
Object.values(tissues).forEach(t => uniqueTissues.add(t.name));
console.log(`Unique tissues: ${uniqueTissues.size}`);

// Load MIDA tissue names
console.log('\nLoading MIDA tissue names...');
const midaTissueNames = loadMIDATissueNames(midaPath);
console.log(`Found ${midaTissueNames.length} MIDA tissues`);

// Validate
validate(tissues, midaTissueNames);

// Save to JSON
console.log(`\nSaving to ${outputPath}...`);
fs.writeFileSync(outputPath, JSON.stringify(tissues, null, 2));
console.log('Done!');
