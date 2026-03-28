/**
 * Card Component
 * Creates consistent card elements with the signature asymmetric border-radius.
 * 
 * @example
 * // Simple card
 * const card = Card({ title: 'Game Title', body: 'Description here' });
 * 
 * // Game card with icon
 * const gameCard = Card.game({ title: 'بدون كلام', icon: 'fa-mask', players: '2-8' });
 */

const Card = (() => {
  /**
   * Create a basic card element.
   * @param {Object} options
   * @param {string} [options.title] - Card title
   * @param {string} [options.subtitle] - Card subtitle
   * @param {string|Element} [options.body] - Card body content
   * @param {string} [options.footer] - Card footer content
   * @param {string} [options.icon] - Font Awesome icon class
   * @param {boolean} [options.hoverable=false] - Enable hover effects
   * @param {Object} [options.attrs] - Additional HTML attributes
   * @returns {HTMLDivElement}
   */
  function create({
    title = '',
    subtitle = '',
    body = '',
    footer = '',
    icon = '',
    hoverable = false,
    attrs = {},
  } = {}) {
    const card = document.createElement('div');
    card.className = 'card';
    if (hoverable) card.classList.add('card-hoverable');
    
    // Apply attributes
    Object.entries(attrs).forEach(([key, value]) => {
      card.setAttribute(key, value);
    });
    
    // Card body
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    // Icon (if provided)
    if (icon) {
      const iconEl = document.createElement('div');
      iconEl.className = 'game-icon';
      iconEl.innerHTML = `<i class="fas ${icon}"></i>`;
      cardBody.appendChild(iconEl);
    }
    
    // Title
    if (title) {
      const titleEl = document.createElement('h3');
      titleEl.className = 'card-title';
      titleEl.textContent = title;
      cardBody.appendChild(titleEl);
    }
    
    // Subtitle
    if (subtitle) {
      const subtitleEl = document.createElement('p');
      subtitleEl.className = 'text-muted';
      subtitleEl.textContent = subtitle;
      cardBody.appendChild(subtitleEl);
    }
    
    // Body content
    if (body) {
      const bodyContainer = document.createElement('div');
      bodyContainer.className = 'card-text';
      if (typeof body === 'string') {
        bodyContainer.innerHTML = body;
      } else {
        bodyContainer.appendChild(body);
      }
      cardBody.appendChild(bodyContainer);
    }
    
    card.appendChild(cardBody);
    
    // Footer
    if (footer) {
      const footerEl = document.createElement('div');
      footerEl.className = 'card-footer';
      if (typeof footer === 'string') {
        footerEl.innerHTML = footer;
      } else {
        footerEl.appendChild(footer);
      }
      card.appendChild(footerEl);
    }
    
    return card;
  }

  /**
   * Create a game card for the catalog grid.
   * @param {Object} options
   * @param {string} options.title - Game title (Arabic)
   * @param {string} options.icon - Font Awesome icon class
   * @param {string} [options.players='2-8 لاعبين'] - Player count text
   * @param {string} [options.badge] - Optional badge text (e.g., 'وجهاً لوجه')
   * @param {boolean} [options.disabled=false] - Disabled/under maintenance
   * @param {Function} [options.onPlay] - Play button click handler
   * @param {Function} [options.onRules] - Rules button click handler
   * @returns {HTMLDivElement}
   */
  function createGame({
    title,
    icon,
    players = '2-8 لاعبين',
    badge = '',
    disabled = false,
    onPlay = null,
    onRules = null,
  }) {
    const col = document.createElement('div');
    col.className = 'col-sm-6 col-lg-4 col-xl-3';
    
    const card = document.createElement('div');
    card.className = `card h-100 game-card animate__animated animate__fadeInUp${disabled ? ' opacity-50' : ''}`;
    card.style.cssText = 'position:relative;overflow:hidden;';
    
    // Maintenance ribbon
    if (disabled) {
      const ribbon = document.createElement('div');
      ribbon.style.cssText = 'position:absolute;top:12px;right:-35px;transform:rotate(45deg);background:#dc3545;color:#fff;padding:2px 40px;font-size:0.75rem;font-weight:700;z-index:2;box-shadow:0 2px 4px rgba(0,0,0,.2);';
      ribbon.textContent = 'تحت الصيانة';
      card.appendChild(ribbon);
    }
    
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body text-center d-flex flex-column';
    
    // Icon
    const iconContainer = document.createElement('div');
    iconContainer.className = 'mb-3';
    iconContainer.innerHTML = `<i class="fas ${icon} fa-3x ${disabled ? 'text-muted' : 'text-primary'}"></i>`;
    cardBody.appendChild(iconContainer);
    
    // Title
    const titleEl = document.createElement('h5');
    titleEl.className = 'card-title';
    titleEl.textContent = title;
    cardBody.appendChild(titleEl);
    
    // Badge (e.g., face-to-face)
    if (badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'badge bg-info mb-2';
      badgeEl.innerHTML = `<i class="fas fa-users"></i> ${badge}`;
      cardBody.appendChild(badgeEl);
    }
    
    // Player count
    const metaContainer = document.createElement('div');
    metaContainer.className = 'mt-auto';
    
    const playersEl = document.createElement('span');
    playersEl.className = 'text-muted d-block mb-2';
    playersEl.innerHTML = `<i class="fas fa-users"></i> ${players}`;
    metaContainer.appendChild(playersEl);
    
    // Buttons
    if (disabled) {
      const disabledBtn = document.createElement('button');
      disabledBtn.className = 'btn btn-secondary w-100 mb-1';
      disabledBtn.disabled = true;
      disabledBtn.innerHTML = '<i class="fas fa-wrench"></i> تحت الصيانة';
      metaContainer.appendChild(disabledBtn);
    } else {
      const playBtn = document.createElement('button');
      playBtn.className = 'btn btn-primary w-100 mb-1';
      playBtn.innerHTML = '<i class="fas fa-plus"></i> لعبة جديدة';
      if (onPlay) playBtn.addEventListener('click', onPlay);
      metaContainer.appendChild(playBtn);
    }
    
    const rulesBtn = document.createElement('button');
    rulesBtn.className = 'btn btn-outline-info btn-sm w-100';
    rulesBtn.innerHTML = '<i class="fas fa-question-circle"></i> كيف تلعب؟';
    if (onRules) rulesBtn.addEventListener('click', onRules);
    metaContainer.appendChild(rulesBtn);
    
    cardBody.appendChild(metaContainer);
    card.appendChild(cardBody);
    col.appendChild(card);
    
    return col;
  }

  /**
   * Create a player list card.
   * @param {string} title - Card header title
   * @returns {HTMLDivElement}
   */
  function createPlayerList(title = 'اللاعبين') {
    const card = document.createElement('div');
    card.className = 'card mb-3';
    
    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `<i class="fas fa-users"></i> ${title}`;
    card.appendChild(header);
    
    const list = document.createElement('ul');
    list.className = 'list-group list-group-flush';
    list.id = 'player-list';
    card.appendChild(list);
    
    return card;
  }

  /**
   * Create a scoreboard card.
   * @param {string} title - Card header title
   * @returns {HTMLDivElement}
   */
  function createScoreboard(title = 'النتائج') {
    const card = document.createElement('div');
    card.className = 'card mb-3';
    
    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `<i class="fas fa-trophy"></i> ${title}`;
    card.appendChild(header);
    
    const body = document.createElement('div');
    body.className = 'card-body p-0';
    
    const table = document.createElement('table');
    table.className = 'table table-sm mb-0';
    
    const tbody = document.createElement('tbody');
    tbody.id = 'scoreboard';
    table.appendChild(tbody);
    body.appendChild(table);
    card.appendChild(body);
    
    return card;
  }

  return {
    create,
    createGame,
    createPlayerList,
    createScoreboard,
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Card;
}