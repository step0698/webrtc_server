import type { types as mediasoupTypes } from 'mediasoup';
import type { MediaTag } from './MediaTypes';
import { PeerSession } from '../modules/PeerSession';

/**
 * 하나의 roomCode에 대응하는 mediasoup Router와 접속 Peer를 보관한다.
 * Room은 생성 시 선택된 Worker에 고정되며 실행 중 다른 Worker로 이동하지 않는다.
 */
export class MediaRoom {
    readonly roomCode: string;
    readonly workerId: string;
    readonly router: mediasoupTypes.Router;

    // 미디어 이벤트에서는 peerId로 참가자를 찾는다.
    private readonly peers = new Map<string, PeerSession>();
    // Socket.IO disconnect 처리에서는 socketId로 Peer를 역조회한다.
    private readonly socketToPeer = new Map<string, string>();
    private closed = false;

    constructor(
        roomCode: string,
        workerId: string,
        router: mediasoupTypes.Router,
    ) {
        this.roomCode = roomCode;
        this.workerId = workerId;
        this.router = router;
    }

    get peerCount(): number {
        return this.peers.size;
    }

    get isClosed(): boolean {
        return this.closed;
    }

    addPeer(peerId: string, socketId: string): PeerSession {
        this.assertOpen();

        // peerId와 socketId 모두 Room 안에서 유일해야 한다.
        if (this.peers.has(peerId)) {
            throw new Error(`Peer ${peerId} is already in room ${this.roomCode}.`);
        }
        if (this.socketToPeer.has(socketId)) {
            throw new Error(`Socket ${socketId} is already in room ${this.roomCode}.`);
        }

        const peer = new PeerSession(peerId, socketId);
        this.peers.set(peerId, peer);
        this.socketToPeer.set(socketId, peerId);

        return peer;
    }

    getPeer(peerId: string): PeerSession | undefined {
        return this.peers.get(peerId);
    }

    getPeerBySocket(socketId: string): PeerSession | undefined {
        const peerId = this.socketToPeer.get(socketId);
        return peerId ? this.peers.get(peerId) : undefined;
    }

    listPeers(): readonly PeerSession[] {
        return Array.from(this.peers.values());
    }

    findProducer(producerId: string): {
        peer: PeerSession;
        producer: mediasoupTypes.Producer;
        mediaTag: MediaTag;
    } | undefined {
        // Producer ID만 받은 Consumer 요청에서 같은 Room의 소유 Peer를 찾는다.
        for (const peer of this.peers.values()) {
            const peerProducer = peer.listProducers().find(({ producer }) => {
                return producer.id === producerId;
            });

            if (peerProducer) {
                return {
                    peer,
                    producer: peerProducer.producer,
                    mediaTag: peerProducer.mediaTag,
                };
            }
        }

        return undefined;
    }

    removePeer(peerId: string): PeerSession | undefined {
        const peer = this.peers.get(peerId);

        if (!peer) {
            return undefined;
        }

        this.peers.delete(peerId);
        this.socketToPeer.delete(peer.socketId);
        // Peer가 소유한 Consumer, Producer, Transport도 함께 닫는다.
        peer.close();

        return peer;
    }

    close(): void {
        // leave와 disconnect가 연속 호출되어도 안전하게 한 번만 정리한다.
        if (this.closed) {
            return;
        }

        this.closed = true;

        for (const peer of this.peers.values()) {
            peer.close();
        }

        this.peers.clear();
        this.socketToPeer.clear();
        // Router를 닫으면 Router에 남아 있는 mediasoup 리소스도 종료된다.
        this.router.close();
    }

    private assertOpen(): void {
        if (this.closed) {
            throw new Error(`Room ${this.roomCode} is already closed.`);
        }
    }
}
