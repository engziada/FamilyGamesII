/**
 * Sound Module — manages background music and sound effects.
 *
 * Enhancement F-05: Sound/music controls with mute toggle and volume slider.
 */

const sound = (() => {
  const _sounds = {};
  let _muted = localStorage.getItem('gameSoundMuted') === 'true';
  let _volume = parseFloat(localStorage.getItem('gameSoundVolume') || '0.5');

  /**
   * Preload a sound file.
   * @param {string} name - Sound identifier.
   * @param {string} src - Path to audio file.
   * @param {boolean} [loop=false] - Whether to loop.
   */
  function preload(name, src, loop = false) {
    const audio = new Audio(src);
    audio.loop = loop;
    audio.volume = _muted ? 0 : _volume;
    audio.preload = 'auto';
    _sounds[name] = audio;
  }

  /**
   * Play a sound.
   * @param {string} name - Sound identifier.
   */
  function play(name) {
    const audio = _sounds[name];
    if (!audio) return;
    audio.volume = _muted ? 0 : _volume;
    audio.currentTime = 0;
    audio.play().catch(() => { /* autoplay blocked */ });
  }

  /**
   * Stop a sound.
   * @param {string} name - Sound identifier.
   */
  function stop(name) {
    const audio = _sounds[name];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  /**
   * Toggle mute state.
   * @returns {boolean} New muted state.
   */
  function toggleMute() {
    _muted = !_muted;
    localStorage.setItem('gameSoundMuted', _muted);
    Object.values(_sounds).forEach((a) => { a.volume = _muted ? 0 : _volume; });
    return _muted;
  }

  /**
   * Set volume (0.0 - 1.0).
   * @param {number} vol - Volume level.
   */
  function setVolume(vol) {
    _volume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('gameSoundVolume', _volume);
    if (!_muted) {
      Object.values(_sounds).forEach((a) => { a.volume = _volume; });
    }
  }

  /**
   * Get current state.
   * @returns {{muted: boolean, volume: number}}
   */
  function getState() {
    return { muted: _muted, volume: _volume };
  }

  /**
   * Initialize default game sounds.
   */
  function initDefaults() {
    preload('background', '/static/sounds/background.mp3', true);
    preload('correct', '/static/sounds/guessed.mp3');
    preload('timeout', '/static/sounds/timeout.mp3');
  }

  return { preload, play, stop, toggleMute, setVolume, getState, initDefaults };
})();
