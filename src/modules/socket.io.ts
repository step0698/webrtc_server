import { type Server } from 'socket.io';
import {
    handleRoomJoin,
    leaveCurrentRoom,
    forwardSignal,
    type RoomJoinPayload,
    type SignalPayload,
} from './socketEvents';

export default (io: Server) => {
    io.on('connection', (socket) => {
        const ip = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress?.split(":")[3] || socket.conn.remoteAddress;

        console.log(`a user connected -> socket id : ${socket.id} (IP: ${ip})`);

        socket.on('room:join', async (payload: RoomJoinPayload) => {
            await handleRoomJoin(socket, payload);
        });

        socket.on('room:leave', () => {
            leaveCurrentRoom(socket);
        });

        socket.on('signal:offer', (payload: SignalPayload) => {
            forwardSignal(socket, payload, 'signal:offer', 'offer');
        });

        socket.on('signal:answer', (payload: SignalPayload) => {
            forwardSignal(socket, payload, 'signal:answer', 'answer');
        });

        socket.on('signal:ice-candidate', (payload: SignalPayload) => {
            forwardSignal(socket, payload, 'signal:ice-candidate', 'candidate');
        });

        socket.on('disconnect', () => {
            leaveCurrentRoom(socket);
        });
    })
}
