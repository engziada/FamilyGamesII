/**
 * Input Component
 * Creates consistent form inputs with proper styling and accessibility.
 * 
 * @example
 * // Text input
 * const input = Input.text({ id: 'player-name', label: 'اسمك', placeholder: 'اكتب اسمك هنا...' });
 * 
 * // Select input
 * const select = Input.select({ id: 'game-type', options: [{ value: 'charades', label: 'بدون كلام' }] });
 */

const Input = (() => {
  /**
   * Create a text input field.
   * @param {Object} options
   * @param {string} options.id - Input ID
   * @param {string} [options.label] - Label text
   * @param {string} [options.placeholder] - Placeholder text
   * @param {string} [options.value] - Initial value
   * @param {boolean} [options.required=false] - Required field
   * @param {boolean} [options.disabled=false] - Disabled state
   * @param {string} [options.type='text'] - Input type
   * @param {string} [options.helperText] - Helper text below input
   * @param {Object} [options.attrs] - Additional HTML attributes
   * @returns {HTMLDivElement} Input group container
   */
  function text({
    id,
    label = '',
    placeholder = '',
    value = '',
    required = false,
    disabled = false,
    type = 'text',
    helperText = '',
    attrs = {},
  } = {}) {
    const group = document.createElement('div');
    group.className = 'input-group mb-3';
    
    // Label
    if (label) {
      const labelEl = document.createElement('label');
      labelEl.className = 'form-label';
      labelEl.htmlFor = id;
      labelEl.textContent = label;
      if (required) {
        labelEl.textContent += ' *';
      }
      group.appendChild(labelEl);
    }
    
    // Input
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.name = id;
    input.className = 'form-control form-control-lg text-center';
    input.placeholder = placeholder;
    if (value) input.value = value;
    if (required) input.required = true;
    if (disabled) input.disabled = true;
    input.dir = 'rtl';
    
    // Apply attributes
    Object.entries(attrs).forEach(([key, val]) => {
      input.setAttribute(key, val);
    });
    
    group.appendChild(input);
    
    // Helper text
    if (helperText) {
      const helper = document.createElement('small');
      helper.className = 'text-muted mt-1';
      helper.textContent = helperText;
      group.appendChild(helper);
    }
    
    return group;
  }

  /**
   * Create a select dropdown.
   * @param {Object} options
   * @param {string} options.id - Select ID
   * @param {string} [options.label] - Label text
   * @param {Array<{value: string, label: string}>} options.options - Options array
   * @param {string} [options.selectedValue] - Pre-selected value
   * @param {boolean} [options.required=false] - Required field
   * @param {Object} [options.attrs] - Additional HTML attributes
   * @returns {HTMLDivElement} Select group container
   */
  function select({
    id,
    label = '',
    options = [],
    selectedValue = '',
    required = false,
    attrs = {},
  } = {}) {
    const group = document.createElement('div');
    group.className = 'input-group mb-3';
    
    // Label
    if (label) {
      const labelEl = document.createElement('label');
      labelEl.className = 'form-label';
      labelEl.htmlFor = id;
      labelEl.textContent = label;
      if (required) labelEl.textContent += ' *';
      group.appendChild(labelEl);
    }
    
    // Select
    const selectEl = document.createElement('select');
    selectEl.id = id;
    selectEl.name = id;
    selectEl.className = 'form-select';
    if (required) selectEl.required = true;
    
    // Options
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === selectedValue) option.selected = true;
      selectEl.appendChild(option);
    });
    
    // Apply attributes
    Object.entries(attrs).forEach(([key, val]) => {
      selectEl.setAttribute(key, val);
    });
    
    group.appendChild(selectEl);
    return group;
  }

  /**
   * Create a styled game input (for game-specific inputs like bus complete).
   * @param {Object} options
   * @param {string} [options.placeholder] - Placeholder text
   * @param {string} [options.value] - Initial value
   * @param {boolean} [options.disabled=false] - Disabled state
   * @returns {HTMLInputElement}
   */
  function createGameInput({ placeholder = '', value = '', disabled = false } = {}) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'bus-input form-control';
    input.placeholder = placeholder;
    if (value) input.value = value;
    if (disabled) input.disabled = true;
    input.dir = 'rtl';
    return input;
  }

  return { text, select, createGameInput };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Input;
}