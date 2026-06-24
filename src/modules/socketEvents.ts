import {
    addParticipant,
    getParticipant,
    getSocketPresence,
    listParticipants,
    removeSocket,
    type Participant,
} from "./signalingStore";
import type { Socket } from "socket.io";
import { randomUUID } from "crypto";
import db from "./prisma";

export type RoomJoinPayload = {
    roomCode?: unknown;
    peerId?: unknown;
};

export type SignalPayload = {
    toPeerId?: unknown;
    offer?: unknown;
    answer?: unknown;
    candidate?: unknown;
};

type SignalEvent = 'signal:offer' | 'signal:answer' | 'signal:ice-candidate';
type SignalPayloadKey = 'offer' | 'answer' | 'candidate';

// 비어 있지 않은 문자열 payload 확인
const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
};

// signaling payload로 다룰 수 있는 일반 객체 확인
const isObjectPayload = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

// 클라이언트에 노출 가능한 참가자 정보 직렬화
const serializeParticipant = (participant: Participant) => ({
    peerId: participant.peerId,
    joinedAt: participant.joinedAt,
});

// Socket.IO 클라이언트에 표준 room:error 이벤트 전달
const emitRoomError = (socket: Socket, code: string, message: string) => {
    socket.emit('room:error', { code, message });
};

// roomCode 검증 후 해당 signaling room 참가 처리
export const handleRoomJoin = async (socket: Socket, payload: RoomJoinPayload) => {
    // 요청 payload 기본 형태 검증
    if (!isObjectPayload(payload) || !isNonEmptyString(payload.roomCode)) {
        emitRoomError(socket, 'INVALID_ROOM_JOIN_PAYLOAD', 'roomCode is required.');
        return;
    }

    // socket당 단일 room 참가 제한
    if (getSocketPresence(socket.id)) {
        emitRoomError(socket, 'ALREADY_JOINED_ROOM', 'Socket already joined a room.');
        return;
    }

    const roomCode = payload.roomCode.trim();
    const peerId = isNonEmptyString(payload.peerId) ? payload.peerId.trim() : randomUUID();

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

        // 같은 room 내 peerId 중복 확인
        const existingParticipant = getParticipant(roomCode, peerId);

        if (existingParticipant) {
            emitRoomError(socket, 'PEER_ALREADY_JOINED', 'Peer already joined this room.');
            return;
        }

        // 새 참가자에는 기존 참가자 목록 전달, 기존 참가자에는 입장 알림
        const participants = listParticipants(roomCode).map(serializeParticipant);
        const participant = addParticipant(roomCode, peerId, socket.id);

        socket.join(roomCode);
        socket.emit('room:joined', {
            roomCode,
            peerId: participant.peerId,
            participants,
        });
        socket.to(roomCode).emit('peer:joined', serializeParticipant(participant));
    } catch (error) {
        console.error(error);
        emitRoomError(socket, 'ROOM_JOIN_FAILED', 'Failed to join room.');
    }
};

// socket 연결을 현재 room 상태에서 제거하고 남은 참가자에게 퇴장 알림
export const leaveCurrentRoom = (socket: Socket) => {
    const presence = removeSocket(socket.id);

    if (!presence) {
        return;
    }

    socket.leave(presence.roomCode);
    socket.to(presence.roomCode).emit('peer:left', { peerId: presence.peerId });
};

// offer, answer, ICE candidate를 같은 room 안의 특정 peer에게만 전달
export const forwardSignal = (
    socket: Socket,
    payload: SignalPayload,
    event: SignalEvent,
    payloadKey: SignalPayloadKey,
) => {
    // room 참가 socket만 signaling 메시지 전송 허용
    const presence = getSocketPresence(socket.id);

    if (!presence) {
        emitRoomError(socket, 'NOT_JOINED_ROOM', 'Socket has not joined a room.');
        return;
    }

    // 대상 peerId 존재 여부 검증
    if (!isObjectPayload(payload) || !isNonEmptyString(payload.toPeerId)) {
        emitRoomError(socket, 'INVALID_SIGNAL_PAYLOAD', 'toPeerId is required.');
        return;
    }

    const signalValue = payload[payloadKey];

    // SDP/ICE 내용 해석 없이 객체 형태만 확인
    if (!isObjectPayload(signalValue)) {
        emitRoomError(socket, 'INVALID_SIGNAL_PAYLOAD', `${payloadKey} must be an object.`);
        return;
    }

    // 같은 room 안에 있는 대상 peer socket 조회
    const target = getParticipant(presence.roomCode, payload.toPeerId.trim());

    if (!target) {
        emitRoomError(socket, 'PEER_NOT_FOUND', 'Target peer does not exist in this room.');
        return;
    }

    // Socket.IO room 전체가 아닌 대상 socket 하나에만 signaling payload 전달
    socket.to(target.socketId).emit(event, {
        fromPeerId: presence.peerId,
        [payloadKey]: signalValue,
    });
};
