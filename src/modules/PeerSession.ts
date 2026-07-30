import type { types as mediasoupTypes } from 'mediasoup';
import type { PeerResources } from '../media/MediaTypes';

/**
 * Room에 접속한 한 Peer가 소유하는 mediasoup 리소스를 관리한다.
 * 각 리소스의 소유권을 한곳에 모아 disconnect 시 누락 없이 정리한다.
 */
export class PeerSession {
    readonly peerId: string;
    readonly socketId: string;
    readonly joinedAt: string;

    // ID 기반 signaling 요청을 빠르게 검증하고 처리하기 위한 저장소다.
    private readonly transports = new Map<string, mediasoupTypes.WebRtcTransport>();
    private readonly producers = new Map<string, mediasoupTypes.Producer>();
    private readonly consumers = new Map<string, mediasoupTypes.Consumer>();
    private closed = false;

    constructor(peerId: string, socketId: string) {
        this.peerId = peerId;
        this.socketId = socketId;
        this.joinedAt = new Date().toISOString();
    }

    get isClosed(): boolean {
        return this.closed;
    }

    addTransport(transport: mediasoupTypes.WebRtcTransport): void {
        this.assertOpen();
        this.assertUnique(this.transports, transport.id, 'Transport');
        this.transports.set(transport.id, transport);
        // 외부 원인으로 리소스가 먼저 닫혀도 로컬 Map에 잔존하지 않게 한다.
        transport.observer.once('close', () => {
            this.transports.delete(transport.id);
        });
    }

    getTransport(transportId: string): mediasoupTypes.WebRtcTransport | undefined {
        return this.transports.get(transportId);
    }

    addProducer(producer: mediasoupTypes.Producer): void {
        this.assertOpen();
        this.assertUnique(this.producers, producer.id, 'Producer');
        this.producers.set(producer.id, producer);
        // transport 종료 등으로 Producer가 닫힌 경우 자동으로 참조를 제거한다.
        producer.observer.once('close', () => {
            this.producers.delete(producer.id);
        });
    }

    getProducer(producerId: string): mediasoupTypes.Producer | undefined {
        return this.producers.get(producerId);
    }

    addConsumer(consumer: mediasoupTypes.Consumer): void {
        this.assertOpen();
        this.assertUnique(this.consumers, consumer.id, 'Consumer');
        this.consumers.set(consumer.id, consumer);
        // 원본 Producer 종료로 Consumer가 닫힌 경우 자동으로 참조를 제거한다.
        consumer.observer.once('close', () => {
            this.consumers.delete(consumer.id);
        });
    }

    getConsumer(consumerId: string): mediasoupTypes.Consumer | undefined {
        return this.consumers.get(consumerId);
    }

    getResources(): PeerResources {
        // 내부 Map을 직접 노출하지 않고 현재 값의 복사본을 반환한다.
        return {
            transports: Array.from(this.transports.values()),
            producers: Array.from(this.producers.values()),
            consumers: Array.from(this.consumers.values()),
        };
    }

    close(): void {
        // room:leave와 disconnect가 중복 발생해도 한 번만 종료한다.
        if (this.closed) {
            return;
        }

        this.closed = true;

        // 의존성이 높은 리소스부터 닫아 하위 리소스의 이벤트 처리를 단순화한다.
        for (const consumer of this.consumers.values()) {
            consumer.close();
        }
        for (const producer of this.producers.values()) {
            producer.close();
        }
        for (const transport of this.transports.values()) {
            transport.close();
        }

        this.consumers.clear();
        this.producers.clear();
        this.transports.clear();
    }

    private assertOpen(): void {
        if (this.closed) {
            throw new Error(`Peer ${this.peerId} is already closed.`);
        }
    }

    private assertUnique<T>(resources: Map<string, T>, id: string, name: string): void {
        if (resources.has(id)) {
            throw new Error(`${name} ${id} is already registered.`);
        }
    }
}
