import { randomUUID } from 'crypto';
import type { Socket } from 'socket.io';
import type { MediaRoomManager } from '../managers';
import type { PeerSession } from './PeerSession';
import db from './prisma';

export type RoomJoinPayload = {
    roomCode?: unknown;
};

// 비어 있지 않은 문자열 payload 확인
const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
};

// signaling payload로 다룰 수 있는 일반 객체 확인
const isObjectPayload = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

// mediasoup 객체나 socketId를 노출하지 않고 공개 가능한 Peer 정보만 반환한다.
const serializePeer = (peer: PeerSession) => ({
    peerId: peer.peerId,
    joinedAt: peer.joinedAt,
});

// Socket.IO 클라이언트에 표준 room:error 이벤트 전달
const emitRoomError = (socket: Socket, code: string, message: string) => {
    socket.emit('room:error', { code, message });
};

// roomCode 검증 후 DB Room에 대응하는 활성 SFU MediaRoom 참가를 처리한다.
export const handleRoomJoin = async (
    socket: Socket,
    payload: RoomJoinPayload,
    mediaRoomManager: MediaRoomManager,
) => {
    // 요청 payload 기본 형태 검증
    if (!isObjectPayload(payload) || !isNonEmptyString(payload.roomCode)) {
        emitRoomError(socket, 'INVALID_ROOM_JOIN_PAYLOAD', 'roomCode is required.');
        return;
    }

    // socket당 단일 room 참가 제한
    if (
        socket.data.sfuJoinPending === true ||
        mediaRoomManager.getRoomBySocket(socket.id)
    ) {
        emitRoomError(socket, 'ALREADY_JOINED_ROOM', 'Socket already joined a room.');
        return;
    }

    const roomCode = payload.roomCode.trim();
    const peerId = randomUUID();
    socket.data.sfuJoinPending = true;

    try {
        // DB에 생성된 roomCode 확인으로 임의 room 참가 방지
        const room = await db.room.findUnique({
            where: { roomCode },
            select: { roomCode: true },
        });

        if (!room) {
            emitRoomError(socket, 'ROOM_NOT_FOUND', 'Room does not exist.');
            return;
        }

        // DB 조회를 기다리는 동안 연결이 종료됐다면 SFU 리소스를 생성하지 않는다.
        if (!socket.connected) {
            return;
        }

        // 첫 Peer라면 Router와 MediaRoom을 생성하고, 이후 Peer는 기존 Router를 공유한다.
        const mediaRoom = await mediaRoomManager.getOrCreateRoom(roomCode);
        const peers = mediaRoom.listPeers().map(serializePeer);
        const peer = mediaRoom.addPeer(peerId, socket.id);

        try {
            await socket.join(roomCode);
        } catch (error) {
            // Socket.IO room 참가 실패 시 먼저 등록한 SFU Peer 상태를 원복한다.
            mediaRoom.removePeer(peerId);
            mediaRoomManager.closeRoomIfEmpty(roomCode);
            throw error;
        }

        socket.emit('room:joined', {
            roomCode,
            peerId: peer.peerId,
            peers,
            routerRtpCapabilities: mediaRoom.router.rtpCapabilities,
        });
        socket.to(roomCode).emit('peer:joined', serializePeer(peer));
    } catch (error) {
        console.error(error);
        // Peer 등록 전 실패해 비어 있는 MediaRoom이 남았다면 Router까지 정리한다.
        mediaRoomManager.closeRoomIfEmpty(roomCode);
        emitRoomError(socket, 'ROOM_JOIN_FAILED', 'Failed to join room.');
    } finally {
        socket.data.sfuJoinPending = false;
    }
};

// socket이 소유한 Peer 리소스를 닫고 비어 있는 MediaRoom과 Router를 정리한다.
export const leaveCurrentRoom = async (
    socket: Socket,
    mediaRoomManager: MediaRoomManager,
) => {
    const mediaRoom = mediaRoomManager.getRoomBySocket(socket.id);

    if (!mediaRoom) {
        return;
    }

    const peer = mediaRoom.getPeerBySocket(socket.id);

    if (!peer) {
        return;
    }

    mediaRoom.removePeer(peer.peerId);
    await socket.leave(mediaRoom.roomCode);
    socket.to(mediaRoom.roomCode).emit('peer:left', { peerId: peer.peerId });
    mediaRoomManager.closeRoomIfEmpty(mediaRoom.roomCode);
};
