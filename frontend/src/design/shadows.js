const shadows = {
  // Level 0: No shadow (flat)
  none: 'none',

  // Level 1: Subtle shadow (cards, inputs)
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',

  // Level 2: Medium shadow (cards, dropdowns)
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',

  // Card: Soft floating look (two-layer: large blur + micro)
  card: '0 10px 30px rgba(0, 0, 0, 0.08), 0 2px 10px rgba(0, 0, 0, 0.04)',

  // Card hover: Slightly stronger for lift effect
  cardHover: '0 14px 36px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',

  // Card pressed: Slightly reduced for sink effect
  cardPressed: '0 6px 20px rgba(0, 0, 0, 0.06), 0 1px 6px rgba(0, 0, 0, 0.03)',

  // Level 3: Strong shadow (modals, floating elements)
  lg: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',

  // Level 4: Very strong shadow (help bubble, dialogs)
  xl: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',

  // Spec-compliant card shadows (Home redesign)
  cardSpec: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
  cardSpecHover: '0 2px 4px rgba(24,24,24,0.08), 0 16px 28px rgba(24,24,24,0.10)'
};

export default shadows;
