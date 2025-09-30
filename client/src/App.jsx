import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

export default function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState("room1");

  const [players, setPlayers] = useState([]);
  const [gameMasterId, setGameMasterId] = useState(null);
  const [isGameMaster, setIsGameMaster] = useState(false);
  const [gameState, setGameState] = useState("waiting");

  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [myAttempts, setMyAttempts] = useState(3);
  const [messages, setMessages] = useState([]);
  const guessRef = useRef("");

  useEffect(() => {
    return () => {
      if (socket) socket.disconnect();
    };
  }, [socket]);

  function addMessage(msg) {
    setMessages((prev) => [
      ...prev,
      { ...msg, ts: new Date().toLocaleTimeString() },
    ]);
  }

  function join() {
    if (!name || !sessionId) return alert("Enter name and session id");
    const chat = io(SERVER_URL);
    setSocket(chat);

    chat.on("connect", () => {
      chat.emit("join_session", { sessionId, name }, (res) => {
        if (res.status === "ok") {
          setConnected(true);
          addMessage({ system: true, text: `You joined ${sessionId}` });
        } else {
          addMessage({ system: true, text: `Join failed: ${res.message}` });
        }
      });
    });

    chat.on("session_update", ({ session, gameMasterId, state }) => {
      setPlayers(session.players);
      setGameMasterId(gameMasterId);
      setGameState(state);
      setIsGameMaster(gameMasterId === chat.id);
      const me = session.players.find((p) => p.id === chat.id);
      setMyAttempts(me ? me.attemptsLeft ?? 3 : 3);
    });

    chat.on("question_set", () =>
      addMessage({ system: true, text: "Game master set a new question" })
    );

    chat.on("game_started", ({ question, timeLeft }) => {
      setCurrentQuestion(question);
      setTimeLeft(timeLeft);
      addMessage({ system: true, text: `Game started — question: ${question}` });
    });

    chat.on("timer_tick", ({ timeLeft }) => setTimeLeft(timeLeft));

    chat.on("player_attempt", ({ name, attemptsLeft, guess }) => {
      addMessage({
        system: false,
        text: `${name} guessed: "${guess}" (${attemptsLeft} attempts left)`,
      });
    });

    chat.on("round_end", ({ winner, answer, reason }) => {
      if (winner)
        addMessage({
          system: true,
          text: `${winner.name} won! +10 points 🎉 (Answer: ${answer})`,
        });
      else
        addMessage({
          system: true,
          text: `Round ended (${reason}). Answer: ${answer}`,
        });
      setCurrentQuestion(null);
    });

    chat.on("disconnect", () => {
      setConnected(false);
      addMessage({ system: true, text: "Disconnected from server" });
    });
  }

  function setQuestionOnServer() {
    if (!socket) return;
    socket.emit(
      "set_question",
      { sessionId, question: questionText, answer: answerText },
      (res) => {
        if (res.status === "ok")
          addMessage({ system: true, text: "Question saved" });
        else addMessage({ system: true, text: "Set question failed" });
      }
    );
  }

  function startGameOnServer() {
    if (!socket) return;
    socket.emit("start_game", { sessionId, time: 60 }, (res) => {
      if (res.status === "ok")
        addMessage({ system: true, text: "Game started" });
    });
  }

  function submitGuess() {
    if (!socket) return;
    const guess = guessRef.current.value;
    if (!guess) return;
    socket.emit("submit_answer", { sessionId, guess }, (res) => {
      if (res && res.status === "error")
        addMessage({ system: true, text: "Guess error: " + res.message });
      guessRef.current.value = "";
    });
  }

  function leave() {
    if (!socket) return;
    socket.emit("leave_session", { sessionId }, () => {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
      setPlayers([]);
      addMessage({ system: true, text: "You left the session" });
    });
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>Guessing Game 🎮</h1>

      {!connected && (
        <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder="Session id (e.g. room1)"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          />
          <button onClick={join}>Join Session</button>
        </div>
      )}

      {connected && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "300px 1fr",
            gap: 16,
            marginTop: 16,
          }}
        >
          <div style={{ border: "1px solid #ddd", padding: 12 }}>
            <h3>Players ({players.length})</h3>
            <ul>
              {players.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong>{" "}
                  {p.id === gameMasterId && <em>(GM)</em>} — {p.score} pts
                </li>
              ))}
            </ul>

            <div>
              State: <strong>{gameState}</strong>
              <br />
              Time left: <strong>{timeLeft}s</strong>
              <br />
              Your attempts: <strong>{myAttempts}</strong>
            </div>
            <button onClick={leave}>Leave Session</button>

            {isGameMaster && (
              <div style={{ marginTop: 12 }}>
                <h4>Game Master controls</h4>
                <input
                  placeholder="Question"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                />
                <input
                  placeholder="Answer"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                />
                <button onClick={setQuestionOnServer}>Save question</button>
                <button onClick={startGameOnServer}>Start game (60s)</button>
              </div>
            )}
          </div>

          <div style={{ border: "1px solid #eee", padding: 12 }}>
            <div style={{ height: 300, overflowY: "auto" }}>
              {messages.map((m, i) => (
                <div key={i}>
                  <small>{m.ts}</small> {m.system ? <em>{m.text}</em> : m.text}
                </div>
              ))}
            </div>

            {currentQuestion ? (
              <div>
                <strong>Question:</strong> {currentQuestion}
                <br />
                <input placeholder="Your guess" ref={guessRef} />
                <button onClick={submitGuess}>Submit</button>
              </div>
            ) : (
              <em>Waiting for next round...</em>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
