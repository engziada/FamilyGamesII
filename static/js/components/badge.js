/**
 * Badge Component
 * Creates consistent badges for labels, statuses, and team indicators.
 * 
 * @example
 * // Status badge
 * const badge = Badge.create({ text: 'مستخدم جديد', variant: 'info' });
 * 
 * // Team badge
 * const teamBadge = Badge.team(1);
 */

const Badge = (() => {
  const VARIANTS = {
    default: 'badge',
    primary: 'badge bg-primary',
    secondary: 'badge bg-secondary',
    success: 'badge bg-success',
    danger: 'badge bg-danger',
    warning: 'badge bg-warning text-dark',
    info: 'badge bg-info',
    light: 'badge bg-light text-dark',
    dark: 'badge bg-dark',
    team1: 'badge badge-team-1',
    team2: 'badge badge-team-2',
    team3: 'badge badge-team-3',
  };

  /**
   * Create a badge element.
   * @param {Object} options
   * @param {string} [options.text=''] - Badge text
   * @param {string} [options.variant='default'] - Badge variant
   * @param {string} [options.icon=''] - Font Awesome icon class
   * @param {boolean} [options.pill=false] - Pill-shaped badge
   * @returns {HTMLSpanElement}
   */
  function create({ text = '', variant = 'default', icon = '', pill = false } = {}) {
    const badge = document.createElement('span');
    badge.className = VARIANTS[variant] || VARIANTS.default;
    if (pill) badge.classList.add('rounded-pill');
    
    if (icon) {
      badge.innerHTML = `<i class="fas ${icon}"></i>${text ? ' ' + text : ''}`;
    } else {
      badge.textContent = text;
    }
    
    return badge;
  }

  /**
   * Create a team badge.
   * @param {number} teamNumber - Team number (1-3)
   * @param {string} [label=''] - Optional custom label
   * @returns {HTMLSpanElement}
   */
  function team(teamNumber, label = '') {
    const variant = `team${teamNumber}`;
    const defaultLabels = { 1: 'الفريق 1', 2: 'الفريق 2', 3: 'الفريق 3' };
    return create({
      text: label || defaultLabels[teamNumber] || `فريق ${teamNumber}`,
      variant,
    });
  }

  /**
   * Create a host badge.
   * @returns {HTMLSpanElement}
   */
  function host() {
    return create({ text: 'مضيف', variant: 'warning' });
  }

  /**
   * Create a score badge.
   * @param {number} score - Player score
   * @returns {HTMLSpanElement}
   */
  function score(score) {
    const badge = document.createElement('span');
    badge.className = 'badge bg-primary rounded-pill';
    badge.textContent = score;
    return badge;
  }

  /**
   * Create a medal badge for scoreboard.
   * @param {number} rank - Player rank (1, 2, 3)
   * @returns {string} Medal emoji or rank
   */
  function medal(rank) {
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    return medals[rank] || rank.toString();
  }

  return { create, team, host, score, medal, VARIANTS };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Badge;
}