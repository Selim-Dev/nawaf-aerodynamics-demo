/**
 * Mesh names produced by the procedural placeholder airliner.
 * Kept dependency-free so scripts/validate.ts can import it under plain Node.
 */
export const PLACEHOLDER_MESH_NAMES = [
  'Fuselage',
  'Cockpit_Windows',
  'Cabin_Windows',
  'Door_1L', 'Door_1R', 'Door_4L', 'Door_4R',
  'Exit_L', 'Exit_R',
  'BellyFairing',
  'CargoDoor_Fwd', 'CargoDoor_Aft', 'CargoDoor_Bulk',
  'Wing_L', 'Wing_R',
  'Slats_L', 'Slats_R',
  'Flaps_L', 'Flaps_R',
  'Aileron_L', 'Aileron_R',
  'Sharklet_L', 'Sharklet_R',
  'HStab_L', 'HStab_R',
  'Elevator_L', 'Elevator_R',
  'Fin',
  'Rudder',
  'Engine1_Nacelle', 'Engine1_Fan', 'Engine1_Exhaust', 'Engine1_Pylon',
  'Engine2_Nacelle', 'Engine2_Fan', 'Engine2_Exhaust', 'Engine2_Pylon',
  'NoseGear_Strut', 'NoseGear_Wheels',
  'MainGear_L_Strut', 'MainGear_L_Wheels',
  'MainGear_R_Strut', 'MainGear_R_Wheels',
  'APU_Exhaust',
] as const
