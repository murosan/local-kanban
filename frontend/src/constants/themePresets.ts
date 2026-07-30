export interface PresetTheme {
  id: string;
  nameKey: string;
  primaryBg: string;
  cardBg: string;
  accentColor: string;
  textColor: string;
}

export const PRESET_THEMES: PresetTheme[] = [
  {
    id: 'dark',
    nameKey: 'preset.dark',
    primaryBg: '#0b0f19',
    cardBg: '#1f293d',
    accentColor: '#3b82f6',
    textColor: '#f8fafc',
  },
  {
    id: 'dim-dark',
    nameKey: 'preset.dimDark',
    primaryBg: '#1f2937',
    cardBg: '#252e3d',
    accentColor: '#38bdf8',
    textColor: '#f9fafb',
  },
  {
    id: 'midnight',
    nameKey: 'preset.midnight',
    primaryBg: '#0a0e1a',
    cardBg: '#131b2e',
    accentColor: '#6366f1',
    textColor: '#f1f5f9',
  },
  {
    id: 'nord',
    nameKey: 'preset.nord',
    primaryBg: '#2e3440',
    cardBg: '#3b4252',
    accentColor: '#88c0d0',
    textColor: '#eceff4',
  },
  {
    id: 'dracula',
    nameKey: 'preset.dracula',
    primaryBg: '#282a36',
    cardBg: '#44475a',
    accentColor: '#bd93f9',
    textColor: '#f8f8f2',
  },
  {
    id: 'monokai',
    nameKey: 'preset.monokai',
    primaryBg: '#272822',
    cardBg: '#3e3d32',
    accentColor: '#a6e22e',
    textColor: '#f8f8f2',
  },
  {
    id: 'cyberpunk',
    nameKey: 'preset.cyberpunk',
    primaryBg: '#120458',
    cardBg: '#1f0878',
    accentColor: '#ff007f',
    textColor: '#ffe700',
  },
  {
    id: 'light-clean',
    nameKey: 'preset.lightClean',
    primaryBg: '#f8fafc',
    cardBg: '#ffffff',
    accentColor: '#2563eb',
    textColor: '#0f172a',
  },
  {
    id: 'warm-paper',
    nameKey: 'preset.warmPaper',
    primaryBg: '#fbf9f5',
    cardBg: '#f3efe6',
    accentColor: '#d97706',
    textColor: '#292524',
  },
];
