/**
 * Button Component
 * Creates consistent buttons with proper variants and accessibility.
 * 
 * @example
 * // Primary button
 * const btn = Button({ text: 'بدء اللعبة', variant: 'primary', icon: 'fa-play' });
 * 
 * // Icon-only button
 * const iconBtn = Button({ icon: 'fa-cog', variant: 'outline', ariaLabel: 'Settings' });
 */

const Button = (() => {
  const VARIANTS = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    success: 'btn-success',
    danger: 'btn-danger',
    outline: 'btn-outline-secondary',
    'outline-primary': 'btn-outline-primary',
    'outline-info': 'btn-outline-info',
  };

  const SIZES = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  };

  /**
   * Create a button element.
   * @param {Object} options
   * @param {string} [options.text] - Button text content
   * @param {string} [options.icon] - Font Awesome icon class (e.g., 'fa-play')
   * @param {string} [options.variant='primary'] - Button variant
   * @param {string} [options.size='md'] - Button size (sm, md, lg)
   * @param {string} [options.ariaLabel] - Accessibility label (required for icon-only)
   * @param {boolean} [options.disabled=false] - Disabled state
   * @param {boolean} [options.fullWidth=false] - Full width button
   * @param {Object} [options.attrs] - Additional HTML attributes
   * @param {Function} [options.onClick] - Click handler
   * @returns {HTMLButtonElement}
   */
  function create({
    text = '',
    icon = '',
    variant = 'primary',
    size = 'md',
    ariaLabel = '',
    disabled = false,
    fullWidth = false,
    attrs = {},
    onClick = null,
  } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    
    // Add variant class
    const variantClass = VARIANTS[variant] || VARIANTS.primary;
    btn.classList.add(variantClass);
    
    // Add size class
    const sizeClass = SIZES[size];
    if (sizeClass) btn.classList.add(sizeClass);
    
    // Full width
    if (fullWidth) btn.classList.add('w-100');
    
    // Build content
    if (icon) {
      const iconEl = document.createElement('i');
      iconEl.className = `fas ${icon}`;
      if (text) {
        btn.appendChild(iconEl);
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(document.createTextNode(text));
      } else {
        btn.appendChild(iconEl);
        if (!ariaLabel) {
          console.warn('Icon-only buttons require ariaLabel for accessibility');
        }
      }
    } else {
      btn.textContent = text;
    }
    
    // Accessibility
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    
    // Disabled state
    if (disabled) btn.disabled = true;
    
    // Additional attributes
    Object.entries(attrs).forEach(([key, value]) => {
      btn.setAttribute(key, value);
    });
    
    // Click handler
    if (onClick) {
      btn.addEventListener('click', onClick);
    }
    
    return btn;
  }

  /**
   * Create a button group container.
   * @param {Array<HTMLButtonElement>} buttons - Buttons to group
   * @param {string} [gap='1rem'] - Gap between buttons
   * @returns {HTMLDivElement}
   */
  function createGroup(buttons, gap = '1rem') {
    const group = document.createElement('div');
    group.className = 'd-flex gap-2 justify-content-center flex-wrap';
    group.style.gap = gap;
    buttons.forEach(btn => group.appendChild(btn));
    return group;
  }

  return { create, createGroup, VARIANTS, SIZES };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Button;
}