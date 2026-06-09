/**
 * VS Code Official Design System
 * Based on microsoft/vscode-webview-ui-toolkit design tokens
 * Source: https://github.com/microsoft/vscode-webview-ui-toolkit/blob/main/src/design-tokens.ts
 */

// ============================================================================
// GLOBAL DESIGN TOKENS (Official VS Code values)
// ============================================================================

export const VS_CODE_DESIGN = {
  // Layout & Spacing
  background: '#1e1e1e',
  borderWidth: 1,
  cornerRadius: 0,              // Sharp corners for most elements
  cornerRadiusRound: 2,         // Slightly rounded for specific elements
  designUnit: 4,                // Base spacing unit (4px)
  focusBorder: '#007fd4',        // VS Code blue focus ring
  disabledOpacity: 0.4,

  // Typography
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
  fontWeight: '400',
  foreground: '#cccccc',

  // Type Ramp (Typography Scale)
  typeRamp: {
    base: {
      fontSize: '13px',
      lineHeight: 'normal',
    },
    minus1: {
      fontSize: '11px',
      lineHeight: '16px',
    },
    minus2: {
      fontSize: '9px',
      lineHeight: '16px',
    },
    plus1: {
      fontSize: '16px',
      lineHeight: '24px',
    },
  },

  // Input
  inputHeight: 26,             // EXACT 26px
  inputMinWidth: '100px',

  // Scrollbar
  scrollbarWidth: '10px',
  scrollbarHeight: '10px',
  scrollbarSliderBackground: '#79797966',
  scrollbarSliderHoverBackground: '#646464b3',
  scrollbarSliderActiveBackground: '#bfbfbf66',

  // ============================================================================
  // COMPONENT TOKENS
  // ============================================================================

  // Buttons
  button: {
    border: 'transparent',
    background: 'transparent',
    primaryBackground: '#0e639c',
    primaryForeground: '#ffffff',
    primaryHoverBackground: '#1177bb',
    secondaryBackground: '#3a3d41',
    secondaryForeground: '#ffffff',
    secondaryHoverBackground: '#45494e',
    paddingHorizontal: '11px',
    paddingVertical: '4px',
    iconPadding: '3px',
    iconCornerRadius: '5px',
    iconHoverBackground: 'rgba(90, 93, 94, 0.31)',
  },

  // Inputs & Text Fields
  input: {
    background: '#3c3c3c',
    foreground: '#cccccc',
    placeholderForeground: '#cccccc',
  },

  // Lists & Dropdowns
  list: {
    activeSelectionBackground: '#094771',
    activeSelectionForeground: '#ffffff',
    hoverBackground: '#2a2d2e',
  },

  dropdown: {
    background: '#3c3c3c',
    border: '#3c3c3c',
    foreground: '#f0f0f0',
    listMaxHeight: '200px',
  },

  // Checkboxes
  checkbox: {
    background: '#3c3c3c',
    border: '#3c3c3c',
    foreground: '#f0f0f0',
    cornerRadius: 3,
  },

  // Links
  link: {
    foreground: '#3794ff',
    activeForeground: '#3794ff',
  },

  // Badges
  badge: {
    background: '#4d4d4d',
    foreground: '#ffffff',
  },

  // Dividers
  divider: {
    background: '#454545',
  },

  // Progress
  progress: {
    background: '#0e70c0',
  },

  // Panels
  panel: {
    tabActiveBorder: '#e7e7e7',
    tabActiveForeground: '#e7e7e7',
    tabForeground: '#e7e7e799',
    viewBackground: '#1e1e1e',
    viewBorder: '#80808059',
  },

  // Tags
  tag: {
    cornerRadius: '2px',
  },
} as const;

// ============================================================================
// CSS VARIABLES (for use in CSS/styled-components)
// ============================================================================

export const VS_CODE_CSS_VARS = {
  '--vscode-background': VS_CODE_DESIGN.background,
  '--vscode-foreground': VS_CODE_DESIGN.foreground,
  '--vscode-focusBorder': VS_CODE_DESIGN.focusBorder,
  '--vscode-input-background': VS_CODE_DESIGN.input.background,
  '--vscode-input-foreground': VS_CODE_DESIGN.input.foreground,
  '--vscode-button-background': VS_CODE_DESIGN.button.primaryBackground,
  '--vscode-button-foreground': VS_CODE_DESIGN.button.primaryForeground,
  '--vscode-button-hoverBackground': VS_CODE_DESIGN.button.primaryHoverBackground,
  '--vscode-list-hoverBackground': VS_CODE_DESIGN.list.hoverBackground,
  '--vscode-list-activeSelectionBackground': VS_CODE_DESIGN.list.activeSelectionBackground,
  '--vscode-dropdown-background': VS_CODE_DESIGN.dropdown.background,
  '--vscode-dropdown-foreground': VS_CODE_DESIGN.dropdown.foreground,
  '--vscode-divider-background': VS_CODE_DESIGN.divider.background,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Apply VS Code spacing using designUnit (4px base)
 */
export function spacing(units: number): string {
  return `${units * VS_CODE_DESIGN.designUnit}px`;
}

/**
 * Get typography style for type ramp level
 */
export function typeStyle(level: 'base' | 'minus1' | 'minus2' | 'plus1') {
  return VS_CODE_DESIGN.typeRamp[level];
}

/**
 * Apply VS Code border radius
 */
export const borderRadius = {
  none: '0',
  round: `${VS_CODE_DESIGN.cornerRadiusRound}px`,
  button: `${VS_CODE_DESIGN.button.iconCornerRadius}px`,
  tag: VS_CODE_DESIGN.tag.cornerRadius,
  checkbox: `${VS_CODE_DESIGN.checkbox.cornerRadius}px`,
} as const;

// ============================================================================
// COMPONENT STYLES (Pre-built style objects)
// ============================================================================

export const vscodeStyles = {
  // Input field (26px height, exact VS Code specs)
  input: {
    height: `${VS_CODE_DESIGN.inputHeight}px`,
    backgroundColor: VS_CODE_DESIGN.input.background,
    color: VS_CODE_DESIGN.input.foreground,
    border: '1px solid transparent',
    borderRadius: borderRadius.none,
    padding: `0 ${VS_CODE_DESIGN.button.paddingHorizontal}`,
    fontSize: VS_CODE_DESIGN.typeRamp.base.fontSize,
    fontFamily: VS_CODE_DESIGN.fontFamily,
  },

  // Input with focus state
  inputFocus: {
    outline: 'none',
    borderColor: VS_CODE_DESIGN.focusBorder,
  },

  // Primary button
  buttonPrimary: {
    backgroundColor: VS_CODE_DESIGN.button.primaryBackground,
    color: VS_CODE_DESIGN.button.primaryForeground,
    border: 'none',
    borderRadius: borderRadius.none,
    padding: `${VS_CODE_DESIGN.button.paddingVertical} ${VS_CODE_DESIGN.button.paddingHorizontal}`,
    fontSize: VS_CODE_DESIGN.typeRamp.base.fontSize,
    fontFamily: VS_CODE_DESIGN.fontFamily,
    cursor: 'pointer',
  },

  // Primary button hover
  buttonPrimaryHover: {
    backgroundColor: VS_CODE_DESIGN.button.primaryHoverBackground,
  },

  // Secondary button
  buttonSecondary: {
    backgroundColor: VS_CODE_DESIGN.button.secondaryBackground,
    color: VS_CODE_DESIGN.button.secondaryForeground,
    border: 'none',
    borderRadius: borderRadius.none,
    padding: `${VS_CODE_DESIGN.button.paddingVertical} ${VS_CODE_DESIGN.button.paddingHorizontal}`,
    fontSize: VS_CODE_DESIGN.typeRamp.base.fontSize,
    fontFamily: VS_CODE_DESIGN.fontFamily,
    cursor: 'pointer',
  },

  // Icon button
  buttonIcon: {
    backgroundColor: VS_CODE_DESIGN.button.background,
    border: 'none',
    borderRadius: borderRadius.button,
    padding: VS_CODE_DESIGN.button.iconPadding,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List item
  listItem: {
    padding: `${VS_CODE_DESIGN.designUnit * 2}px ${VS_CODE_DESIGN.button.paddingHorizontal}`,
    cursor: 'pointer',
  },

  // List item hover
  listItemHover: {
    backgroundColor: VS_CODE_DESIGN.list.hoverBackground,
  },

  // Dropdown
  dropdown: {
    backgroundColor: VS_CODE_DESIGN.dropdown.background,
    border: `1px solid ${VS_CODE_DESIGN.dropdown.border}`,
    borderRadius: borderRadius.round,
    maxHeight: VS_CODE_DESIGN.dropdown.listMaxHeight,
  },
} as const;
