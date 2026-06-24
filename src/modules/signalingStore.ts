export type Participant = {
    peerId: string;
    socketId: string;
    joinedAt: string;
};

type SocketPresence = {
    roomCode: string;
    peerId: string;
};

// roomCode별 참가자와 socket별 현재 참가 상태 메모리 관리
const rooms = new Map<string, Map<string, Participant>>();
const sockets = new Map<string, SocketPresence>();

// roomCode에 해당하는 참가자 Map 조회, 없으면 생성
const getRoomParticipants = (roomCode: string) => {
    let participants = rooms.get(roomCode);

    if (!participants) {
        participants = new Map<string, Participant>();
        rooms.set(roomCode, participants);
    }

    return participants;
};

// roomCode에 현재 접속 중인 참가자 목록 반환
export const listParticipants = (roomCode: string): Participant[] => {
    return Array.from(rooms.get(roomCode)?.values() ?? []);
};

// socketId 기준 현재 room/peer 등록 상태 조회
export const getSocketPresence = (socketId: string): SocketPresence | undefined => {
    return sockets.get(socketId);
};

// roomCode와 peerId 기준 특정 참가자의 socket 정보 조회
export const getParticipant = (roomCode: string, peerId: string): Participant | undefined => {
    return rooms.get(roomCode)?.get(peerId);
};

// 참가자를 room 상태와 socket 상태에 함께 등록
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

// socket 연결 종료/퇴장 시 room 상태와 socket 상태 정리
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
