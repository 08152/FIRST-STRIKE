const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

const MAX_PLAYERS = 32;
const COUNTDOWN_SECONDS = 10;

// =====================================
// SPIELDATEN
// =====================================

const players = new Map();

let lobbyStarted = false;
let gameStarted = false;

let countdown = COUNTDOWN_SECONDS;
let countdownInterval = null;

let botCount = 0;

// =====================================
// SERVERSTATUS
// =====================================

app.get("/api/status", (req, res) => {
    res.json({
        online: true,
        players: players.size,
        maxPlayers: MAX_PLAYERS,
        bots: botCount,
        countdown: countdown,
        lobbyStarted: lobbyStarted,
        gameStarted: gameStarted,
        game: "FRONTLINE"
    });
});

// =====================================
// LOBBY-DATEN
// =====================================

function getLobbyData() {

    return {
        realPlayers: players.size,
        botCount: botCount,
        totalPlayers: players.size + botCount,
        maxPlayers: MAX_PLAYERS,
        countdown: countdown,
        gameStarted: gameStarted,
        message: gameStarted
            ? "SPIEL LÄUFT"
            : "Warte auf weitere Spieler ..."
    };
}

// =====================================
// LOBBY AKTUALISIEREN
// =====================================

function updateLobby() {

    io.emit("lobby-update", getLobbyData());

}

// =====================================
// COUNTDOWN BEENDEN
// =====================================

function stopCountdown() {

    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }

}

// =====================================
// SPIEL STARTEN
// =====================================

function startGame() {

    if (gameStarted) return;

    stopCountdown();

    gameStarted = true;
    lobbyStarted = false;

    // Fehlende Spielerplätze mit Bots füllen
    botCount = Math.max(0, MAX_PLAYERS - players.size);

    const gameData = {
        realPlayers: players.size,
        botCount: botCount,
        totalPlayers: MAX_PLAYERS,
        maxPlayers: MAX_PLAYERS
    };

    console.log("--------------------------------");
    console.log("FRONTLINE MATCH GESTARTET");
    console.log("Echte Spieler:", players.size);
    console.log("Bots:", botCount);
    console.log("Gesamt:", MAX_PLAYERS);
    console.log("--------------------------------");

    // Allen Spielern Spielstart mitteilen
    io.emit("game-start", gameData);

    // Lobby-Status aktualisieren
    updateLobby();

}

// =====================================
// COUNTDOWN STARTEN
// =====================================

function startCountdown() {

    if (lobbyStarted || gameStarted) return;

    lobbyStarted = true;
    countdown = COUNTDOWN_SECONDS;

    console.log("FRONTLINE Lobby geöffnet.");

    updateLobby();

    countdownInterval = setInterval(() => {

        countdown--;

        if (countdown <= 0) {

            countdown = 0;

            updateLobby();

            startGame();

            return;
        }

        updateLobby();

        console.log("Countdown:", countdown);

    }, 1000);

}

// =====================================
// SPIELER BEWEGUNGEN
// =====================================

function validNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function cleanMovement(data) {

    if (!data || typeof data !== "object") {
        return null;
    }

    if (
        !validNumber(data.x) ||
        !validNumber(data.y) ||
        !validNumber(data.z) ||
        !validNumber(data.yaw)
    ) {
        return null;
    }

    return {
        x: Math.max(-1000, Math.min(1000, data.x)),
        y: Math.max(-100, Math.min(100, data.y)),
        z: Math.max(-1000, Math.min(1000, data.z)),
        yaw: Math.max(-1000, Math.min(1000, data.yaw))
    };

}

// =====================================
// VERBINDUNGEN
// =====================================

io.on("connection", (socket) => {

    console.log("Spieler verbunden:", socket.id);

    // =================================
    // LOBBY BETRETEN
    // =================================

    socket.on("join-game", () => {

        // Bereits angemeldet?
        if (players.has(socket.id)) {
            socket.emit("lobby-update", getLobbyData());
            return;
        }

        // Match läuft bereits
        if (gameStarted) {
            socket.emit("join-error", {
                message: "Dieses Match läuft bereits."
            });

            return;
        }

        // Lobby voll?
        if (players.size >= MAX_PLAYERS) {
            socket.emit("join-error", {
                message: "Die Lobby ist voll."
            });

            return;
        }

        const player = {
            id: socket.id,
            x: 0,
            y: 0,
            z: 8,
            yaw: 0,
            isBot: false
        };

        players.set(socket.id, player);

        console.log(
            "Spieler ist der Lobby beigetreten:",
            socket.id
        );

        // Bereits vorhandene Spieler an den neuen Spieler senden
        const existingPlayers = Array.from(players.values())
            .filter(p => p.id !== socket.id);

        socket.emit("players-existing", existingPlayers);

        // Neuen Spieler den anderen mitteilen
        socket.broadcast.emit("player-moved", player);

        // Countdown beim ersten Spieler starten
        if (!lobbyStarted && !gameStarted) {
            startCountdown();
        }

        updateLobby();

    });

    // =================================
    // SPIELER BEWEGT SICH
    // =================================

    socket.on("player-move", (data) => {

        const player = players.get(socket.id);

        if (!player || !gameStarted) return;

        const movement = cleanMovement(data);

        if (!movement) return;

        player.x = movement.x;
        player.y = movement.y;
        player.z = movement.z;
        player.yaw = movement.yaw;

        // Bewegung an alle anderen Spieler übertragen
        socket.broadcast.emit("player-moved", player);

    });

    // =================================
    // SPIELER VERLÄSST SERVER
    // =================================

    socket.on("disconnect", () => {

        console.log("Spieler getrennt:", socket.id);

        const existed = players.has(socket.id);

        if (!existed) return;

        players.delete(socket.id);

        io.emit("player-left", socket.id);

        // Wenn während der Wartelobby alle gehen:
        if (players.size === 0 && !gameStarted) {

            stopCountdown();

            lobbyStarted = false;
            countdown = COUNTDOWN_SECONDS;
            botCount = 0;

            console.log("Lobby zurückgesetzt.");

        }

        updateLobby();

        io.emit("players-online", players.size);

    });

});

// =====================================
// SERVER STARTEN
// =====================================

server.listen(PORT, "0.0.0.0", () => {

    console.log("--------------------------------");
    console.log("FRONTLINE SERVER ONLINE");
    console.log("Port:", PORT);
    console.log("Max Spieler:", MAX_PLAYERS);
    console.log("Countdown:", COUNTDOWN_SECONDS);
    console.log("--------------------------------");

});
