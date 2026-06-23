import {
    addParticipant,
    getParticipant,
    getSocketPresence,
    listParticipants,
    Participant,
    removeSocket
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

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
};

const isObjectPayload = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const serializeParticipant = (participant: Participant) => ({
    peerId: participant.peerId,
    joinedAt: participant.joinedAt,
});

const emitRoomError = (socket: Socket, code: string, message: string) => {
    socket.emit('room:error', { code, message });
};

export const handleRoomJoin = async (socket: Socket, payload: RoomJoinPayload) => {
    if (!isObjectPayload(payload) || !isNonEmptyString(payload.roomCode)) {
        emitRoomError(socket, 'INVALID_ROOM_JOIN_PAYLOAD', 'roomCode is required.');
        return;
    }

    if (getSocketPresence(socket.id)) {
        emitRoomError(socket, 'ALREADY_JOINED_ROOM', 'Socket already joined a room.');
        return;
    }

    const roomCode = payload.roomCode.trim();
    const peerId = isNonEmptyString(payload.peerId) ? payload.peerId.trim() : randomUUID();

    try {
        const room = await db.room.findUnique({
            where: { roomCode },
            select: { roomCode: true },
        });

        if (!room) {
            emitRoomError(socket, 'ROOM_NOT_FOUND', 'Room does not exist.');
            return;
        }

        const existingParticipant = getParticipant(roomCode, peerId);

        if (existingParticipant) {
            emitRoomError(socket, 'PEER_ALREADY_JOINED', 'Peer already joined this room.');
            return;
        }

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

export const leaveCurrentRoom = (socket: Socket) => {
    const presence = removeSocket(socket.id);

    if (!presence) {
        return;
    }

    socket.leave(presence.roomCode);
    socket.to(presence.roomCode).emit('peer:left', { peerId: presence.peerId });
};

export const forwardSignal = (
    socket: Socket,
    payload: SignalPayload,
    event: SignalEvent,
    payloadKey: SignalPayloadKey,
) => {
    const presence = getSocketPresence(socket.id);

    if (!presence) {
        emitRoomError(socket, 'NOT_JOINED_ROOM', 'Socket has not joined a room.');
        return;
    }

    if (!isObjectPayload(payload) || !isNonEmptyString(payload.toPeerId)) {
        emitRoomError(socket, 'INVALID_SIGNAL_PAYLOAD', 'toPeerId is required.');
        return;
    }

    const signalValue = payload[payloadKey];

    if (!isObjectPayload(signalValue)) {
        emitRoomError(socket, 'INVALID_SIGNAL_PAYLOAD', `${payloadKey} must be an object.`);
        return;
    }

    const target = getParticipant(presence.roomCode, payload.toPeerId.trim());

    if (!target) {
        emitRoomError(socket, 'PEER_NOT_FOUND', 'Target peer does not exist in this room.');
        return;
    }

    socket.to(target.socketId).emit(event, {
        fromPeerId: presence.peerId,
        [payloadKey]: signalValue,
    });
};