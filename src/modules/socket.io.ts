import { type Server } from 'socket.io';

export default (io: Server) => {
    io.on('connection', (socket) => {
        const ip = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress.split(":")[3];

        console.log(`a user connected -> socket id : ${socket.id} (IP: ${ip})`);
    })
}