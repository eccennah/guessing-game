// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {
  sessions,
  createSession,
  addPlayer,
  removePlayer,
  resetAttempts,
} = require("./sessions");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 4000;

io.on("connection", (socket) => {
  console.log("New client:", socket.id);

  // Join or create session
  socket.on("join_session", ({ sessionId, name }, cb) => {
    if (!sessionId) return cb({ status: "error", message: "No sessionId" });

    if (!sessions[sessionId]) {
      // First player is Game Master
      createSession(sessionId, socket.id, name);
    } else {
      addPlayer(sessionId, socket.id, name);
    }

    socket.join(sessionId);
    cb({ status: "ok" });
    updateSession(sessionId);
  });

  // Gamemaster sets question
  socket.on("set_question", ({ sessionId, question, answer }, cb) => {
    const s = sessions[sessionId];
    if (!s) return cb({ status: "error", message: "No session" });
    if (s.gameMasterId !== socket.id)
      return cb({ status: "error", message: "Only GM can set question" });

    s.currentQuestion = question;
    s.answer = answer;
    s.state = "ready";
    resetAttempts(sessionId);

    io.to(sessionId).emit("question_set", { question });
    cb({ status: "ok" });
    updateSession(sessionId);
  });

  // Gamemaster starts game
  socket.on("start_game", ({ sessionId, time }, cb) => {
    const s = sessions[sessionId];
    if (!s) return cb({ status: "error", message: "No session" });
    if (s.gameMasterId !== socket.id)
      return cb({ status: "error", message: "Only GM can start" });

    s.state = "running";

    io.to(sessionId).emit("game_started", {
      question: s.currentQuestion,
      timeLeft: time,
    });
    cb({ status: "ok" });

    // Timer
    let countdown = time;
    const interval = setInterval(() => {
      countdown--;
      io.to(sessionId).emit("timer_tick", { timeLeft: countdown });

      if (countdown <= 0 || s.state !== "running") {
        clearInterval(interval);
        io.to(sessionId).emit("round_end", {
          winner: null,
          answer: s.answer,
          reason: "Time up",
        });
        s.currentQuestion = null;
        s.answer = null;
        s.state = "waiting";
        updateSession(sessionId);
      }
    }, 1000);
  });

  // Player submits guess
  socket.on("submit_answer", ({ sessionId, guess }, cb) => {
    const s = sessions[sessionId];
    if (!s) return cb({ status: "error", message: "No session" });
    if (s.state !== "running")
      return cb({ status: "error", message: "No active round" });

    const player = s.players.find((p) => p.id === socket.id);
    if (!player) return cb({ status: "error", message: "Not in session" });

    if (player.attemptsLeft <= 0)
      return cb({ status: "error", message: "No attempts left" });

    player.attemptsLeft--;

    io.to(sessionId).emit("player_attempt", {
      playerId: player.id,
      name: player.name,
      attemptsLeft: player.attemptsLeft,
      guess,
    });

    if (guess.trim().toLowerCase() === s.answer.trim().toLowerCase()) {
      player.score += 10; // ✅ Add 10 points
      s.state = "waiting";

      io.to(sessionId).emit("round_end", {
        winner: { id: player.id, name: player.name },
        answer: s.answer,
        reason: "Correct guess",
      });

      s.currentQuestion = null;
      s.answer = null;
    }

    updateSession(sessionId);
    cb({ status: "ok" });
  });

  // Leave session
  socket.on("leave_session", ({ sessionId }, cb) => {
    socket.leave(sessionId);
    removePlayer(sessionId, socket.id);
    updateSession(sessionId);
    if (cb) cb();
  });

  // Disconnect cleanup
  socket.on("disconnect", () => {
    for (const [id] of Object.entries(sessions)) {
      removePlayer(id, socket.id);
      updateSession(id);
    }
  });

  function updateSession(sessionId) {
    const s = sessions[sessionId];
    if (!s) return;
    io.to(sessionId).emit("session_update", {
      session: { players: s.players },
      gameMasterId: s.gameMasterId,
      state: s.state,
    });
  }
});
app.get('/', (req, res) => res.send('Guessing Game Server is running'));
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));