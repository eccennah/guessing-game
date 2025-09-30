// sessions.js
// Simple in-memory session manager

const sessions = {};

// Create a new session
function createSession(sessionId, gameMasterId, gameMasterName) {
  sessions[sessionId] = {
    players: [{ id: gameMasterId, name: gameMasterName, score: 0, attemptsLeft: 3 }],
    gameMasterId,
    currentQuestion: null,
    answer: null,
    state: "waiting", // waiting | ready | running
  };
}

// Add a player
function addPlayer(sessionId, playerId, playerName) {
  const s = sessions[sessionId];
  if (!s) return null;
  s.players.push({ id: playerId, name: playerName, score: 0, attemptsLeft: 3 });
  return s;
}

// Remove a player
function removePlayer(sessionId, playerId) {
  const s = sessions[sessionId];
  if (!s) return;
  s.players = s.players.filter((p) => p.id !== playerId);
  if (s.players.length === 0) delete sessions[sessionId];
}

// Reset attempts for all players
function resetAttempts(sessionId) {
  const s = sessions[sessionId];
  if (!s) return;
  s.players.forEach((p) => (p.attemptsLeft = 3));
}

module.exports = {
  sessions,
  createSession,
  addPlayer,
  removePlayer,
  resetAttempts,
};
