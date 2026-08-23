import type { Socket } from 'socket.io';
import type { MediaRoomManager } from '../managers';
import type { MediaRoom } from '../media/MediaRoom';
import type { PeerSession } from '../modules/PeerSession';

export type SignalingContext = {
    mediaRoom: MediaRoom;
    peer: PeerSession;
};

// socket이 참가한 SFU Room과 해당 Peer를 함께 조회한다.
export const getSignalingContext = (
    socket: Socket,
    mediaRoomManager: MediaRoomManager,
): SignalingContext | undefined => {
    const mediaRoom = mediaRoomManager.getRoomBySocket(socket.id);
    const peer = mediaRoom?.getPeerBySocket(socket.id);

    return mediaRoom && peer ? { mediaRoom, peer } : undefined;
};
