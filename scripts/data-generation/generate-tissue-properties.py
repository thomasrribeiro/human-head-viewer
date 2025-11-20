"""
Generate tissue_properties.json from IT'IS Foundation databases
Reads from Excel files as source of truth
"""
import xlrd
import json
from pathlib import Path

# Get script directory and project root
script_dir = Path(__file__).parent
project_root = script_dir.parent.parent

# Define paths relative to project root
data_dir = project_root / 'data'
excel_path = data_dir / 'Database-V5-0' / 'Thermal_dielectric_acoustic_MR properties_database_V5.0(Excel).xls'
elemental_path = data_dir / 'Database-V5-0' / 'ElementalComposition_database V5.0(Excel).xls'
output_path = data_dir / 'tissue_properties.json'

# Load main Excel database
print("Loading main database...")
print(f"Reading from: {excel_path}")
wb = xlrd.open_workbook(str(excel_path))
ws = wb.sheet_by_index(0)

# Load elemental composition database
print(f"Loading elemental composition database...")
print(f"Reading from: {elemental_path}")
wb_elemental = xlrd.open_workbook(str(elemental_path))
ws_elemental = wb_elemental.sheet_by_index(0)

# Build elemental composition map
print("Building elemental composition map...")
elemental_map = {}
ELEM_COLS = {
    'tissue_name': 1,
    'hydrogen': 3,
    'carbon': 4,
    'nitrogen': 5,
    'oxygen': 6,
    'sodium': 7,
    'magnesium': 8,
    'silicon': 9,
    'phosphorus': 10,
    'sulfur': 11,
    'chlorine': 12,
    'argon': 13,
    'potassium': 14,
    'calcium': 15,
    'scandium': 16,
    'iron': 17,
    'zinc': 18,
    'iodine': 19
}

for row_idx in range(3, ws_elemental.nrows):  # Start from row 4
    tissue_name = ws_elemental.cell_value(row_idx, ELEM_COLS['tissue_name'])
    if not tissue_name or not str(tissue_name).strip():
        continue

    tissue_name = str(tissue_name).strip()

    def get_elem_val(col_key):
        val = ws_elemental.cell_value(row_idx, ELEM_COLS[col_key])
        return val if val not in ('', None) else None

    elemental_data = {
        'hydrogen': get_elem_val('hydrogen'),
        'carbon': get_elem_val('carbon'),
        'nitrogen': get_elem_val('nitrogen'),
        'oxygen': get_elem_val('oxygen'),
        'sodium': get_elem_val('sodium'),
        'magnesium': get_elem_val('magnesium'),
        'silicon': get_elem_val('silicon'),
        'phosphorus': get_elem_val('phosphorus'),
        'sulfur': get_elem_val('sulfur'),
        'chlorine': get_elem_val('chlorine'),
        'argon': get_elem_val('argon'),
        'potassium': get_elem_val('potassium'),
        'calcium': get_elem_val('calcium'),
        'scandium': get_elem_val('scandium'),
        'iron': get_elem_val('iron'),
        'zinc': get_elem_val('zinc'),
        'iodine': get_elem_val('iodine')
    }

    elemental_map[tissue_name] = elemental_data

print(f"Loaded elemental data for {len(elemental_map)} tissues")

# Column mapping for main database (0-indexed)
COLS = {
    'tissue_name': 1,  # Column B
    'density_av': 2,   # Column C
    'heat_capacity_av': 7,  # Column H
    'thermal_conductivity_av': 12,  # Column M
    'heat_transfer_rate_av': 17,  # Column R
    'heat_generation_rate_av': 22,  # Column W
    # Cole-Cole parameters
    'cole_ef': 27,     # AB
    'cole_delta1': 28, # AC
    'cole_tau1': 29,   # AD (picoseconds)
    'cole_alpha1': 30, # AE
    'cole_delta2': 31, # AF
    'cole_tau2': 32,   # AG (nanoseconds)
    'cole_alpha2': 33, # AH
    'cole_sig': 34,    # AI
    'cole_delta3': 35, # AJ
    'cole_tau3': 36,   # AK (microseconds)
    'cole_alpha3': 37, # AL
    'cole_delta4': 38, # AM
    'cole_tau4': 39,   # AN (milliseconds)
    'cole_alpha4': 40, # AO
    'alternative_names': 41,  # AP
    'lf_conductivity_av': 43,  # AR
    # Acoustic properties
    'sound_speed_av': 65,  # BN
    'nonlinearity_av': 70,  # BS
    'attenuation_alpha0': 75,  # BX
    'attenuation_b': 76,  # BY
    # MR Relaxation times
    't1_15T': 77,  # BZ
    't2_15T': 82,  # CE
    't1_3T': 87,   # CJ
    't2_3T': 92,   # CO
    # Water content
    'water_content': 97,  # CT
}

print(f"\nProcessing {ws.nrows - 3} tissues from main database...")

tissue_properties = {}

for row_idx in range(3, ws.nrows):  # Start from row 4
    tissue_name = ws.cell_value(row_idx, COLS['tissue_name'])
    if not tissue_name or not str(tissue_name).strip():
        continue

    tissue_name = str(tissue_name).strip()

    # Get alternative names
    alt_names_raw = ws.cell_value(row_idx, COLS['alternative_names'])
    alt_names = []
    if alt_names_raw:
        alt_names_raw = str(alt_names_raw).strip('"').strip()
        alt_names = [n.strip() for n in alt_names_raw.split('@') if n.strip()]

    # Helper to get value or None
    def get_val(col_key):
        val = ws.cell_value(row_idx, COLS[col_key])
        return val if val not in ('', None) else None

    # Build Cole-Cole parameters
    cole_cole = None
    ef = get_val('cole_ef')
    if ef is not None:
        terms = []
        # Term 1
        if get_val('cole_delta1') is not None:
            terms.append({
                'delta': get_val('cole_delta1'),
                'tau': get_val('cole_tau1') * 1e-12 if get_val('cole_tau1') else 0,
                'alpha': get_val('cole_alpha1') if get_val('cole_alpha1') is not None else 0
            })
        # Term 2
        if get_val('cole_delta2') is not None:
            terms.append({
                'delta': get_val('cole_delta2'),
                'tau': get_val('cole_tau2') * 1e-9 if get_val('cole_tau2') else 0,
                'alpha': get_val('cole_alpha2') if get_val('cole_alpha2') is not None else 0
            })
        # Term 3
        if get_val('cole_delta3') is not None:
            terms.append({
                'delta': get_val('cole_delta3'),
                'tau': get_val('cole_tau3') * 1e-6 if get_val('cole_tau3') else 0,
                'alpha': get_val('cole_alpha3') if get_val('cole_alpha3') is not None else 0
            })
        # Term 4
        if get_val('cole_delta4') is not None:
            terms.append({
                'delta': get_val('cole_delta4'),
                'tau': get_val('cole_tau4') * 1e-3 if get_val('cole_tau4') else 0,
                'alpha': get_val('cole_alpha4') if get_val('cole_alpha4') is not None else 0
            })

        cole_cole = {
            'ef': ef,
            'terms': terms,
            'sigmaIonic': get_val('cole_sig') if get_val('cole_sig') is not None else 0
        }

    # Build relaxation times - flattened structure for viewer
    # Viewer expects: relaxation['t1_15T'], relaxation['t2_30T'], etc.
    # Note: 3.0T becomes 30T (dot removed) to match viewer's fieldStrength.replace('.', '')
    relaxation_times = {}
    if get_val('t1_15T') is not None:
        relaxation_times['t1_15T'] = get_val('t1_15T')
    if get_val('t2_15T') is not None:
        relaxation_times['t2_15T'] = get_val('t2_15T')
    if get_val('t1_3T') is not None:
        relaxation_times['t1_30T'] = get_val('t1_3T')  # 3.0T -> 30T
    if get_val('t2_3T') is not None:
        relaxation_times['t2_30T'] = get_val('t2_3T')  # 3.0T -> 30T

    # Get elemental composition for this tissue
    elemental_data = elemental_map.get(tissue_name, None)

    # Build tissue data with nested properties structure
    tissue_data = {
        'name': tissue_name,
        'alternativeNames': alt_names,
        'properties': {
            'thermal': {
                'density': get_val('density_av'),
                'heatCapacity': get_val('heat_capacity_av'),
                'thermalConductivity': get_val('thermal_conductivity_av'),
                'heatTransferRate': get_val('heat_transfer_rate_av'),
                'heatGenerationRate': get_val('heat_generation_rate_av')
            },
            'acoustic': {
                'speedOfSound': get_val('sound_speed_av'),
                'nonlinearity': get_val('nonlinearity_av'),
                'attenuation': {
                    'alpha0': get_val('attenuation_alpha0') if get_val('attenuation_alpha0') is not None else 0,
                    'b': get_val('attenuation_b') if get_val('attenuation_b') is not None else 1
                }
            },
            'dielectric': {
                'coleCole': cole_cole,
                'lfConductivity': get_val('lf_conductivity_av')
            },
            'relaxation': relaxation_times if relaxation_times else None,
            'waterContent': get_val('water_content'),
            'elemental': elemental_data
        }
    }

    # Store by primary name
    tissue_properties[tissue_name] = tissue_data

    # Also store by all alternative names
    for alt_name in alt_names:
        tissue_properties[alt_name] = tissue_data

print(f"\nGenerated {len(tissue_properties)} tissue entries")

# Save to file
with open(str(output_path), 'w') as f:
    json.dump(tissue_properties, f, indent=2)

print(f"Saved to {output_path}")

# Print summary stats
unique_tissues = set(d['name'] for d in tissue_properties.values())
print(f"\nUnique tissues: {len(unique_tissues)}")
print(f"Total entries (including aliases): {len(tissue_properties)}")

# Verify Skull Diploe
if 'Skull Diploe' in tissue_properties:
    diploe = tissue_properties['Skull Diploe']
    props = diploe['properties']
    print(f"\n✅ Skull Diploe verification:")
    print(f"   Speed of sound: {props['acoustic']['speedOfSound']} m/s (expected: ~2117.53)")
    print(f"   Attenuation α0: {props['acoustic']['attenuation']['alpha0']} (expected: 47.0)")
    print(f"   Attenuation b: {props['acoustic']['attenuation']['b']} (expected: 1.2)")
    print(f"   Density: {props['thermal']['density']} kg/m³ (expected: 1178.33)")
    print(f"   Heat Capacity: {props['thermal']['heatCapacity']} J/kg/°C (expected: 2274)")
    if props['elemental']:
        print(f"   Hydrogen: {props['elemental']['hydrogen']}")
else:
    print("\n❌ Skull Diploe not found!")
