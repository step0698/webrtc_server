import type { types as mediasoupTypes } from 'mediasoup';

// 한 Peer는 송신용과 수신용 WebRTC Transport를 각각 하나씩 사용한다.
export type TransportDirection = 'send' | 'recv';

// Transport appData에는 서버가 검증한 소유자와 방향만 저장한다.
export type TransportAppData = mediasoupTypes.AppData & {
    peerId: string;
    direction: TransportDirection;
};

// Peer가 송출할 수 있는 미디어 소스를 클라이언트 UI 단위로 구분한다.
export type MediaTag = 'microphone' | 'camera' | 'screen';

// Producer appData에는 서버가 검증한 소유자와 미디어 태그만 저장한다.
export type ProducerAppData = mediasoupTypes.AppData & {
    peerId: string;
    mediaTag: MediaTag;
};

// Consumer appData에는 수신 Peer와 원본 Producer의 소유자 정보를 저장한다.
export type ConsumerAppData = mediasoupTypes.AppData & {
    peerId: string;
    producerPeerId: string;
};

export type PeerProducer = {
    producer: mediasoupTypes.Producer;
    mediaTag: MediaTag;
};

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
