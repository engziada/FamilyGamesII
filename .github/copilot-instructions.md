# Copilot Instructions

This file provides context for GitHub Copilot when making code suggestions.

## Design Context

### Users
Arabic-speaking teenagers and adults at parties and social gatherings. They're using the platform during game nights, celebrations, and friend meetups. The job-to-be-done is entertainment and social bonding - creating memorable moments through friendly competition. Users may have varying tech proficiency and may be playing in noisy, social environments.

### Brand Personality
**Playful, Warm, Inclusive.** The tone is celebratory and fun - like a family gathering where everyone's invited. The design should feel like a party: energetic but not overwhelming. Think of it as the digital equivalent of a beautifully set dinner table where the food is the games.

### Aesthetic Direction
- **Visual tone:** Vibrant, energetic, slightly whimsical - asymmetric borders, playful animations, emoji reactions
- **Theme:** Dual mode - bright/cheerful light theme, cozy/moody dark theme
- **References:** The playful asymmetry recalls the joy of handmade crafts; the bright colors feel like festival decorations
- **Anti-patterns:** Avoid sterile corporate aesthetics, excessive minimalism, or muted/pastel palettes that drain energy

### Design Principles

1. **Joy First** - Every interaction should spark delight. Use animations, colors, and micro-interactions that make people smile. The current heartbeat, jelly, and pulse animations embody this.

2. **Cognitive Ease** - Reduce mental load during gameplay. Clear visual hierarchy, obvious affordances, large touch targets (44px+), and intuitive flows. Players shouldn't need to think about how to use the interface.

3. **RTL-Native** - Arabic is not an afterthought. Every component is designed right-to-left first, with proper mirroring and culturally appropriate spacing.

4. **Inclusive Celebration** - Confetti, score animations, and emoji reactions celebrate everyone's achievements. Design for shared moments, not individual competition.

5. **Bold & Playful** - Embrace the current asymmetric border-radius (`15px 50px 15px 50px`), pop shadows (`5px 5px`), and vibrant colors (`#FF6B6B`, `#4ECDC4`, `#FFE66D`). The current design direction is correct - enhance, don't tone down.

### Color Palette
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--primary` | `#FF6B6B` | `#FF6B6B` | CTAs, highlights, active states |
| `--secondary` | `#4ECDC4` | `#4ECDC4` | Secondary actions, team badges |
| `--accent` | `#FFE66D` | `#FFE66D` | Highlights, warnings, emphasis |
| `--bg-main` | `#F7FFF7` | `#1a1a2e` | Page background |
| `--surface` | `#FFFFFF` | `#16213e` | Cards, modals |
| `--text` | `#2F2F2F` | `#e0e0e0` | Body text |
| `--success` | `#6BCB77` | `#6BCB77` | Correct answers, wins |
| `--danger` | `#FF6B6B` | `#FF6B6B` | Errors, time warnings |
| `--purple` | `#BC7AF9` | `#BC7AF9` | Team distinctions |

### Typography
- **Headings:** Lemonada (cursive, Arabic-friendly) - weights 300-700
- **Body:** Changa (sans-serif, Arabic-friendly) - weights 300-800
- **Scale:** Mobile-first with `clamp()` for fluid sizing

### Spacing & Motion
- **Shadows:** Pop (`5px 5px`), Heavy (`8px 8px`) - playful depth
- **Border-radius:** Asymmetric (`30px 80px 30px 70px / 70px 30px 80px 30px`) - whimsical personality
- **Transitions:** `0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)` - bouncy, playful feel
- **Animations:** Heartbeat, jelly, bounceInDown, pulse - match current sprinkle-pattern background

### Accessibility Notes
- Skip links implemented ✓
- Focus visible outlines ✓
- Minimum 44px touch targets ✓
- System dark mode detection ✓
- **Enhance for cognitive ease:** Clear visual hierarchy, avoid clutter, provide clear feedback states