/**
 * Cole-Cole dispersion model for calculating frequency-dependent
 * electromagnetic properties (permittivity and conductivity)
 */

const EPSILON_0 = 8.854187817e-12; // F/m - vacuum permittivity
const LF_THRESHOLD = 1e6; // 1 MHz

/**
 * Calculate complex permittivity using 4-term Cole-Cole model
 * @param {Object} params - Cole-Cole parameters {ef, terms: [{delta, tau, alpha}], sigmaIonic}
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
    const magnitude = Math.pow(omegaTau, oneMinusAlpha);
    const phase = (Math.PI / 2) * oneMinusAlpha;

    const cosPhase = Math.cos(phase);
    const sinPhase = Math.sin(phase);

    // Denominator: 1 + (jωτ)^(1-α)
    const denomReal = 1 + magnitude * cosPhase;
    const denomImag = magnitude * sinPhase;
    const denomMagSq = denomReal * denomReal + denomImag * denomImag;

    // Δε / (1 + (jωτ)^(1-α))
    realPart += term.delta * denomReal / denomMagSq;
    imagPart += term.delta * denomImag / denomMagSq;
  }

  // Add ionic conductivity contribution to imaginary part
  imagPart += params.sigmaIonic / (omega * EPSILON_0);

  return { real: realPart, imag: imagPart };
}

/**
 * Calculate conductivity and permittivity at a given frequency
 * @param {Object} tissueData - Tissue dielectric data with coleCole and lfConductivity
 * @param {number} frequency - Frequency in Hz
 * @returns {Object} - {permittivity, conductivity, source}
 */
export function calculateElectromagneticProperties(tissueData, frequency) {
  // Calculate complex permittivity using Cole-Cole model
  const epsilon = calculateComplexPermittivity(tissueData.coleCole, frequency);
  const permittivity = epsilon.real;

  // Calculate total conductivity: σ = ω * ε0 * ε''
  const omega = 2 * Math.PI * frequency;
  const conductivityFromColeCole = omega * EPSILON_0 * epsilon.imag;

  // Use LF conductivity for frequencies below 1 MHz
  let conductivity;
  let source;

  if (frequency < LF_THRESHOLD && tissueData.lfConductivity > 0) {
    conductivity = tissueData.lfConductivity;
    source = 'LF';
  } else {
    conductivity = conductivityFromColeCole;
    source = 'Cole-Cole';
  }

  return {
    permittivity,
    conductivity,
    source
  };
}

/**
 * Parse frequency input (supports scientific notation like "100e6" or "100MHz")
 * @param {string} input - Frequency input string
 * @returns {number|null} - Frequency in Hz or null if invalid
 */
export function parseFrequencyInput(input) {
  // Remove spaces
  input = input.trim().toLowerCase();

  // Handle units
  let multiplier = 1;
  if (input.endsWith('ghz')) {
    multiplier = 1e9;
    input = input.slice(0, -3);
  } else if (input.endsWith('mhz')) {
    multiplier = 1e6;
    input = input.slice(0, -3);
  } else if (input.endsWith('khz')) {
    multiplier = 1e3;
    input = input.slice(0, -3);
  } else if (input.endsWith('hz')) {
    multiplier = 1;
    input = input.slice(0, -2);
  }

  // Parse number (including scientific notation)
  const value = parseFloat(input);

  if (isNaN(value) || value <= 0) {
    return null;
  }

  const frequency = value * multiplier;

  // Validate range: 10 Hz to 100 GHz
  if (frequency < 10 || frequency > 100e9) {
    return null;
  }

  return frequency;
}

/**
 * Format frequency for display
 * @param {number} frequency - Frequency in Hz
 * @returns {string} - Formatted frequency string
 */
export function formatFrequency(frequency) {
  if (frequency >= 1e9) {
    return `${(frequency / 1e9).toFixed(2)} GHz`;
  } else if (frequency >= 1e6) {
    return `${(frequency / 1e6).toFixed(2)} MHz`;
  } else if (frequency >= 1e3) {
    return `${(frequency / 1e3).toFixed(2)} kHz`;
  } else {
    return `${frequency.toFixed(2)} Hz`;
  }
}
