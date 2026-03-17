/**
 * Convex Client — singleton wrapper for the Convex browser SDK.
 *
 * Provides reactive subscriptions and mutation helpers used by all game modules.
 * The CONVEX_URL is injected by Flask into the page template.
 */

/* global ConvexClient */

var convex = (() => {
  let _client = null;
  let _subscriptions = [];

  /**
   * Initialize the Convex client.
   * @param {string} url - Convex deployment URL (from window.__CONVEX_URL__).
   * @returns {object} ConvexHttpClient instance.
   */
  function init(url) {
    if (_client) return _client;
    if (!url) {
      console.error('[Convex] No CONVEX_URL provided');
      return null;
    }
    _client = new ConvexClientClass(url);
    console.log('[Convex] Client initialized');
    return _client;
  }

  /**
   * Get the initialized client (throws if not initialized).
   * @returns {object} ConvexHttpClient instance.
   */
  function client() {
    if (!_client) throw new Error('[Convex] Client not initialized — call convex.init(url) first');
    return _client;
  }

  /**
   * Subscribe to a Convex query with reactive updates.
   * @param {string} queryName - Fully-qualified query name (e.g., "rooms:getRoom").
   * @param {object} args - Query arguments.
   * @param {function} callback - Called with (result) on every update.
   * @returns {function} Unsubscribe function.
   */
  function subscribe(queryName, args, callback) {
    const c = client();
    const unsub = c.onUpdate(queryName, args, callback);
    _subscriptions.push(unsub);
    return unsub;
  }

  /**
   * Call a Convex mutation.
   * @param {string} mutationName - Fully-qualified mutation name.
   * @param {object} args - Mutation arguments.
   * @returns {Promise<any>} Mutation result.
   */
  async function mutate(mutationName, args) {
    const c = client();
    return await c.mutation(mutationName, args);
  }

  /**
   * One-shot query (no subscription).
   * @param {string} queryName - Fully-qualified query name.
   * @param {object} args - Query arguments.
   * @returns {Promise<any>} Query result.
   */
  async function query(queryName, args) {
    const c = client();
    return await c.query(queryName, args);
  }

  /**
   * Unsubscribe from all active subscriptions (cleanup).
   */
  function cleanupAll() {
    _subscriptions.forEach((unsub) => {
      try { unsub(); } catch (e) { /* ignore */ }
    });
    _subscriptions = [];
  }

  return { init, client, subscribe, mutate, query, cleanupAll };
})();
