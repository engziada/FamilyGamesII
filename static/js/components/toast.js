/**
 * Toast Component
 * Creates consistent toast notifications.
 * 
 * @example
 * // Success toast
 * Toast.show('تم النسخ!', 'success');
 * 
 * // Error toast
 * Toast.show('حدث خطأ', 'error');
 */

const Toast = (() => {
  const COLORS = {
    info: 'bg-info',
    success: 'bg-success',
    error: 'bg-danger',
    warning: 'bg-warning',
  };

  const ICONS = {
    info: 'fa-info-circle',
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
  };

  let container = null;

  /**
   * Get or create the toast container.
   * @returns {HTMLDivElement}
   */
  function getContainer() {
    if (!container) {
      container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1100';
        document.body.appendChild(container);
      }
    }
    return container;
  }

  /**
   * Show a toast notification.
   * @param {string} message - Toast message
   * @param {string} [type='info'] - Toast type: 'info', 'success', 'error', 'warning'
   * @param {number} [duration=4000] - Duration in ms
   * @returns {HTMLDivElement}
   */
  function show(message, type = 'info', duration = 4000) {
    const containerEl = getContainer();
    const colorClass = COLORS[type] || COLORS.info;
    const icon = ICONS[type] || ICONS.info;

    const toast = document.createElement('div');
    toast.className = `toast show align-items-center text-white ${colorClass} border-0 mb-2`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
      <div class="d-flex align-items-center">
        <i class="fas ${icon} me-2"></i>
        <div class="toast-body flex-grow-1">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="إغلاق"></button>
      </div>
    `;

    containerEl.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);

    // Close button
    const closeBtn = toast.querySelector('[data-bs-dismiss="toast"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      });
    }

    return toast;
  }

  /**
   * Show a success toast.
   * @param {string} message
   */
  function success(message) {
    return show(message, 'success');
  }

  /**
   * Show an error toast.
   * @param {string} message
   */
  function error(message) {
    return show(message, 'error');
  }

  /**
   * Show a warning toast.
   * @param {string} message
   */
  function warning(message) {
    return show(message, 'warning');
  }

  /**
   * Show an info toast.
   * @param {string} message
   */
  function info(message) {
    return show(message, 'info');
  }

  return { show, success, error, warning, info, COLORS, ICONS };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Toast;
}