/**
 * Stable roster order keeps each mascot's equipment consistent across views and replays.
 * The silly items are spread through the list so every lineup mixes them in.
 */
export const ASSEMBLY_PROPS = [
  'rubber-duck',
  'toilet-plunger',
  'keyboard-blade',
  'staple-cannon',
  'sticky-shuriken',
  'coffee-bazooka',
  'monitor-shield',
  'deadline-scythe',
  'mouse-flail',
] as const;
export type AssemblyProp = (typeof ASSEMBLY_PROPS)[number];
export const assemblyProp = (index: number): AssemblyProp => ASSEMBLY_PROPS[index % ASSEMBLY_PROPS.length]!;
export const ASSEMBLY_PROP_NAMES: Record<AssemblyProp, string> = {
  'rubber-duck': 'Debug duck in sunglasses',
  'toilet-plunger': 'Plunger lance',
  'keyboard-blade': 'Backlit keyboard greatsword',
  'staple-cannon': 'Arm-mounted staple cannon',
  'sticky-shuriken': 'Sticky-note shuriken',
  'coffee-bazooka': 'Coffee bazooka',
  'monitor-shield': 'Monitor tower shield',
  'deadline-scythe': 'Deadline scythe',
  'mouse-flail': 'Spiked mouse flail',
};
