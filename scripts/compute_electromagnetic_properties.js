/**
 * Compute frequency-dependent electromagnetic properties using Cole-Cole dispersion model
 * Based on IT'IS Foundation database and Gabriel et al. (1996)
 */

const fs = require('fs');
const path = require('path');

// Physical constants
const EPSILON_0 = 8.854187817e-12; // F/m - vacuum permittivity

/**
 * Parse the IT'IS database to extract dielectric parameters
 */
function parseDielectricDatabase(filePath) {
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

    // Extract Cole-Cole parameters (columns 28-41)
    const ef = parseFloat(columns[27]) || 0;        // ε∞
    const del1 = parseFloat(columns[28]) || 0;      // Δε1
    const tau1_ps = parseFloat(columns[29]) || 0;   // τ1 (picoseconds)
    const alf1 = parseFloat(columns[30]) || 0;      // α1
    const del2 = parseFloat(columns[31]) || 0;      // Δε2
    const tau2_ns = parseFloat(columns[32]) || 0;   // τ2 (nanoseconds)
    const alf2 = parseFloat(columns[33]) || 0;      // α2
    const sig = parseFloat(columns[34]) || 0;       // σ ionic (S/m)
    const del3 = parseFloat(columns[35]) || 0;      // Δε3
    const tau3_us = parseFloat(columns[36]) || 0;   // τ3 (microseconds)
    const alf3 = parseFloat(columns[37]) || 0;      // α3
    const del4 = parseFloat(columns[38]) || 0;      // Δε4
    const tau4_ms = parseFloat(columns[39]) || 0;   // τ4 (milliseconds)
    const alf4 = parseFloat(columns[40]) || 0;      // α4

    // Column 44: LF Conductivity [S/m] - Average value
    const lfConductivity = parseFloat(columns[43]) || 0;

    // Column 42: Alternative Names
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

    // Convert all tau values to seconds
    const tau1 = tau1_ps * 1e-12;
    const tau2 = tau2_ns * 1e-9;
    const tau3 = tau3_us * 1e-6;
    const tau4 = tau4_ms * 1e-3;

    const tissueData = {
      name: tissueName,
      alternativeNames,
      coleCole: {
        ef,
        terms: [
          { delta: del1, tau: tau1, alpha: alf1 },
          { delta: del2, tau: tau2, alpha: alf2 },
          { delta: del3, tau: tau3, alpha: alf3 },
          { delta: del4, tau: tau4, alpha: alf4 }
        ],
        sigmaIonic: sig
      },
      lfConductivity
    };

    // Store under main name
    tissues[tissueName] = tissueData;

    // Also store under all alternative names for easy lookup
    alternativeNames.forEach(altName => {
      tissues[altName] = tissueData;
    });
  }

  return tissues;
}

/**
 * Calculate complex permittivity using 4-term Cole-Cole model
 * @param {Object} params - Cole-Cole parameters
 * @param {number} frequency - Frequency in Hz
 * @returns {Object} - {real: εr, imag: ε''}
 */
function calculateComplexPermittivity(params, frequency) {
  const omega = 2 * Math.PI * frequency;

  let realPart = params.ef;
  let imagPart = 0;

  // Add contributions from each Cole-Cole term
  for (const term of params.terms) {
    if (term.delta === 0) continue;

    const omegaTau = omega * term.tau;
    const alpha = term.alpha;
    const oneMinusAlpha = 1 - alpha;

    // Calculate (jωτ)^(1-α)
    // (jωτ)^(1-α) = (ωτ)^(1-α) * exp(j * π/2 * (1-α))
    const magnitude = Math.pow(omegaTau, oneMinusAlpha);
    const phase = (Math.PI / 2) * oneMinusAlpha;

    const cosPhase = Math.cos(phase);
    const sinPhase = Math.sin(phase);

    // Denominator: 1 + (jωτ)^(1-α)
    const denomReal = 1 + magnitude * cosPhase;
    const denomImag = magnitude * sinPhase;
    const denomMagSq = denomReal * denomReal + denomImag * denomImag;

    // Δε / (1 + (jωτ)^(1-α))
    // When dividing by complex: (a + jb) / (c + jd) = [(ac + bd) + j(bc - ad)] / (c² + d²)
    // Here numerator is Δε (real, a=Δε, b=0), denominator is (denomReal + j*denomImag)
    // Real part: Δε * denomReal / (c² + d²)
    // Imag part: (0 * denomReal - Δε * denomImag) / (c² + d²) = -Δε * denomImag / (c² + d²)
    // BUT: ε'' is conventionally positive, so we flip the sign
    realPart += term.delta * denomReal / denomMagSq;
    imagPart += term.delta * denomImag / denomMagSq;  // Positive for ε'' convention
  }

  // Add ionic conductivity contribution to imaginary part
  // ε'' = ε''_dipolar + σ/(ωε0)
  imagPart += params.sigmaIonic / (omega * EPSILON_0);

  return { real: realPart, imag: imagPart };
}

/**
 * Calculate conductivity and permittivity at a given frequency
 * @param {Object} tissueData - Tissue dielectric data
 * @param {number} frequency - Frequency in Hz
 * @returns {Object} - {permittivity, conductivity}
 */
function calculateProperties(tissueData, frequency) {
  const LF_THRESHOLD = 1e6; // 1 MHz

  // Calculate complex permittivity using Cole-Cole model
  const epsilon = calculateComplexPermittivity(tissueData.coleCole, frequency);
  const permittivity = epsilon.real;

  // Calculate total conductivity: σ = ω * ε0 * ε''
  const omega = 2 * Math.PI * frequency;
  const conductivityFromColeCole = omega * EPSILON_0 * epsilon.imag;

  // Use LF conductivity for frequencies below 1 MHz
  let conductivity;
  if (frequency < LF_THRESHOLD && tissueData.lfConductivity > 0) {
    conductivity = tissueData.lfConductivity;
  } else {
    conductivity = conductivityFromColeCole;
  }

  return {
    permittivity,
    conductivity,
    source: frequency < LF_THRESHOLD && tissueData.lfConductivity > 0 ? 'LF' : 'Cole-Cole'
  };
}

/**
 * Compute properties for all tissues at a given frequency
 */
function computeAllTissuesAtFrequency(tissues, frequency) {
  const results = {};

  for (const [tissueName, tissueData] of Object.entries(tissues)) {
    results[tissueName] = calculateProperties(tissueData, frequency);
  }

  return results;
}

/**
 * Validate against reference data at 100 MHz
 */
function validateAt100MHz(tissues, referenceFile) {
  const frequency = 100e6; // 100 MHz
  const computed = computeAllTissuesAtFrequency(tissues, frequency);

  // Read reference data
  const refContent = fs.readFileSync(referenceFile, 'utf-8');
  const refLines = refContent.split('\n');

  console.log('\nValidation at 100 MHz:');
  console.log('='.repeat(100));
  console.log('Tissue'.padEnd(30), 'Ref Perm'.padEnd(15), 'Calc Perm'.padEnd(15), 'Ref Cond'.padEnd(15), 'Calc Cond'.padEnd(15), 'Status');
  console.log('='.repeat(100));

  let matchCount = 0;
  let totalCount = 0;

  for (let i = 1; i < refLines.length; i++) {
    const line = refLines[i].trim();
    if (!line) continue;

    const parts = line.split('\t');
    const tissueName = parts[0]?.trim();
    const refPerm = parseFloat(parts[2]);
    const refCond = parseFloat(parts[3]);

    if (!tissueName || !computed[tissueName]) continue;

    const calc = computed[tissueName];
    const permError = Math.abs((calc.permittivity - refPerm) / refPerm * 100);
    const condError = Math.abs((calc.conductivity - refCond) / refCond * 100);

    const status = (permError < 1 && condError < 1) ? '✓ PASS' : '✗ FAIL';
    if (permError < 1 && condError < 1) matchCount++;
    totalCount++;

    if (i < 20 || status === '✗ FAIL') { // Show first 20 or failures
      console.log(
        tissueName.padEnd(30),
        refPerm.toFixed(4).padEnd(15),
        calc.permittivity.toFixed(4).padEnd(15),
        refCond.toFixed(4).padEnd(15),
        calc.conductivity.toFixed(4).padEnd(15),
        status
      );
    }
  }

  console.log('='.repeat(100));
  console.log(`Validation: ${matchCount}/${totalCount} tissues matched (< 1% error)`);
  console.log('='.repeat(100));
}

// Main execution
if (require.main === module) {
  const dbPath = path.join(__dirname, '../data/Database-V5-0/Thermal_dielectric_acoustic_MR properties_database_V5.0(ASCII).txt');
  const refPath = path.join(__dirname, '../data/Database-V5-0/dielectric_properties_100MHz.txt');

  console.log('Parsing dielectric database...');
  const tissues = parseDielectricDatabase(dbPath);
  console.log(`Loaded ${Object.keys(tissues).length} tissues`);

  // Debug one tissue
  console.log('\nDebug: Brain (Grey Matter) at 100 MHz');
  const brainGrey = tissues['Brain (Grey Matter)'];
  console.log('Cole-Cole parameters:', JSON.stringify(brainGrey.coleCole, null, 2));
  const result = calculateProperties(brainGrey, 100e6);
  console.log('Result:', result);

  const epsilon = calculateComplexPermittivity(brainGrey.coleCole, 100e6);
  console.log('Complex permittivity:', epsilon);
  console.log('');

  // Validate at 100 MHz
  validateAt100MHz(tissues, refPath);

  // Export for use in viewer
  const outputPath = path.join(__dirname, '../data/dielectric_properties.json');
  fs.writeFileSync(outputPath, JSON.stringify(tissues, null, 2));
  console.log(`\nDielectric properties database saved to: ${outputPath}`);
}

// Export functions for use in viewer
module.exports = {
  parseDielectricDatabase,
  calculateProperties,
  computeAllTissuesAtFrequency
};
