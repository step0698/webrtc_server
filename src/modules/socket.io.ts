import { type Server } from 'socket.io';
import type { MediaRoomManager } from '../managers';
import {
    handleRoomJoin,
    leaveCurrentRoom,
    type RoomJoinPayload,
} from './socketEvents';

type testPayload = {
    data: any
}

export default (io: Server, mediaRoomManager: MediaRoomManager) => {
    io.on('connection', (socket) => {
        const ip = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress?.split(":")[3] || socket.conn.remoteAddress;

        console.log(`a user connected -> socket id : ${socket.id} (IP: ${ip})`);

        // 테스트용 event
        socket.on('helloWorld', (payload: testPayload) => {
            console.log(`${payload}`);
            socket.emit('helloWorld', {data : 'Hiiiiiiiiiiii'});
        });

        // roomCode 기준 Socket.IO room 참가
        socket.on('room:join', async (payload: RoomJoinPayload) => {
            await handleRoomJoin(socket, payload, mediaRoomManager);
        });

        // 명시적 퇴장 요청 처리
        socket.on('room:leave', async () => {
            await leaveCurrentRoom(socket, mediaRoomManager);
        });

        // Socket.IO가 room 목록을 비우기 전 SFU Peer 리소스를 정리한다.
        socket.on('disconnecting', async () => {
            await leaveCurrentRoom(socket, mediaRoomManager);
        });
    })
}
