import { createServer } from 'http';
import app from "./app.js";
import { PORT } from "./config.js";
import initSocket from "./socket.js";

const server = createServer(app);
const io = initSocket(server);

app.set('io', io);

server.listen(PORT);

console.log("Server on port", PORT);
