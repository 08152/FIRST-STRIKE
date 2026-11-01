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

// HTML-Dateien bereitstellen
app.use(express.static(__dirname));

// Serverstatus
app.get("/api/status", (req, res) => {
    res.json({
        online: true,
        players: io.engine.clientsCount,
        game: "FRONTLINE"
    });
});

// Spieler verbinden
io.on("connection", (socket) => {
    console.log("Spieler verbunden:", socket.id);

    // Spieleranzahl aktualisieren
    io.emit("players-online", io.engine.clientsCount);

    socket.on("disconnect", () => {
        console.log("Spieler getrennt:", socket.id);

        io.emit("players-online", io.engine.clientsCount);
    });
});

// Server starten
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`FRONTLINE Server läuft auf Port ${PORT}`);
});
