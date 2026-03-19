/**
 * Lobby Module — handles room creation, joining, and preview.
 *
 * Uses Convex mutations/queries via convexClient.js.
 */

/* global convex, api, gameUI */

const lobby = (() => {
  /**
   * Create a new game room.
   * @param {string} gameType - Game type key.
   * @param {string} playerName - Host player name.
   * @param {object} [settings] - Optional game settings.
   * @returns {Promise<string>} Room ID.
   */
  async function createRoom(gameType, playerName, settings = {}) {
    if (!playerName.trim()) {
      throw new Error('اسم اللاعب مطلوب');
    }
    const roomId = await convex.mutate(api.rooms.createRoom, {
      gameType,
      hostName: playerName.trim(),
      settings: settings || {},
    });
    return roomId;
  }

  /**
   * Join an existing room.
   * @param {string} roomId - Convex room ID.
   * @param {string} playerName - Player name.
   */
  async function joinRoom(roomId, playerName) {
    if (!playerName.trim()) {
      throw new Error('اسم اللاعب مطلوب');
    }
    await convex.mutate(api.rooms.joinRoom, {
      roomId,
      playerName: playerName.trim(),
    });
  }

  /**
   * Get room preview (for join modal).
   * @param {string} roomId - Convex room ID.
   * @returns {Promise<object|null>} Room preview data.
   */
  async function getRoomPreview(roomId) {
    return await convex.query(api.rooms.getRoomPreview, { roomId });
  }

  /**
   * Get room by short code (for join by code feature).
   * @param {string} roomCode - 4-digit room code.
   * @returns {Promise<object|null>} Room preview data with roomId.
   */
  async function getRoomByCode(roomCode) {
    return await convex.query(api.rooms.getRoomByCode, { roomCode });
  }

  /**
   * Navigate to the game page.
   * @param {string} roomId - Convex room ID.
   * @param {string} playerName - Player name.
   * @param {string} gameType - Game type key.
   */
  function navigateToGame(roomId, playerName, gameType) {
    const url = `/game/${roomId}?player_name=${encodeURIComponent(playerName)}&game_type=${encodeURIComponent(gameType)}`;
    window.location.href = url;
  }

  /**
   * Leave a room.
   * @param {string} roomId - Convex room ID.
   * @param {string} playerName - Player name.
   */
  async function leaveRoom(roomId, playerName) {
    try {
      await convex.mutate(api.rooms.leaveRoom, { roomId, playerName });
    } catch (e) {
      console.warn('[Lobby] leaveRoom error:', e.message);
    }
  }

  /**
   * Close a room (host only).
   * @param {string} roomId - Convex room ID.
   * @param {string} playerName - Host player name.
   */
  async function closeRoom(roomId, playerName) {
    try {
      await convex.mutate(api.rooms.closeRoom, { roomId, playerName });
    } catch (e) {
      console.warn('[Lobby] closeRoom error:', e.message);
    }
  }

  return { createRoom, joinRoom, getRoomPreview, getRoomByCode, navigateToGame, leaveRoom, closeRoom };
})();
