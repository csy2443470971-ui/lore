/* Two themes only. The colour lives in the scene; the UI is ink, hairlines, paper and one red dot. */
export type Theme = {
  dark: boolean;
  ink: string; muted: string; line: string; glass: string; sheet: string;
  paper: string; paperSolid: string; pInk: string; pMuted: string; pFaint: string; pLine: string; pFill: string;
  scrim: [string, string]; rec: string;
};

export const light: Theme = {
  dark: false,
  ink: '#23252D', muted: 'rgba(35,37,45,0.6)', line: 'rgba(35,37,45,0.3)', glass: 'rgba(255,255,255,0.5)', sheet: 'rgba(246,246,244,0.82)',
  paper: 'rgba(246,246,244,0.96)', paperSolid: '#F6F6F4', pInk: '#1D1F27', pMuted: '#6C707B', pFaint: 'rgba(29,31,39,0.26)', pLine: 'rgba(29,31,39,0.12)', pFill: 'rgba(29,31,39,0.045)',
  scrim: ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)'], rec: '#E5483B',
};

export const dark: Theme = {
  dark: true,
  ink: '#EEF0F6', muted: 'rgba(238,240,246,0.64)', line: 'rgba(238,240,246,0.32)', glass: 'rgba(20,26,44,0.4)', sheet: 'rgba(13,16,25,0.82)',
  paper: 'rgba(13,16,25,0.95)', paperSolid: '#0D1019', pInk: '#E8EAF0', pMuted: '#9298A7', pFaint: 'rgba(232,234,240,0.26)', pLine: 'rgba(232,234,240,0.12)', pFill: 'rgba(232,234,240,0.055)',
  scrim: ['rgba(5,10,25,0.35)', 'rgba(5,10,25,0)'], rec: '#E5483B',
};

export const F = {
  cn: 'NotoSerifSC-400',
  cnMed: 'NotoSerifSC-500',
  serif: 'Newsreader_400Regular',
  serifIt: 'Newsreader_400Regular_Italic',
  serifLight: 'Newsreader_300Light',
  mono: 'GeistMono_400Regular',
};
