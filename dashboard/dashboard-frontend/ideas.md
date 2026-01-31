# Koda Admin Dashboard - Design Ideas

## Selected Design Approach: Swiss Brutalist Tech

### Design Movement
**Swiss Brutalist Tech** - A fusion of Swiss International Style's grid precision with Brutalist web design's raw authenticity, adapted for modern tech dashboards. This approach emphasizes stark contrasts, geometric precision, and functional beauty.

### Core Principles
1. **Monochromatic Authority** - Pure white backgrounds with deep black typography creates maximum contrast and professional gravitas
2. **Grid Absolutism** - Strict 8px grid system with mathematical spacing ratios (8, 16, 24, 32, 48, 64)
3. **Functional Minimalism** - Every element serves a purpose; no decorative flourishes
4. **Data Density** - Maximize information display while maintaining visual clarity

### Color Philosophy
- **Background**: Pure white (#FFFFFF / oklch(1 0 0))
- **Primary Text**: Near-black (#0A0A0A / oklch(0.15 0 0))
- **Secondary Text**: Dark gray (#525252 / oklch(0.4 0 0))
- **Muted Text**: Medium gray (#737373 / oklch(0.5 0 0))
- **Borders**: Light gray (#E5E5E5 / oklch(0.9 0 0))
- **Accent**: Single accent color for critical actions - Electric blue (#0066FF)
- **Status Colors**: 
  - Success: #10B981 (green)
  - Warning: #F59E0B (amber)
  - Error: #EF4444 (red)
  - Info: #3B82F6 (blue)

### Layout Paradigm
- **Fixed sidebar navigation** (240px width) with icon + text
- **Main content area** with consistent 32px padding
- **Card-based sections** with subtle 1px borders, no shadows
- **Tables** with clean horizontal rules only
- **Asymmetric grid** for KPI cards (varying column spans based on importance)

### Signature Elements
1. **Monospace numbers** - All metrics and data use monospace font for alignment
2. **Thin hairline borders** - 1px borders instead of shadows for depth
3. **Uppercase labels** - Section headers and labels in uppercase, letter-spaced

### Interaction Philosophy
- **Instant feedback** - Hover states appear immediately with subtle background shifts
- **No loading spinners** - Use skeleton screens that match the final layout
- **Keyboard-first** - Full keyboard navigation support
- **Micro-animations** - 150ms transitions for state changes

### Animation Guidelines
- **Duration**: 150ms for micro-interactions, 300ms for page transitions
- **Easing**: cubic-bezier(0.4, 0, 0.2, 1) for all transitions
- **Hover effects**: Background color shift to #F5F5F5
- **Active states**: Scale down to 0.98 with 100ms duration
- **Page transitions**: Fade in from opacity 0 to 1

### Typography System
- **Display/Headers**: Inter (700 weight) - Bold, commanding presence
- **Body Text**: Inter (400 weight) - Clean, readable
- **Data/Numbers**: JetBrains Mono (400 weight) - Monospace for alignment
- **Labels**: Inter (500 weight, uppercase, 0.05em letter-spacing)

**Type Scale:**
- Display: 32px / 40px line-height
- H1: 24px / 32px line-height
- H2: 20px / 28px line-height
- H3: 16px / 24px line-height
- Body: 14px / 20px line-height
- Small: 12px / 16px line-height
- Caption: 11px / 14px line-height
