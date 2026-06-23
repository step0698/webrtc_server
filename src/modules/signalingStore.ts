export type Participant = {
    peerId: string;
    socketId: string;
    joinedAt: string;
};

type SocketPresence = {
    roomCode: string;
    peerId: string;
};

const rooms = new Map<string, Map<string, Participant>>();
const sockets = new Map<string, SocketPresence>();

const getRoomParticipants = (roomCode: string) => {
    let participants = rooms.get(roomCode);

    if (!participants) {
        participants = new Map<string, Participant>();
        rooms.set(roomCode, participants);
    }

    return participants;
};

export const listParticipants = (roomCode: string): Participant[] => {
    return Array.from(rooms.get(roomCode)?.values() ?? []);
};

export const getSocketPresence = (socketId: string): SocketPresence | undefined => {
    return sockets.get(socketId);
};

export const getParticipant = (roomCode: string, peerId: string): Participant | undefined => {
    return rooms.get(roomCode)?.get(peerId);
};

export const addParticipant = (roomCode: string, peerId: string, socketId: string): Participant => {
    const participants = getRoomParticipants(roomCode);
    const participant = {
        peerId,
        socketId,
        joinedAt: new Date().toISOString(),
    };

    participants.set(peerId, participant);
    sockets.set(socketId, { roomCode, peerId });

    return participant;
};

export const removeSocket = (socketId: string): SocketPresence | undefined => {
    const presence = sockets.get(socketId);

    if (!presence) {
        return undefined;
    }

    sockets.delete(socketId);

    const participants = rooms.get(presence.roomCode);
    participants?.delete(presence.peerId);

    if (participants?.size === 0) {
        rooms.delete(presence.roomCode);
    }

    return presence;
};
