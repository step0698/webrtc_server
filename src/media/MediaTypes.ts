import type { types as mediasoupTypes } from 'mediasoup';

// Worker와 현재 배치 상태를 함께 관리하기 위한 내부 단위다.
export type WorkerSlot = {
    id: string;
    worker: mediasoupTypes.Worker;
    roomCodes: Set<string>;
    healthy: boolean;
};

// WorkerManager가 Router 생성 결과를 MediaRoomManager에 전달할 때 사용한다.
export type RouterAllocation = {
    workerId: string;
    router: mediasoupTypes.Router;
};

// Peer가 소유한 mediasoup 리소스를 읽기 전용 목록으로 노출한다.
export type PeerResources = {
    transports: readonly mediasoupTypes.WebRtcTransport[];
    producers: readonly mediasoupTypes.Producer[];
    consumers: readonly mediasoupTypes.Consumer[];
};
