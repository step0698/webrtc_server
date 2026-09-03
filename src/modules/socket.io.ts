import { type Server } from 'socket.io';
import type { MediaRoomManager } from '../managers';
import {
    handleRoomJoin,
    leaveCurrentRoom,
    type RoomJoinPayload,
} from './socketEvents';
import {
    handleTransportConnect,
    handleTransportCreate,
    type TransportConnectPayload,
    type TransportCreatePayload,
    type TransportCreateResponse,
} from '../signaling/handlers/TransportHandlers';
import type { SocketAck } from '../signaling/SocketTypes';
import {
    handleProducerClose,
    handleProducerCreate,
    type ProducerClosePayload,
    type ProducerCreatePayload,
    type ProducerCreateResponse,
} from '../signaling/handlers/ProducerHandlers';
import {
    handleConsumerClose,
    handleConsumerCreate,
    handleConsumerResume,
    type ConsumerCreatePayload,
    type ConsumerCreateResponse,
    type ConsumerIdPayload,
} from '../signaling/handlers/ConsumerHandlers';

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

        // Peer의 송신용 또는 수신용 WebRTC Transport를 생성한다.
        socket.on(
            'transport:create',
            async (
                payload: TransportCreatePayload,
                ack: SocketAck<TransportCreateResponse>,
            ) => {
                if (typeof ack !== 'function') {
                    return;
                }

                await handleTransportCreate(
                    socket,
                    payload,
                    ack,
                    mediaRoomManager,
                );
            },
        );

        // mediasoup-client가 전달한 DTLS 파라미터로 Transport를 연결한다.
        socket.on(
            'transport:connect',
            async (
                payload: TransportConnectPayload,
                ack: SocketAck<Record<string, never>>,
            ) => {
                if (typeof ack !== 'function') {
                    return;
                }

                await handleTransportConnect(
                    socket,
                    payload,
                    ack,
                    mediaRoomManager,
                );
            },
        );

        // send Transport에 마이크, 카메라 또는 화면 공유 Producer를 생성한다.
        socket.on(
            'producer:create',
            async (
                payload: ProducerCreatePayload,
                ack: SocketAck<ProducerCreateResponse>,
            ) => {
                if (typeof ack !== 'function') {
                    return;
                }

                await handleProducerCreate(
                    socket,
                    payload,
                    ack,
                    mediaRoomManager,
                );
            },
        );

        // Peer가 카메라나 화면 공유 등을 중단할 때 Producer를 명시적으로 닫는다.
        socket.on(
            'producer:close',
            (
                payload: ProducerClosePayload,
                ack: SocketAck<Record<string, never>>,
            ) => {
                if (typeof ack !== 'function') {
                    return;
                }

                handleProducerClose(
                    socket,
                    payload,
                    ack,
                    mediaRoomManager,
                );
            },
        );

        // recv Transport에서 같은 MediaRoom의 원격 Producer를 구독한다.
        socket.on(
            'consumer:create',
            async (
                payload: ConsumerCreatePayload,
                ack: SocketAck<ConsumerCreateResponse>,
            ) => {
                if (typeof ack !== 'function') {
                    return;
                }

                await handleConsumerCreate(
                    socket,
                    payload,
                    ack,
                    mediaRoomManager,
                );
            },
        );

        // 클라이언트 Consumer 생성이 끝난 뒤 서버의 RTP 전달을 시작한다.
        socket.on(
            'consumer:resume',
            async (
                payload: ConsumerIdPayload,
                ack: SocketAck<Record<string, never>>,
            ) => {
                if (typeof ack !== 'function') {
                    return;
                }

                await handleConsumerResume(
                    socket,
                    payload,
                    ack,
                    mediaRoomManager,
                );
            },
        );

        // 더 이상 필요하지 않은 원격 미디어 Consumer를 명시적으로 닫는다.
        socket.on(
            'consumer:close',
            (
                payload: ConsumerIdPayload,
                ack: SocketAck<Record<string, never>>,
            ) => {
                if (typeof ack !== 'function') {
                    return;
                }

                handleConsumerClose(
                    socket,
                    payload,
                    ack,
                    mediaRoomManager,
                );
            },
        );

        // Socket.IO가 room 목록을 비우기 전 SFU Peer 리소스를 정리한다.
        socket.on('disconnecting', async () => {
            await leaveCurrentRoom(socket, mediaRoomManager);
        });
    })
}
