// theme.js
// Theme, typography, and font size configuration manager.
// Supports built-in themes and user-created custom themes with full Color Wheel and RGB controls.

export const BUILTIN_THEMES = {
  dark_void: {
    name: 'Dark Void (Default)',
    colors: {
      '--bg-void': '#0a0b0f',
      '--bg-base': '#0d0f14',
      '--bg-panel': '#12141c',
      '--bg-raised': '#191c26',
      '--bg-hover': '#232838',
      '--bg-pressed': '#2c3247',
      '--border-hairline': '#232838',
      '--border-strong': '#343b52',
      '--text-primary': '#e2e4ea',
      '--text-muted': '#7c8299',
      '--text-dim': '#4d5268',
      '--signal': '#5eead4',
      '--signal-dim': '#2d5f58',
      '--signal-glow': 'rgba(94, 234, 212, 0.18)',
      'color-scheme': 'dark',
    },
  },
  midnight_blue: {
    name: 'Deep Midnight (Blue)',
    colors: {
      '--bg-void': '#060913',
      '--bg-base': '#0b1021',
      '--bg-panel': '#101730',
      '--bg-raised': '#182346',
      '--bg-hover': '#223260',
      '--bg-pressed': '#2d407a',
      '--border-hairline': '#1e2c56',
      '--border-strong': '#2d407a',
      '--text-primary': '#e0e7ff',
      '--text-muted': '#818cf8',
      '--text-dim': '#4f46e5',
      '--signal': '#38bdf8',
      '--signal-dim': '#1e3a8a',
      '--signal-glow': 'rgba(56, 189, 248, 0.22)',
      'color-scheme': 'dark',
    },
  },
  terminal_green: {
    name: 'Terminal Green (Matrix)',
    colors: {
      '--bg-void': '#050d08',
      '--bg-base': '#0a170e',
      '--bg-panel': '#0f2115',
      '--bg-raised': '#173321',
      '--bg-hover': '#1f442c',
      '--bg-pressed': '#295738',
      '--border-hairline': '#1a3b25',
      '--border-strong': '#295738',
      '--text-primary': '#dcfce7',
      '--text-muted': '#86efac',
      '--text-dim': '#22c55e',
      '--signal': '#4ade80',
      '--signal-dim': '#14532d',
      '--signal-glow': 'rgba(74, 222, 128, 0.22)',
      'color-scheme': 'dark',
    },
  },
  cyberpunk_neon: {
    name: 'Cyberpunk (Neon Purple)',
    colors: {
      '--bg-void': '#0d0614',
      '--bg-base': '#140b20',
      '--bg-panel': '#1b102c',
      '--bg-raised': '#281842',
      '--bg-hover': '#39225d',
      '--bg-pressed': '#4a2c78',
      '--border-hairline': '#301c4e',
      '--border-strong': '#4a2c78',
      '--text-primary': '#fae8ff',
      '--text-muted': '#e879f9',
      '--text-dim': '#c026d3',
      '--signal': '#f472b6',
      '--signal-dim': '#701a75',
      '--signal-glow': 'rgba(244, 114, 182, 0.25)',
      'color-scheme': 'dark',
    },
  },
  nordic_slate: {
    name: 'Nordic Slate',
    colors: {
      '--bg-void': '#0e1117',
      '--bg-base': '#161b22',
      '--bg-panel': '#21262d',
      '--bg-raised': '#30363d',
      '--bg-hover': '#3c444d',
      '--bg-pressed': '#48525d',
      '--border-hairline': '#30363d',
      '--border-strong': '#48525d',
      '--text-primary': '#f0f6fc',
      '--text-muted': '#8b949e',
      '--text-dim': '#58a6ff',
      '--signal': '#58a6ff',
      '--signal-dim': '#1f6feb',
      '--signal-glow': 'rgba(88, 166, 255, 0.2)',
      'color-scheme': 'dark',
    },
  },
  clean_light: {
    name: 'Clean Light',
    colors: {
      '--bg-void': '#e2e8f0',
      '--bg-base': '#ffffff',
      '--bg-panel': '#f8fafc',
      '--bg-raised': '#f1f5f9',
      '--bg-hover': '#e2e8f0',
      '--bg-pressed': '#cbd5e1',
      '--border-hairline': '#e2e8f0',
      '--border-strong': '#cbd5e1',
      '--text-primary': '#0f172a',
      '--text-muted': '#475569',
      '--text-dim': '#64748b',
      '--signal': '#0284c7',
      '--signal-dim': '#bae6fd',
      '--signal-glow': 'rgba(2, 132, 199, 0.18)',
      'color-scheme': 'light',
    },
  },
};

export let customThemes = {};

export function setCustomThemes(themes) {
  customThemes = themes || {};
}

export function getAllThemes() {
  return { ...BUILTIN_THEMES, ...customThemes };
}

export const DEFAULT_VIEW_CONFIG = {
  theme: 'dark_void',
  cmdFontSize: '11px',
  inputFontSize: '11px',
  fontFamily: "'JetBrains Mono', 'Consolas', monospace",
  density: 'normal', // 'compact' | 'normal' | 'comfortable'
};

export async function loadAndApplyViewConfig() {
  try {
    if (window.feMacro?.storeGet) {
      customThemes = (await window.feMacro.storeGet('customThemes', {})) || {};
      const saved = await window.feMacro.storeGet('viewConfig', DEFAULT_VIEW_CONFIG);
      const config = { ...DEFAULT_VIEW_CONFIG, ...(saved || {}) };
      applyViewConfig(config);
      return config;
    }
  } catch (err) {
    console.warn('Could not load viewConfig from store:', err);
  }
  applyViewConfig(DEFAULT_VIEW_CONFIG);
  return { ...DEFAULT_VIEW_CONFIG };
}

export function applyViewConfig(config) {
  if (!config) return;
  const root = document.documentElement;
  const allThemes = getAllThemes();
  const preset = allThemes[config.theme] || BUILTIN_THEMES.dark_void;

  // Apply colors
  if (preset && preset.colors) {
    Object.entries(preset.colors).forEach(([k, v]) => {
      root.style.setProperty(k, v);
    });
  }

  // Apply font size and typography
  root.style.setProperty('--font-size-cmd', config.cmdFontSize || '11px');
  root.style.setProperty('--font-size-input', config.inputFontSize || '11px');
  if (config.fontFamily) {
    root.style.setProperty('--font-mono', config.fontFamily);
  }

  // Apply density & spacing
  if (config.density === 'compact') {
    root.style.setProperty('--btn-padding-y', '3px');
    root.style.setProperty('--btn-padding-x', '7px');
    root.style.setProperty('--field-padding-y', '3px');
    root.style.setProperty('--field-padding-x', '5px');
    root.style.setProperty('--field-gap-y', '4px');
    root.style.setProperty('--cmd-gap-y', '2px');
    root.style.setProperty('--panel-padding', '6px 10px');
  } else if (config.density === 'comfortable') {
    root.style.setProperty('--btn-padding-y', '9px');
    root.style.setProperty('--btn-padding-x', '12px');
    root.style.setProperty('--field-padding-y', '7px');
    root.style.setProperty('--field-padding-x', '9px');
    root.style.setProperty('--field-gap-y', '10px');
    root.style.setProperty('--cmd-gap-y', '5px');
    root.style.setProperty('--panel-padding', '12px 14px');
  } else {
    // normal
    root.style.setProperty('--btn-padding-y', '6px');
    root.style.setProperty('--btn-padding-x', '9px');
    root.style.setProperty('--field-padding-y', '5px');
    root.style.setProperty('--field-padding-x', '7px');
    root.style.setProperty('--field-gap-y', '6px');
    root.style.setProperty('--cmd-gap-y', '3px');
    root.style.setProperty('--panel-padding', '10px 12px');
  }
}

// Color conversion helpers
export function hexToRgb(hex) {
  let c = (hex || '').replace('#', '').trim();
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  if (c.length !== 6) return { r: 0, g: 0, b: 0 };
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function adjustHexBrightness(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + percent / 100;
  return rgbToHex(r * factor, g * factor, b * factor);
}

export function generateCustomThemeObject(name, signalHex, bgBaseHex, bgPanelHex, textHex) {
  const isDark = true;
  const bgVoid = adjustHexBrightness(bgBaseHex, -25);
  const bgRaised = adjustHexBrightness(bgPanelHex, 20);
  const bgHover = adjustHexBrightness(bgPanelHex, 35);
  const bgPressed = adjustHexBrightness(bgPanelHex, 50);

  const borderHairline = adjustHexBrightness(bgPanelHex, 25);
  const borderStrong = adjustHexBrightness(bgPanelHex, 45);

  const signalDim = adjustHexBrightness(signalHex, -45);
  const signalGlow = hexToRgba(signalHex, 0.22);

  return {
    name,
    isCustom: true,
    colors: {
      '--bg-void': bgVoid,
      '--bg-base': bgBaseHex,
      '--bg-panel': bgPanelHex,
      '--bg-raised': bgRaised,
      '--bg-hover': bgHover,
      '--bg-pressed': bgPressed,
      '--border-hairline': borderHairline,
      '--border-strong': borderStrong,
      '--text-primary': textHex,
      '--text-muted': adjustHexBrightness(textHex, -35),
      '--text-dim': adjustHexBrightness(textHex, -55),
      '--signal': signalHex,
      '--signal-dim': signalDim,
      '--signal-glow': signalGlow,
      'color-scheme': isDark ? 'dark' : 'light',
    },
  };
}
