import { type Server } from 'socket.io';
import {
    handleRoomJoin,
    leaveCurrentRoom,
    forwardSignal,
    type RoomJoinPayload,
    type SignalPayload,
} from './socketEvents';

type testPayload = {
    data: any
}

export default (io: Server) => {
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
            await handleRoomJoin(socket, payload);
        });

        // 명시적 퇴장 요청 처리
        socket.on('room:leave', () => {
            leaveCurrentRoom(socket);
        });

        // WebRTC offer 대상 peer 중계
        socket.on('signal:offer', (payload: SignalPayload) => {
            forwardSignal(socket, payload, 'signal:offer', 'offer');
        });

        // WebRTC answer 대상 peer 중계
        socket.on('signal:answer', (payload: SignalPayload) => {
            forwardSignal(socket, payload, 'signal:answer', 'answer');
        });

        // ICE candidate 대상 peer 중계
        socket.on('signal:ice-candidate', (payload: SignalPayload) => {
            forwardSignal(socket, payload, 'signal:ice-candidate', 'candidate');
        });

        // 연결 종료 시 메모리 상태와 Socket.IO room 정리
        socket.on('disconnect', () => {
            leaveCurrentRoom(socket);
        });
    })
}
