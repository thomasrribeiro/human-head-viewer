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
  { name: 'compute_thermal_properties.js', description: 'Thermal & Mechanical Properties' },
  { name: 'compute_electromagnetic_properties.js', description: 'Dielectric Properties' },
  { name: 'compute_acoustic_properties.js', description: 'Acoustic Attenuation' },
  { name: 'compute_nonlinearity_parameter.js', description: 'Non-linearity Parameter' },
  { name: 'compute_relaxation_times.js', description: 'MR Relaxation Times' },
  { name: 'compute_water_content.js', description: 'Water Content' },
  { name: 'compute_elemental_composition.js', description: 'Elemental Composition' }
];

// Clear existing tissue_properties.json to start fresh
const tissuePropertiesPath = path.join(__dirname, '../data/tissue_properties.json');
if (fs.existsSync(tissuePropertiesPath)) {
  fs.unlinkSync(tissuePropertiesPath);
}

// Run each script

scripts.forEach(({ name, description }, index) => {
  const scriptPath = path.join(__dirname, name);

  if (!fs.existsSync(scriptPath)) {
    return;
  }


  try {
    // Run the script and capture output
    const output = execSync(`node ${scriptPath}`, {
      cwd: __dirname,
      encoding: 'utf-8'
    });

    // Show only the last few lines of output (summary)
    const lines = output.trim().split('\n');
    const summaryLines = lines.slice(-3);
    summaryLines.forEach(line => {
      if (line.includes('✓') || line.includes('complete')) {
      }
    });

  } catch (error) {
  }
});

// Show final statistics
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

} else {
}