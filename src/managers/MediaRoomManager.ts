import type { types as mediasoupTypes } from 'mediasoup';
import { MediaRoom } from '../media/MediaRoom';
import { WorkerManager } from './WorkerManager';

/**
 * 활성 SFU Room의 생성, 조회, 종료를 관리한다.
 * DB의 Room 레코드가 아닌 현재 프로세스에 존재하는 mediasoup Router를 다룬다.
 */
export class MediaRoomManager {
    // 생성이 완료된 Room만 저장한다.
    private readonly rooms = new Map<string, MediaRoom>();
    // 같은 Room에 동시 입장할 때 Router가 중복 생성되는 것을 방지한다.
    private readonly pendingRooms = new Map<string, Promise<MediaRoom>>();
    private readonly workerManager: WorkerManager;
    private readonly routerOptions: mediasoupTypes.RouterOptions;

    constructor(
        workerManager: WorkerManager,
        routerOptions: mediasoupTypes.RouterOptions,
    ) {
        this.workerManager = workerManager;
        this.routerOptions = routerOptions;
    }

    get size(): number {
        return this.rooms.size;
    }

    getRoom(roomCode: string): MediaRoom | undefined {
        return this.rooms.get(roomCode);
    }

    async getOrCreateRoom(roomCode: string): Promise<MediaRoom> {
        // 이미 활성화된 Room이면 기존 Router를 그대로 재사용한다.
        const existingRoom = this.rooms.get(roomCode);

        if (existingRoom) {
            return existingRoom;
        }

        const pendingRoom = this.pendingRooms.get(roomCode);

        if (pendingRoom) {
            // 먼저 시작된 Router 생성 작업의 결과를 함께 기다린다.
            return pendingRoom;
        }

        const creation = this.createRoom(roomCode);
        this.pendingRooms.set(roomCode, creation);

        try {
            return await creation;
        } finally {
            // 성공과 실패 모두 pending 상태가 남지 않게 정리한다.
            this.pendingRooms.delete(roomCode);
        }
    }

    closeRoom(roomCode: string): boolean {
        const room = this.rooms.get(roomCode);

        if (!room) {
            return false;
        }

        this.rooms.delete(roomCode);
        // MediaRoom이 Peer 리소스와 Router를 닫는다.
        room.close();
        // WorkerManager에는 Room 배치 정보만 해제하도록 알린다.
        this.workerManager.releaseRoom(roomCode);

        return true;
    }

    closeRoomIfEmpty(roomCode: string): boolean {
        const room = this.rooms.get(roomCode);

        if (!room || room.peerCount > 0) {
            return false;
        }

        // 마지막 Peer 퇴장 후에만 Router를 제거한다.
        return this.closeRoom(roomCode);
    }

    listRooms(): readonly MediaRoom[] {
        return Array.from(this.rooms.values());
    }

    close(): void {
        // 애플리케이션 종료 시 활성 Room을 빠짐없이 정리한다.
        for (const roomCode of Array.from(this.rooms.keys())) {
            this.closeRoom(roomCode);
        }
    }

    private async createRoom(roomCode: string): Promise<MediaRoom> {
        // Worker 선택과 Router 생성 책임은 WorkerManager에 위임한다.
        const allocation = await this.workerManager.createRouter(
            roomCode,
            this.routerOptions,
        );
        const room = new MediaRoom(
            roomCode,
            allocation.workerId,
            allocation.router,
        );

        this.rooms.set(roomCode, room);
        return room;
    }
}
