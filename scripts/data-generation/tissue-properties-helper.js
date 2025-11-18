/**
 * Helper functions for updating the unified tissue_properties.json file
 */

const fs = require('fs');
const path = require('path');

const TISSUE_PROPERTIES_PATH = path.join(__dirname, '../../data/tissue_properties.json');

/**
 * Load existing tissue properties or create empty structure
 */
function loadTissueProperties() {
  if (fs.existsSync(TISSUE_PROPERTIES_PATH)) {
    return JSON.parse(fs.readFileSync(TISSUE_PROPERTIES_PATH, 'utf-8'));
  }
  return {};
}

/**
 * Get or create a tissue entry
 */
function getOrCreateTissue(tissues, tissueName, tissueData) {
  if (!tissues[tissueName]) {
    tissues[tissueName] = {
      name: tissueData.name || tissueName,
      alternativeNames: tissueData.alternativeNames || [],
      properties: {
        dielectric: null,
        thermal: null,
        acoustic: null,
        relaxation: null,
        waterContent: null,
        elemental: null
      }
    };
  } else {
    // Update name and alternative names if provided
    if (tissueData.name) {
      tissues[tissueName].name = tissueData.name;
    }
    if (tissueData.alternativeNames && tissueData.alternativeNames.length > 0) {
      // Merge alternative names, avoiding duplicates
      const existingNames = new Set(tissues[tissueName].alternativeNames || []);
      tissueData.alternativeNames.forEach(name => existingNames.add(name));
      tissues[tissueName].alternativeNames = Array.from(existingNames);
    }
  }

  // Ensure properties structure exists
  if (!tissues[tissueName].properties) {
    tissues[tissueName].properties = {
      dielectric: null,
      thermal: null,
      acoustic: null,
      relaxation: null,
      waterContent: null,
      elemental: null
    };
  }

  return tissues[tissueName];
}

/**
 * Save tissue properties to file
 */
function saveTissueProperties(tissues) {
  fs.writeFileSync(TISSUE_PROPERTIES_PATH, JSON.stringify(tissues, null, 2), 'utf-8');
  const fileSize = fs.statSync(TISSUE_PROPERTIES_PATH).size;
}

module.exports = {
  loadTissueProperties,
  getOrCreateTissue,
  saveTissueProperties,
  TISSUE_PROPERTIES_PATH
};