// Socket.IO: cada cliente se conecta con ?matricula=<matricula> y queda en la sala
// user_<matricula>. Los controladores emiten a esas salas via util/socketHelpers.js
// (catalogo de eventos en docs/API.md seccion 12).
import { Server } from 'socket.io';

export default function initSocket(server) {
    const io = new Server(server, {
        cors: { origin: '*' },
        transports: ['websocket', 'polling']
    });

    io.on('connection', (socket) => {
        const raw = socket.handshake.query.matricula;
        const matricula = raw !== undefined && raw !== null ? String(raw).trim() : null;

        if (matricula) {
            const room = `user_${matricula}`;
            socket.join(room);
            console.log(`[Socket] Conectado: id=${socket.id} matricula=${matricula} room=${room}`);
        } else {
            console.warn(`[Socket] Conexion sin matricula: id=${socket.id} (no se unio a ningun room)`);
        }

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] Desconectado: id=${socket.id} matricula=${matricula} reason=${reason}`);
        });
    });

    return io;
}
