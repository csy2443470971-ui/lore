/* Two themes, one set of rules: an off-white (or near-black) field with a faint dot texture, white (or dark) panels,
   a dark capsule for the main action, one red dot, and a soft warm glow behind whatever you are talking about. */
export type Theme = {
  dark: boolean;
  b: string; ink: string; mut: string; gray: string; panel: string; pill: string; pillText: string;
  red: string; glow: string; dot: string; strike: string;
};

export const light: Theme = {
  dark: false,
  b: '#F4F4F1', ink: '#1B1A18', mut: '#8C8A84', gray: '#E8E7E2', panel: '#FFFFFF', pill: '#1F1D1A', pillText: '#FFFFFF',
  red: '#F04A3A', glow: 'rgba(255,214,120,0.55)', dot: 'rgba(27,26,24,0.07)', strike: '#BDBAB2',
};

export const dark: Theme = {
  dark: true,
  b: '#121211', ink: '#EEEDEA', mut: '#8F8C85', gray: '#2B2A27', panel: '#1E1D1B', pill: '#EEEDEA', pillText: '#121211',
  red: '#F04A3A', glow: 'rgba(255,186,92,0.26)', dot: 'rgba(255,255,255,0.06)', strike: '#57554F',
};

/* sizes from the chosen baseline, with the smaller controls */
export const SZ = { px: 20, round: 36, key: 46, tileR: 10, tileGap: 5, panelR: 26, stageR: 28 };

export const F = {
  cn: 'NotoSerifSC-400',
  cnMed: 'NotoSerifSC-500',
  serif: 'Newsreader_400Regular',
  serifIt: 'Newsreader_400Regular_Italic',
  serifLight: 'Newsreader_300Light',
};
