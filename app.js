import express from "express";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

import { Server } from "socket.io";
import { createServer } from "node:http";

dotenv.config();

const port = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
});

const db = createClient({
  url: "libsql://chat-wilmer-oss.turso.io",
  authToken: process.env.DB_TOKEN,
});

await db.execute(
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    time NVARCHAR(250),
    user TEXT )`
);

io.on("connection", async (socket) => {
  console.log("a user connected");

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("chat message", async (msg, time) => {
    let result;
    const user = socket.handshake.auth.username;
    try {
      result = await db.execute({
        sql: `INSERT INTO messages (content,user,time) values (:msg,:user,:time)`,
        args: { msg, user, time },
      });
    } catch (error) {
      console.error(error);
      return;
    }
    io.emit("chat message", msg, result.lastInsertRowid.toString(), user, time);
  });

  if (!socket.recovered) {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM messages WHERE id > ? ",
        args: [socket.handshake.auth.serverOffset ?? 0],
      });
      result.rows.forEach((row) => {
        socket.emit("chat message", row.content, row.id, row.user, row.time);
      });
    } catch (err) {
      console.error(err);
      return;
    }
  }
});

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/index.html");
});
app.use((req, res) => {
  return res.status(404).send("<h3>404 not found</h3>");
});

server.listen(port, () => {
  console.log(`server is listening on port ${port}`);
});
