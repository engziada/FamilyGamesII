/**
 * Timer Module — countdown timer with visual progress bar.
 *
 * Server-side timers in Convex handle authoritative timeouts;
 * this is purely a UI indicator synced from game state.
 */

const timer = (() => {
  let _interval = null;
  let _remaining = 0;
  let _total = 0;
  let _onTick = null;
  let _onComplete = null;

  /**
   * Start a countdown timer.
   * @param {number} durationSec - Duration in seconds.
   * @param {object} opts - Options.
   * @param {function} [opts.onTick] - Called every second with (remaining, total).
   * @param {function} [opts.onComplete] - Called when timer reaches 0.
   */
  function start(durationSec, opts = {}) {
    stop();
    _total = durationSec;
    _remaining = durationSec;
    _onTick = opts.onTick || null;
    _onComplete = opts.onComplete || null;

    updateDisplay();

    _interval = setInterval(() => {
      _remaining = Math.max(0, _remaining - 1);
      updateDisplay();

      if (_remaining <= 0) {
        stop();
        if (_onComplete) _onComplete();
      }
    }, 1000);
  }

  /**
   * Stop the timer.
   */
  function stop() {
    if (_interval) {
      clearInterval(_interval);
      _interval = null;
    }
  }

  /**
   * Get remaining seconds.
   * @returns {number}
   */
  function getRemaining() {
    return _remaining;
  }

  /**
   * Update the timer display elements.
   */
  function updateDisplay() {
    const timerEl = document.getElementById('timer-display');
    const barEl = document.getElementById('timer-bar');

    if (timerEl) {
      const mins = Math.floor(_remaining / 60);
      const secs = _remaining % 60;
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

      // Color coding
      if (_remaining <= 10) {
        timerEl.classList.add('text-danger');
        timerEl.classList.remove('text-warning');
      } else if (_remaining <= 30) {
        timerEl.classList.add('text-warning');
        timerEl.classList.remove('text-danger');
      } else {
        timerEl.classList.remove('text-danger', 'text-warning');
      }
    }

    if (barEl && _total > 0) {
      const pct = (_remaining / _total) * 100;
      barEl.style.width = `${pct}%`;
      barEl.setAttribute('aria-valuenow', pct);

      if (pct <= 20) {
        barEl.className = 'progress-bar bg-danger';
      } else if (pct <= 50) {
        barEl.className = 'progress-bar bg-warning';
      } else {
        barEl.className = 'progress-bar bg-success';
      }
    }

    if (_onTick) _onTick(_remaining, _total);
  }

  return { start, stop, getRemaining };
})();
