import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const renderWindow = vtkFullScreenRenderWindow.newInstance({
  background: [1, 1, 1],
});
const renderer = renderWindow.getRenderer();

// ----------------------------------------------------------------------------
// Anatomically correct color mapping from MIDA tissue IDs
// ----------------------------------------------------------------------------

const tissueColors = {
  'Adipose Tissue.stl': [0.690196, 0.478431, 1],
  'Air Internal - Ethmoidal Sinus.stl': [0, 0, 0],
  'Air Internal - Frontal Sinus.stl': [0, 0, 0],
  'Air Internal - Mastoid.stl': [0, 0, 0.54902],
  'Air Internal - Maxillary Sinus.stl': [0, 0, 0],
  'Air Internal - Nasal_Pharynx.stl': [0, 0, 0],
  'Air Internal - Oral Cavity.stl': [0, 0, 0],
  'Air Internal - Sphenoidal Sinus.stl': [0, 0, 0],
  'Amygdala.stl': [0, 0, 1],
  'Blood Arteries.stl': [1, 0, 0],
  'Blood Veins.stl': [0, 0, 1],
  'Brain Gray Matter.stl': [0.521569, 0.521569, 0.533333],
  'Brain White Matter.stl': [1, 1, 1],
  'Brainstem Medulla.stl': [0.686275, 1, 0.423529],
  'Brainstem Midbrain.stl': [0.807843, 0, 1],
  'Brainstem Pons.stl': [1, 1, 0],
  'Caudate Nucleus.stl': [0, 0.384314, 0.466667],
  'Cerebellum Gray Matter.stl': [1, 0.780392, 0],
  'Cerebellum White Matter.stl': [0.713726, 0.121569, 0.341176],
  'Cerebral Peduncles.stl': [0.360784, 0, 0.862745],
  'Commissura (Anterior).stl': [0.72549, 0.807843, 1],
  'Commissura (Posterior).stl': [0.85098, 0, 0.247059],
  'Cranial Nerve I - Olfactory.stl': [0, 0.984314, 0],
  'Cranial Nerve II - Optic.stl': [0.25098, 0.568627, 0.639216],
  'Cranial Nerve III - Oculomotor.stl': [0, 0, 1],
  'Cranial Nerve IV - Trochlear.stl': [0.65098, 0.196078, 0.458824],
  'Cranial Nerve IX - Glossopharyngeal.stl': [0, 1, 0],
  'Cranial Nerve V - Trigeminal.stl': [0.458824, 0.290196, 0.792157],
  'Cranial Nerve V2 - Maxillary Division.stl': [0.929412, 0, 0.929412],
  'Cranial Nerve V3 - Mandibular Division.stl': [1, 0.890196, 0],
  'Cranial Nerve VI - Abducens.stl': [1, 0, 1],
  'Cranial Nerve VII - Facial.stl': [0.513726, 0.803922, 0.556863],
  'Cranial Nerve VIII - Vestibulocochlear.stl': [0.623529, 1, 1],
  'Cranial Nerve X - Vagus.stl': [0.65098, 0.376471, 0.596078],
  'Cranial Nerve XI - Accessory .stl': [0.082353, 0.458824, 0.207843],
  'Cranial Nerve XII - Hypoglossal .stl': [1, 1, 0],
  'CSF General.stl': [0.411765, 0, 0],
  'CSF Ventricles.stl': [0.368627, 0.588235, 0.54902],
  'Dura.stl': [0, 0.988235, 1],
  'Ear Auditory Canal.stl': [1, 1, 1],
  'Ear Auricular Cartilage (Pinna).stl': [0, 0.913725, 0.843137],
  'Ear Cochlea.stl': [0.905882, 0.45098, 1],
  'Ear Pharyngotympanic Tube.stl': [0.901961, 0.309804, 0.266667],
  'Ear Semicircular Canals.stl': [1, 0.223529, 0.211765],
  'Epidermis_Dermis.stl': [1, 0.72549, 0.564706],
  'Eye Aqueous.stl': [0.494118, 0.741176, 1],
  'Eye Cornea.stl': [0.576471, 0, 0.164706],
  'Eye Lens.stl': [0, 0, 1],
  'Eye Retina_Choroid_Sclera.stl': [1, 1, 1],
  'Eye Vitreous .stl': [0, 0.576471, 0.356863],
  'Globus Pallidus.stl': [0.894118, 0.796078, 1],
  'Hippocampus.stl': [1, 0.423529, 1],
  'Hyoid Bone.stl': [0.760784, 0.533333, 0],
  'Hypophysis or Pituitary Gland .stl': [1, 0.686275, 0],
  'Hypothalamus.stl': [0.890196, 0.356863, 0.505882],
  'Intervertebral Discs.stl': [1, 0.603922, 0.780392],
  'Mammillary Body.stl': [1, 1, 0],
  'Mandible.stl': [0, 0.411765, 0],
  'Mucosa.stl': [0.588235, 0, 0.301961],
  'Muscle - Buccinator.stl': [1, 0.435294, 0.098039],
  'Muscle - Depressor Anguli Oris.stl': [0.533333, 0.603922, 0.913725],
  'Muscle - Depressor Labii.stl': [1, 0.67451, 0],
  'Muscle - Inferior Oblique.stl': [1, 1, 0],
  'Muscle - Inferior Rectus.stl': [0.945098, 0, 0.745098],
  'Muscle - Lateral Pterygoid.stl': [0.815686, 0.352941, 0.423529],
  'Muscle - Lateral Rectus.stl': [0.266667, 0.282353, 0.576471],
  'Muscle - Levator Labii Superioris.stl': [0, 0.407843, 0],
  'Muscle - Levator Scapulae.stl': [0.294118, 0, 0],
  'Muscle - Masseter.stl': [1, 0.717647, 0],
  'Muscle - Medial Pterygoid.stl': [0.843137, 0.619608, 0.239216],
  'Muscle - Medial Rectus.stl': [1, 0.67451, 0.168627],
  'Muscle - Mentalis.stl': [1, 0.309804, 0.309804],
  'Muscle - Nasalis.stl': [0, 0.466667, 0.913725],
  'Muscle - Occipitiofrontalis - Frontal Belly.stl': [1, 0.67451, 0.494118],
  'Muscle - Occipitiofrontalis - Occipital Belly.stl': [0.788235, 0.635294, 1],
  'Muscle - Orbicularis Oculi.stl': [0.211765, 0.776471, 0.533333],
  'Muscle - Orbicularis Oris.stl': [1, 0.54902, 0.647059],
  'Muscle - Platysma.stl': [1, 0.337255, 0],
  'Muscle - Splenius Capitis.stl': [1, 0.45098, 0.254902],
  'Muscle - Sternocleidomastoid .stl': [0.733333, 0.098039, 0.294118],
  'Muscle - Superior Oblique.stl': [0, 1, 1],
  'Muscle - Superior Rectus.stl': [0.619608, 0.717647, 1],
  'Muscle - Temporalis_Temporoparietalis.stl': [1, 0.196078, 0],
  'Muscle - Trapezius.stl': [0.282353, 0.396078, 0.407843],
  'Muscle - Zygomaticus Major .stl': [0, 0.564706, 0.717647],
  'Muscle - Zygomaticus Minor.stl': [1, 0.239216, 0.282353],
  'Muscle (General).stl': [0.45098, 0.776471, 0.12549],
  'Muscles - Procerus.stl': [0.945098, 0.12549, 0.254902],
  'Muscles - Risorius.stl': [0.521569, 0.494118, 0.635294],
  'Nasal Septum (Cartilage).stl': [0.85098, 0.713726, 1],
  'Nucleus Accumbens.stl': [0.890196, 0.905882, 0],
  'Optic Chiasm.stl': [1, 0, 0],
  'Optic Tract.stl': [0, 1, 0],
  'Parotid Gland.stl': [0.505882, 0.423529, 0.521569],
  'Pineal Body.stl': [0.658824, 1, 1],
  'Putamen.stl': [0.823529, 0.54902, 1],
  'Skull Diploe.stl': [0.745098, 0, 0],
  'Skull Inner Table.stl': [0.309804, 0, 0.294118],
  'Skull Outer Table .stl': [0, 0.662745, 0.843137],
  'Skull.stl': [1, 1, 0.588235],
  'Spinal Cord.stl': [0.917647, 0.521569, 0],
  'Subcutaneous Adipose Tissue.stl': [0.521569, 0.239216, 0.352941],
  'Sublingual Gland.stl': [1, 0.54902, 0.45098],
  'Submandibular Gland.stl': [0.858824, 0.929412, 0.619608],
  'Substantia Nigra.stl': [0, 0.847059, 0],
  'Teeth.stl': [1, 0, 1],
  'Tendon - Galea Aponeurotica.stl': [1, 0, 0.396078],
  'Tendon - Temporalis Tendon.stl': [0, 0.282353, 0.043137],
  'Thalamus.stl': [0, 0, 1],
  'Tongue.stl': [1, 0.588235, 0],
  'Vertebra - C1 (atlas).stl': [0, 0.988235, 0.368627],
  'Vertebra - C2 (axis).stl': [0.384314, 0.823529, 1],
  'Vertebra - C3.stl': [1, 0, 0.988235],
  'Vertebra - C4.stl': [0.203922, 0.466667, 0.368627],
  'Vertebra - C5.stl': [0, 0.137255, 0.862745]
};

function getTissueColor(filename) {
  return tissueColors[filename] || [0.5, 0.5, 0.5]; // Default gray if not found
}

// ----------------------------------------------------------------------------
// List of all STL files to load
// ----------------------------------------------------------------------------

const stlFiles = [
  'Adipose Tissue.stl',
  'Air Internal - Ethmoidal Sinus.stl',
  'Air Internal - Frontal Sinus.stl',
  'Air Internal - Mastoid.stl',
  'Air Internal - Maxillary Sinus.stl',
  'Air Internal - Nasal_Pharynx.stl',
  'Air Internal - Oral Cavity.stl',
  'Air Internal - Sphenoidal Sinus.stl',
  'Amygdala.stl',
  'Blood Arteries.stl',
  'Blood Veins.stl',
  'Brain Gray Matter.stl',
  'Brain White Matter.stl',
  'Brainstem Medulla.stl',
  'Brainstem Midbrain.stl',
  'Brainstem Pons.stl',
  'Caudate Nucleus.stl',
  'Cerebellum Gray Matter.stl',
  'Cerebellum White Matter.stl',
  'Cerebral Peduncles.stl',
  'Commissura (Anterior).stl',
  'Commissura (Posterior).stl',
  'Cranial Nerve I - Olfactory.stl',
  'Cranial Nerve II - Optic.stl',
  'Cranial Nerve III - Oculomotor.stl',
  'Cranial Nerve IV - Trochlear.stl',
  'Cranial Nerve IX - Glossopharyngeal.stl',
  'Cranial Nerve V - Trigeminal.stl',
  'Cranial Nerve V2 - Maxillary Division.stl',
  'Cranial Nerve V3 - Mandibular Division.stl',
  'Cranial Nerve VI - Abducens.stl',
  'Cranial Nerve VII - Facial.stl',
  'Cranial Nerve VIII - Vestibulocochlear.stl',
  'Cranial Nerve X - Vagus.stl',
  'Cranial Nerve XI - Accessory .stl',
  'Cranial Nerve XII - Hypoglossal .stl',
  'CSF General.stl',
  'CSF Ventricles.stl',
  'Dura.stl',
  'Ear Auditory Canal.stl',
  'Ear Auricular Cartilage (Pinna).stl',
  'Ear Cochlea.stl',
  'Ear Pharyngotympanic Tube.stl',
  'Ear Semicircular Canals.stl',
  'Epidermis_Dermis.stl',
  'Eye Aqueous.stl',
  'Eye Cornea.stl',
  'Eye Lens.stl',
  'Eye Retina_Choroid_Sclera.stl',
  'Eye Vitreous .stl',
  'Globus Pallidus.stl',
  'Hippocampus.stl',
  'Hyoid Bone.stl',
  'Hypophysis or Pituitary Gland .stl',
  'Hypothalamus.stl',
  'Intervertebral Discs.stl',
  'Mammillary Body.stl',
  'Mandible.stl',
  'Mucosa.stl',
  'Muscle - Buccinator.stl',
  'Muscle - Depressor Anguli Oris.stl',
  'Muscle - Depressor Labii.stl',
  'Muscle - Inferior Oblique.stl',
  'Muscle - Inferior Rectus.stl',
  'Muscle - Lateral Pterygoid.stl',
  'Muscle - Lateral Rectus.stl',
  'Muscle - Levator Labii Superioris.stl',
  'Muscle - Levator Scapulae.stl',
  'Muscle - Masseter.stl',
  'Muscle - Medial Pterygoid.stl',
  'Muscle - Medial Rectus.stl',
  'Muscle - Mentalis.stl',
  'Muscle - Nasalis.stl',
  'Muscle - Occipitiofrontalis - Frontal Belly.stl',
  'Muscle - Occipitiofrontalis - Occipital Belly.stl',
  'Muscle - Orbicularis Oculi.stl',
  'Muscle - Orbicularis Oris.stl',
  'Muscle - Platysma.stl',
  'Muscle - Splenius Capitis.stl',
  'Muscle - Sternocleidomastoid .stl',
  'Muscle - Superior Oblique.stl',
  'Muscle - Superior Rectus.stl',
  'Muscle - Temporalis_Temporoparietalis.stl',
  'Muscle - Trapezius.stl',
  'Muscle - Zygomaticus Major .stl',
  'Muscle - Zygomaticus Minor.stl',
  'Muscle (General).stl',
  'Muscles - Procerus.stl',
  'Muscles - Risorius.stl',
  'Nasal Septum (Cartilage).stl',
  'Nucleus Accumbens.stl',
  'Optic Chiasm.stl',
  'Optic Tract.stl',
  'Parotid Gland.stl',
  'Pineal Body.stl',
  'Putamen.stl',
  'Skull Diploe.stl',
  'Skull Inner Table.stl',
  'Skull Outer Table .stl',
  'Skull.stl',
  'Spinal Cord.stl',
  'Subcutaneous Adipose Tissue.stl',
  'Sublingual Gland.stl',
  'Submandibular Gland.stl',
  'Substantia Nigra.stl',
  'Teeth.stl',
  'Tendon - Galea Aponeurotica.stl',
  'Tendon - Temporalis Tendon.stl',
  'Thalamus.stl',
  'Tongue.stl',
  'Vertebra - C1 (atlas).stl',
  'Vertebra - C2 (axis).stl',
  'Vertebra - C3.stl',
  'Verteбра - C4.stl',
  'Vertebra - C5.stl'
];

// ----------------------------------------------------------------------------
// Load all STL files and render
// ----------------------------------------------------------------------------

const basePath = '/data/MIDA_v1.0/MIDA_v1_surfaces/';
let loadedCount = 0;

// Create clipping plane (transverse/axial - horizontal slices)
const clippingPlane = vtkPlane.newInstance();
clippingPlane.setNormal(0, -1, 0); // Y-axis (transverse plane, pointing down)
clippingPlane.setOrigin(0, 1000, 0); // Start at top

const mappers = [];

stlFiles.forEach((filename, index) => {
  const reader = vtkSTLReader.newInstance();
  const mapper = vtkMapper.newInstance();
  const actor = vtkActor.newInstance();

  mapper.setInputConnection(reader.getOutputPort());
  actor.setMapper(mapper);

  // Add clipping plane to mapper
  mapper.addClippingPlane(clippingPlane);
  mappers.push(mapper);

  reader.setUrl(basePath + filename).then(() => {
    renderer.addActor(actor);

    // Assign anatomically correct color based on tissue type
    const rgb = getTissueColor(filename);

    const property = actor.getProperty();
    property.setColor(rgb[0], rgb[1], rgb[2]);
    property.setAmbient(0.5);
    property.setDiffuse(0.8);
    property.setSpecular(0.1);
    property.setSpecularPower(10);
    property.setOpacity(0.9);

    // Force color mode
    mapper.setScalarVisibility(false);

    loadedCount++;

    // After all files are loaded, reset camera and render
    if (loadedCount === stlFiles.length) {
      renderer.resetCamera();

      // Set default view
      const camera = renderer.getActiveCamera();
      camera.azimuth(210);
      camera.elevation(30);

      renderWindow.getRenderWindow().render();

      // Set up slider control
      const slider = document.getElementById('depth-slider');
      const bounds = renderer.computeVisiblePropBounds();
      const minY = bounds[2];
      const maxY = bounds[3];

      slider.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        // value 100 = top (maxY), value 0 = bottom (minY)
        const yPosition = minY + (value / 100) * (maxY - minY);
        clippingPlane.setOrigin(0, yPosition, 0);
        renderWindow.getRenderWindow().render();
      });
    }
  });
});
