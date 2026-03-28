/**
 * Modal Component
 * Creates consistent modal dialogs with the signature asymmetric border-radius.
 * 
 * @example
 * // Create a modal
 * const modal = Modal.create({
 *   id: 'confirm-modal',
 *   title: 'تأكيد',
 *   body: '<p>هل أنت متأكد؟</p>',
 *   buttons: [{ text: 'إلغاء', variant: 'secondary' }, { text: 'تأكيد', variant: 'primary', onClick: () => {} }]
 * });
 * modal.show();
 */

const Modal = (() => {
  /**
   * Create a modal element.
   * @param {Object} options
   * @param {string} options.id - Modal ID
   * @param {string} [options.title] - Modal title
   * @param {string|Element} [options.body] - Modal body content
   * @param {Array<Object>} [options.buttons] - Footer buttons
   * @param {string} [options.size=''] - Modal size ('modal-sm', 'modal-lg', 'modal-xl')
   * @param {boolean} [options.scrollable=true] - Enable body scrolling
   * @param {boolean} [options.centered=true] - Center vertically
   * @returns {Object} Modal API { element, show, hide }
   */
  function create({
    id,
    title = '',
    body = '',
    buttons = [],
    size = '',
    scrollable = true,
    centered = true,
  } = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = id;
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', `${id}-label`);
    modal.setAttribute('aria-hidden', 'true');
    
    const dialogClass = `modal-dialog${centered ? ' modal-dialog-centered' : ''}${scrollable ? ' modal-dialog-scrollable' : ''}${size ? ` ${size}` : ''}`;
    
    const dialog = document.createElement('div');
    dialog.className = dialogClass;
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    // Header
    if (title) {
      const header = document.createElement('div');
      header.className = 'modal-header';
      header.innerHTML = `
        <h5 class="modal-title" id="${id}-label">${title}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="إغلاق"></button>
      `;
      content.appendChild(header);
    }
    
    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-body';
    if (typeof body === 'string') {
      bodyEl.innerHTML = body;
    } else if (body instanceof Element) {
      bodyEl.appendChild(body);
    }
    content.appendChild(bodyEl);
    
    // Footer with buttons
    if (buttons.length > 0) {
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      buttons.forEach(btn => {
        const btnEl = document.createElement('button');
        btnEl.type = 'button';
        btnEl.className = `btn btn-${btn.variant || 'secondary'}`;
        btnEl.textContent = btn.text;
        if (btn.onClick) {
          btnEl.addEventListener('click', btn.onClick);
        }
        if (btn.dismiss) {
          btnEl.setAttribute('data-bs-dismiss', 'modal');
        }
        footer.appendChild(btnEl);
      });
      content.appendChild(footer);
    }
    
    dialog.appendChild(content);
    modal.appendChild(dialog);
    
    let bsModal = null;
    
    return {
      element: modal,
      show() {
        if (!bsModal) {
          document.body.appendChild(modal);
          bsModal = new bootstrap.Modal(modal);
        }
        bsModal.show();
      },
      hide() {
        if (bsModal) bsModal.hide();
      },
      destroy() {
        if (bsModal) {
          bsModal.dispose();
          bsModal = null;
        }
        modal.remove();
      },
    };
  }

  /**
   * Create a confirmation modal.
   * @param {Object} options
   * @param {string} [options.title='تأكيد'] - Modal title
   * @param {string} [options.message='هل أنت متأكد؟'] - Confirmation message
   * @param {string} [options.confirmText='تأكيد'] - Confirm button text
   * @param {string} [options.cancelText='إلغاء'] - Cancel button text
   * @param {Function} [options.onConfirm] - Confirm callback
   * @returns {Object} Modal API
   */
  function confirm({
    title = 'تأكيد',
    message = 'هل أنت متأكد؟',
    confirmText = 'تأكيد',
    cancelText = 'إلغاء',
    onConfirm = () => {},
  } = {}) {
    const id = `confirm-${Date.now()}`;
    return create({
      id,
      title,
      body: `<p class="text-center">${message}</p>`,
      buttons: [
        { text: cancelText, variant: 'secondary', dismiss: true },
        { text: confirmText, variant: 'primary', onClick: onConfirm },
      ],
    });
  }

  /**
   * Create an alert modal.
   * @param {Object} options
   * @param {string} [options.title] - Modal title
   * @param {string} [options.message] - Alert message
   * @param {string} [options.icon] - Font Awesome icon class
   * @param {string} [options.buttonText='حسناً'] - Button text
   * @returns {Object} Modal API
   */
  function alert({
    title = '',
    message = '',
    icon = '',
    buttonText = 'حسناً',
  } = {}) {
    const id = `alert-${Date.now()}`;
    const bodyContent = icon 
      ? `<div class="text-center"><i class="fas ${icon} fa-3x mb-3 text-primary"></i><p>${message}</p></div>`
      : `<p class="text-center">${message}</p>`;
    
    return create({
      id,
      title,
      body: bodyContent,
      buttons: [{ text: buttonText, variant: 'primary', dismiss: true }],
      size: 'modal-sm',
    });
  }

  return { create, confirm, alert };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Modal;
}