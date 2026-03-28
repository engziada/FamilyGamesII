/**
 * Family Games II - Component Library
 * 
 * A collection of reusable UI components following the design system.
 * All components use design tokens from tokens.css and follow
 * the playful, RTL-first design language.
 * 
 * @example
 * // Import all components
 * import { Button, Card, Modal, Input, Badge, Toast, PlayerItem } from './components/index.js';
 * 
 * // Or import individually
 * import { Button } from './components/button.js';
 */

// Export all components
const Components = {
  Button: typeof Button !== 'undefined' ? Button : null,
  Card: typeof Card !== 'undefined' ? Card : null,
  Modal: typeof Modal !== 'undefined' ? Modal : null,
  Input: typeof Input !== 'undefined' ? Input : null,
  Badge: typeof Badge !== 'undefined' ? Badge : null,
  Toast: typeof Toast !== 'undefined' ? Toast : null,
  PlayerItem: typeof PlayerItem !== 'undefined' ? PlayerItem : null,
};

/**
 * Initialize all components (auto-import script).
 * Call this once in your main entry point.
 * @param {Document} doc - Document to initialize in
 */
function initComponents(doc = document) {
  // Components are self-initializing via IIFE
  // This function exists for future initialization needs
  console.log('[Components] Design system components loaded');
}

/**
 * Create a component from a configuration object.
 * @param {string} type - Component type (button, card, modal, input, badge, toast, player-item)
 * @param {Object} config - Component configuration
 * @returns {HTMLElement|null}
 */
function createComponent(type, config) {
  switch (type.toLowerCase()) {
    case 'button':
      return Components.Button?.create(config);
    case 'card':
      return Components.Card?.create(config);
    case 'game-card':
      return Components.Card?.createGame(config);
    case 'modal':
      return Components.Modal?.create(config);
    case 'input':
      return Components.Input?.text(config);
    case 'select':
      return Components.Input?.select(config);
    case 'badge':
      return Components.Badge?.create(config);
    case 'team-badge':
      return Components.Badge?.team(config.teamNumber, config.label);
    case 'toast':
      return Components.Toast?.show(config.message, config.type, config.duration);
    case 'player-item':
      return Components.PlayerItem?.create(config);
    case 'score-row':
      return Components.PlayerItem?.createScoreRow(config);
    default:
      console.warn(`[Components] Unknown component type: ${type}`);
      return null;
  }
}

// Auto-detect script loading
if (typeof window !== 'undefined') {
  window.FGComponents = Components;
  window.createComponent = createComponent;
  window.initComponents = initComponents;
}

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Components,
    initComponents,
    createComponent,
  };
}