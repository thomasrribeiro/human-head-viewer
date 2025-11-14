/**
 * Acoustic attenuation properties calculation
 * Based on IT'IS Foundation database
 * Formula: α = α0 * f^b
 */

/**
 * Calculate acoustic attenuation coefficient at given frequency
 * Formula: α = α0 * f^b
 * @param {Object} attenuationData - Attenuation parameters {alpha0, b}
 * @param {number} frequency - Frequency in Hz
 * @returns {number} - Attenuation coefficient in Np/m
 */
export function calculateAttenuationConstant(attenuationData, frequency) {
  const { alpha0, b } = attenuationData;

  // Convert frequency to MHz (α0 is in Np/m/MHz)
  const freqMHz = frequency / 1e6;

  // α = α0 * f^b
  const alpha = alpha0 * Math.pow(freqMHz, b);

  return alpha;
}
