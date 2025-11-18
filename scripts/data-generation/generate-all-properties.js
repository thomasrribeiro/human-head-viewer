#!/usr/bin/env node

/**
 * Master script to generate the unified tissue_properties.json file
 * Runs all individual compute scripts in sequence
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');


// Define scripts to run in order
const scripts = [
  { name: 'compute-thermal-properties.js', description: 'Thermal & Mechanical Properties' },
  { name: 'compute-electromagnetic-properties.js', description: 'Dielectric Properties' },
  { name: 'compute-acoustic-properties.js', description: 'Acoustic Attenuation' },
  { name: 'compute-nonlinearity-parameter.js', description: 'Non-linearity Parameter' },
  { name: 'compute-relaxation-times.js', description: 'MR Relaxation Times' },
  { name: 'compute-water-content.js', description: 'Water Content' },
  { name: 'compute-elemental-composition.js', description: 'Elemental Composition' }
];

// Clear existing tissue_properties.json to start fresh
const tissuePropertiesPath = path.join(__dirname, '../../data/tissue_properties.json');
if (fs.existsSync(tissuePropertiesPath)) {
  fs.unlinkSync(tissuePropertiesPath);
}

// Run each script
console.log('Generating tissue properties from IT\'IS database...\n');

scripts.forEach(({ name, description }, index) => {
  const scriptPath = path.join(__dirname, name);

  if (!fs.existsSync(scriptPath)) {
    console.log(`⚠️  Skipping ${name} (file not found)`);
    return;
  }

  console.log(`[${index + 1}/${scripts.length}] ${description}...`);

  try {
    // Run the script and capture output
    const output = execSync(`node ${scriptPath}`, {
      cwd: __dirname,
      encoding: 'utf-8'
    });

    console.log(`✓ ${description} complete`);

  } catch (error) {
    console.error(`✗ Error in ${name}:`, error.message);
  }
});

// Show final statistics
console.log('\n=== Generation Complete ===');
if (fs.existsSync(tissuePropertiesPath)) {
  const tissueProperties = JSON.parse(fs.readFileSync(tissuePropertiesPath, 'utf-8'));
  const fileSize = fs.statSync(tissuePropertiesPath).size;

  // Count unique tissues
  const uniqueTissues = new Set();
  Object.values(tissueProperties).forEach(t => uniqueTissues.add(t.name));

  // Count properties completeness
  let completeCount = 0;
  let partialCount = 0;

  Object.values(tissueProperties).forEach(tissue => {
    const props = tissue.properties;
    let hasAll = true;

    if (!props.dielectric?.coleCole) hasAll = false;
    if (!props.thermal?.density) hasAll = false;
    if (!props.acoustic?.attenuation) hasAll = false;
    if (!props.relaxation?.t1_15T) hasAll = false;
    if (props.waterContent === null) hasAll = false;
    if (!props.elemental?.hydrogen) hasAll = false;

    if (hasAll) {
      completeCount++;
    } else {
      partialCount++;
    }
  });

  console.log(`Total tissues: ${Object.keys(tissueProperties).length}`);
  console.log(`Unique tissues: ${uniqueTissues.size}`);
  console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\nOutput: ${tissuePropertiesPath}`);

} else {
  console.error('✗ Failed to generate tissue_properties.json');
}