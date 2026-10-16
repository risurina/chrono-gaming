export const palette = {
  // Main Backgrounds
  background: '#070706',
  softBackground: '#0D0D0B',

  // Panels
  panel: '#14110B',
  secondaryPanel: '#1D180F',

  // Gold Accents
  gold: '#F4C95D',
  brightGold: '#FFF8E1',
  softGold: '#D4A73C',
  bronze: '#8F651F',

  // Text
  mainText: '#FFFFFF',
  mutedText: '#9C9688',
  warmText: '#FFF8E1',

  // Borders & Glows
  goldBorder: 'rgba(244, 201, 93, 0.18)',
  goldGlow: 'rgba(244, 201, 93, 0.25)',

  // Functional
  danger: '#E05252',
  success: '#7ED957',
  warning: '#F4C95D',
};

export const Colors = {
  dark: {
    text: palette.mainText,
    background: palette.background,
    surface: palette.panel,
    primary: palette.gold,
    accent: palette.brightGold,
    tint: palette.gold,
    icon: palette.mutedText,
    tabIconDefault: palette.mutedText,
    tabIconSelected: palette.gold,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    border: palette.goldBorder,
    mutedText: palette.mutedText,
    softBackground: palette.softBackground,
    secondarySurface: palette.secondaryPanel,
    goldGlow: palette.goldGlow,
    warmText: palette.warmText,
    bronze: palette.bronze,
  },
  light: {
    text: '#1A1A18',
    background: '#F8F1E3',
    surface: '#FFFFFF',
    primary: palette.gold,
    accent: palette.softGold,
    tint: palette.softGold,
    icon: '#595958',
    tabIconDefault: '#595958',
    tabIconSelected: palette.softGold,
    success: '#3F7D58',
    warning: '#9A6B1E',
    danger: '#A44747',
    border: '#E2DFDA',
    mutedText: '#595958',
  },
};
