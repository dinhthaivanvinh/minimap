/** Stable roster order keeps each mascot's equipment consistent across views and replays. */
export const ASSEMBLY_PROPS = ['badge', 'stapler', 'box-frame', 'travel-mug', 'review-axe'] as const;
export type AssemblyProp = (typeof ASSEMBLY_PROPS)[number];
export const assemblyProp = (index: number): AssemblyProp => ASSEMBLY_PROPS[index % ASSEMBLY_PROPS.length]!;
export const ASSEMBLY_PROP_NAMES: Record<AssemblyProp, string> = {
  badge: '#1 Employee badge',
  stapler: 'Giant stapler',
  'box-frame': 'Cardboard exo-frame',
  'travel-mug': 'Power travel mug',
  'review-axe': 'Performance review axe',
};
