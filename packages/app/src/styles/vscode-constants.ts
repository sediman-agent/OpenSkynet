/**
 * VS Code Design Constants - Shared Across Components
 * Industrial design system tokens for consistent styling
 */

// ============================================================================
// Spacing System - 4px Base Unit
// ============================================================================
export const SPACING = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  xxl: '20px',
  '2xl': '20px',
  '3xl': '24px',
} as const;

// ============================================================================
// Typography - Industrial Scale
// ============================================================================
export const TYPOGRAPHY = {
  xs: '11px',
  sm: '12px',
  base: '13px',
  md: '14px',
  lg: '16px',
  xl: '18px',
  '2xl': '20px',
} as const;

// ============================================================================
// Border Radius - Industrial Standard
// ============================================================================
export const RADIUS = {
  none: '0',
  sm: '2px',
  md: '3px',
  lg: '4px',
  full: '9999px',
} as const;

// ============================================================================
// Transitions - Professional Timing
// ============================================================================
export const TRANSITIONS = {
  fast: '100ms',
  normal: '150ms',
  slow: '200ms',
} as const;

// ============================================================================
// Sizes - Component Dimensions
// ============================================================================
export const SIZES = {
  inputHeight: 26,
  buttonHeight: 24,
  buttonIcon: 20,
  toolbarHeight: 32,
  headerHeight: 40,
  statusBarHeight: 22,
} as const;

// ============================================================================
// Z-Index Layers
// ============================================================================
export const Z_INDEX = {
  dropdown: 1000,
  sticky: 1020,
  tooltip: 1070,
  modal: 1050,
  popover: 1060,
} as const;

// ============================================================================
// VS Code Specific Sizes
// ============================================================================
export const VS_CODES = {
  // Spacing
  spacing: SPACING,
  xs: SPACING.xs,
  sm: SPACING.sm,
  md: SPACING.md,
  lg: SPACING.lg,
  xl: SPACING.xl,
  xxl: SPACING.xxl,
  designUnit: 4,

  // Typography
  fontSize: TYPOGRAPHY.base,
  fontSizeSmall: TYPOGRAPHY.sm,
  lineHeight: 1.4,

  // Border radius
  radius: RADIUS.sm,
  radiusSm: RADIUS.sm,
  radiusLg: RADIUS.lg,
  borderRadius: RADIUS.sm,
  borderRadiusRound: RADIUS.md,
  cornerRadius: RADIUS.sm,
  radiusButton: '5px',

  // Transitions
  transition: TRANSITIONS.normal,

  // Dimensions
  inputHeight: SIZES.inputHeight,
  buttonIconPadding: 3,
  buttonIconCornerRadius: RADIUS.lg,
  inputPadding: 8,
  iconSize: 14,

  // Padding
  padding: {
    x: SPACING.lg,
    y: SPACING.md
  },

  // Shadow effects
  shadowSm: '0 1px 3px rgba(0, 0, 0, 0.1)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.1)',

  // Focus ring - elegant violet
  focusRing: '0 0 0 2px var(--vscode-focus-border), 0 0 0 6px rgba(139, 92, 246, 0.2)',
} as const;

// ============================================================================
// Utility Type Guards
// ============================================================================
export function isSpacing(value: string): value is keyof typeof SPACING {
  return Object.keys(SPACING).includes(value);
}

export function isTypography(value: string): value is keyof typeof TYPOGRAPHY {
  return Object.keys(TYPOGRAPHY).includes(value);
}

export function isRadius(value: string): value is keyof typeof RADIUS {
  return Object.keys(RADIUS).includes(value);
}

export default VS_CODES;
