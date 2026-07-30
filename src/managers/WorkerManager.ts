import { createWorker } from 'mediasoup';
import type { types as mediasoupTypes } from 'mediasoup';
import type { RouterAllocation, WorkerSlot } from '../media/MediaTypes';

type WorkerFactory = (
    settings: mediasoupTypes.WorkerSettings,
) => Promise<mediasoupTypes.Worker>;

// 테스트에서는 실제 mediasoup 프로세스 대신 createWorker를 주입할 수 있다.
export type WorkerManagerOptions = {
    workerCount?: number;
    workerSettings?: mediasoupTypes.WorkerSettings;
    createWorker?: WorkerFactory;
    onWorkerDied?: (workerId: string, error: Error) => void;
};

/**
 * mediasoup Worker의 생성과 Room 배치를 담당한다.
 *
 * 현재는 workerCount를 1로 사용하더라도 Room이 Worker를 직접 참조하지 않게
 * 만들어, 이후 Worker 선택 정책을 교체할 수 있는 경계를 제공한다.
 */
export class WorkerManager {
    // Worker와 해당 Worker에 배치된 Room 정보를 함께 보관한다.
    private readonly slots: WorkerSlot[] = [];
    private readonly workerCount: number;
    private readonly workerSettings: mediasoupTypes.WorkerSettings;
    private readonly workerFactory: WorkerFactory;
    private readonly onWorkerDied?: WorkerManagerOptions['onWorkerDied'];
    private initialized = false;

    constructor(options: WorkerManagerOptions = {}) {
        this.workerCount = options.workerCount ?? 1;
        this.workerSettings = options.workerSettings ?? {};
        this.workerFactory = options.createWorker ?? createWorker;
        this.onWorkerDied = options.onWorkerDied;

        if (!Number.isInteger(this.workerCount) || this.workerCount < 1) {
            throw new Error('workerCount must be a positive integer.');
        }
    }

    get size(): number {
        return this.slots.length;
    }

    async initialize(): Promise<void> {
        // 여러 곳에서 초기화를 요청해도 Worker를 중복 생성하지 않는다.
        if (this.initialized) {
            return;
        }

        // 일부 Worker 생성 중 실패할 경우 이미 생성된 Worker를 정리하기 위한 임시 목록이다.
        const createdSlots: WorkerSlot[] = [];

        try {
            for (let index = 0; index < this.workerCount; index++) {
                const worker = await this.workerFactory(this.workerSettings);
                const slot: WorkerSlot = {
                    id: `worker-${index + 1}`,
                    worker,
                    roomCodes: new Set(),
                    healthy: true,
                };

                worker.on('died', (error) => {
                    // 죽은 Worker에는 이후 새로운 Room을 배치하지 않는다.
                    slot.healthy = false;
                    this.onWorkerDied?.(slot.id, error);
                });

                createdSlots.push(slot);
            }
        } catch (error) {
            for (const slot of createdSlots) {
                slot.worker.close();
            }

            throw error;
        }

        this.slots.push(...createdSlots);
        this.initialized = true;
    }

    async createRouter(
        roomCode: string,
        routerOptions: mediasoupTypes.RouterOptions,
    ): Promise<RouterAllocation> {
        if (!this.initialized) {
            throw new Error('WorkerManager has not been initialized.');
        }

        if (this.findSlotByRoom(roomCode)) {
            throw new Error(`Room ${roomCode} is already assigned to a Worker.`);
        }

        // Worker 선택 정책은 selectWorker 내부에 격리하여 추후 교체 가능하게 한다.
        const slot = this.selectWorker(roomCode);
        const router = await slot.worker.createRouter(routerOptions);
        slot.roomCodes.add(roomCode);

        return {
            workerId: slot.id,
            router,
        };
    }

    releaseRoom(roomCode: string): void {
        // Router 자체는 MediaRoom이 닫고, 여기서는 배치 정보만 제거한다.
        this.findSlotByRoom(roomCode)?.roomCodes.delete(roomCode);
    }

    close(): void {
        // 애플리케이션 종료 시 모든 native Worker 프로세스를 함께 종료한다.
        for (const slot of this.slots) {
            slot.worker.close();
            slot.roomCodes.clear();
            slot.healthy = false;
        }

        this.slots.length = 0;
        this.initialized = false;
    }

    getSnapshot(): ReadonlyArray<{
        id: string;
        healthy: boolean;
        roomCount: number;
    }> {
        // mediasoup 객체를 노출하지 않고 운영 상태에 필요한 값만 반환한다.
        return this.slots.map((slot) => ({
            id: slot.id,
            healthy: slot.healthy,
            roomCount: slot.roomCodes.size,
        }));
    }

    private selectWorker(_roomCode: string): WorkerSlot {
        const candidates = this.slots.filter((slot) => slot.healthy);

        if (candidates.length === 0) {
            throw new Error('No healthy mediasoup Worker is available.');
        }

        // 현재 정책은 할당된 Room 수가 가장 적은 Worker를 선택한다.
        return candidates.reduce((selected, candidate) => {
            return candidate.roomCodes.size < selected.roomCodes.size
                ? candidate
                : selected;
        });
    }

    private findSlotByRoom(roomCode: string): WorkerSlot | undefined {
        return this.slots.find((slot) => slot.roomCodes.has(roomCode));
    }
}
