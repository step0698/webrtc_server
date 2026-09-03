import type { types as mediasoupTypes } from 'mediasoup';
import type {
    MediaTag,
    PeerProducer,
    PeerResources,
    TransportDirection,
} from '../media/MediaTypes';

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
    private readonly transportIdsByDirection = new Map<TransportDirection, string>();
    private readonly pendingTransportDirections = new Set<TransportDirection>();
    private readonly producers = new Map<string, mediasoupTypes.Producer>();
    private readonly producerIdsByMediaTag = new Map<MediaTag, string>();
    private readonly pendingProducerMediaTags = new Set<MediaTag>();
    private readonly consumers = new Map<string, mediasoupTypes.Consumer>();
    private readonly consumerIdsByProducerId = new Map<string, string>();
    private readonly pendingConsumerProducerIds = new Set<string>();
    private closed = false;

    constructor(peerId: string, socketId: string) {
        this.peerId = peerId;
        this.socketId = socketId;
        this.joinedAt = new Date().toISOString();
    }

    get isClosed(): boolean {
        return this.closed;
    }

    beginTransportCreation(direction: TransportDirection): boolean {
        this.assertOpen();

        if (
            this.transportIdsByDirection.has(direction) ||
            this.pendingTransportDirections.has(direction)
        ) {
            return false;
        }

        this.pendingTransportDirections.add(direction);
        return true;
    }

    cancelTransportCreation(direction: TransportDirection): void {
        this.pendingTransportDirections.delete(direction);
    }

    addTransport(
        transport: mediasoupTypes.WebRtcTransport,
        direction: TransportDirection,
    ): void {
        this.assertOpen();
        this.assertUnique(this.transports, transport.id, 'Transport');

        if (this.transportIdsByDirection.has(direction)) {
            throw new Error(`${direction} Transport is already registered.`);
        }

        this.transports.set(transport.id, transport);
        this.transportIdsByDirection.set(direction, transport.id);
        this.pendingTransportDirections.delete(direction);
        // 외부 원인으로 리소스가 먼저 닫혀도 로컬 Map에 잔존하지 않게 한다.
        transport.observer.once('close', () => {
            this.transports.delete(transport.id);
            if (this.transportIdsByDirection.get(direction) === transport.id) {
                this.transportIdsByDirection.delete(direction);
            }
        });
    }

    getTransport(transportId: string): mediasoupTypes.WebRtcTransport | undefined {
        return this.transports.get(transportId);
    }

    getTransportByDirection(
        direction: TransportDirection,
    ): mediasoupTypes.WebRtcTransport | undefined {
        const transportId = this.transportIdsByDirection.get(direction);
        return transportId ? this.transports.get(transportId) : undefined;
    }

    getTransportDirection(
        transportId: string,
    ): TransportDirection | undefined {
        for (const [direction, id] of this.transportIdsByDirection) {
            if (id === transportId) {
                return direction;
            }
        }

        return undefined;
    }

    removeTransport(transportId: string): boolean {
        const transport = this.transports.get(transportId);

        if (!transport) {
            return false;
        }

        transport.close();
        this.transports.delete(transportId);

        for (const [direction, id] of this.transportIdsByDirection) {
            if (id === transportId) {
                this.transportIdsByDirection.delete(direction);
                break;
            }
        }

        return true;
    }

    beginProducerCreation(mediaTag: MediaTag): boolean {
        this.assertOpen();

        if (
            this.producerIdsByMediaTag.has(mediaTag) ||
            this.pendingProducerMediaTags.has(mediaTag)
        ) {
            return false;
        }

        this.pendingProducerMediaTags.add(mediaTag);
        return true;
    }

    cancelProducerCreation(mediaTag: MediaTag): void {
        this.pendingProducerMediaTags.delete(mediaTag);
    }

    addProducer(
        producer: mediasoupTypes.Producer,
        mediaTag: MediaTag,
    ): void {
        this.assertOpen();
        this.assertUnique(this.producers, producer.id, 'Producer');

        if (this.producerIdsByMediaTag.has(mediaTag)) {
            throw new Error(`${mediaTag} Producer is already registered.`);
        }

        this.producers.set(producer.id, producer);
        this.producerIdsByMediaTag.set(mediaTag, producer.id);
        this.pendingProducerMediaTags.delete(mediaTag);
        // transport 종료 등으로 Producer가 닫힌 경우 자동으로 참조를 제거한다.
        producer.observer.once('close', () => {
            this.producers.delete(producer.id);
            if (this.producerIdsByMediaTag.get(mediaTag) === producer.id) {
                this.producerIdsByMediaTag.delete(mediaTag);
            }
        });
    }

    getProducer(producerId: string): mediasoupTypes.Producer | undefined {
        return this.producers.get(producerId);
    }

    getProducerByMediaTag(mediaTag: MediaTag): mediasoupTypes.Producer | undefined {
        const producerId = this.producerIdsByMediaTag.get(mediaTag);
        return producerId ? this.producers.get(producerId) : undefined;
    }

    listProducers(): readonly PeerProducer[] {
        const result: PeerProducer[] = [];

        for (const [mediaTag, producerId] of this.producerIdsByMediaTag) {
            const producer = this.producers.get(producerId);

            if (producer) {
                result.push({ producer, mediaTag });
            }
        }

        return result;
    }

    removeProducer(producerId: string): mediasoupTypes.Producer | undefined {
        const producer = this.producers.get(producerId);

        if (!producer) {
            return undefined;
        }

        producer.close();
        this.producers.delete(producerId);

        for (const [mediaTag, id] of this.producerIdsByMediaTag) {
            if (id === producerId) {
                this.producerIdsByMediaTag.delete(mediaTag);
                break;
            }
        }

        return producer;
    }

    beginConsumerCreation(producerId: string): boolean {
        this.assertOpen();

        if (
            this.consumerIdsByProducerId.has(producerId) ||
            this.pendingConsumerProducerIds.has(producerId)
        ) {
            return false;
        }

        this.pendingConsumerProducerIds.add(producerId);
        return true;
    }

    cancelConsumerCreation(producerId: string): void {
        this.pendingConsumerProducerIds.delete(producerId);
    }

    addConsumer(
        consumer: mediasoupTypes.Consumer,
        producerId: string,
    ): void {
        this.assertOpen();
        this.assertUnique(this.consumers, consumer.id, 'Consumer');

        if (this.consumerIdsByProducerId.has(producerId)) {
            throw new Error(`Consumer for Producer ${producerId} is already registered.`);
        }

        this.consumers.set(consumer.id, consumer);
        this.consumerIdsByProducerId.set(producerId, consumer.id);
        this.pendingConsumerProducerIds.delete(producerId);
        // 원본 Producer 종료로 Consumer가 닫힌 경우 자동으로 참조를 제거한다.
        consumer.observer.once('close', () => {
            this.consumers.delete(consumer.id);
            if (this.consumerIdsByProducerId.get(producerId) === consumer.id) {
                this.consumerIdsByProducerId.delete(producerId);
            }
        });
    }

    getConsumer(consumerId: string): mediasoupTypes.Consumer | undefined {
        return this.consumers.get(consumerId);
    }

    getConsumerByProducerId(
        producerId: string,
    ): mediasoupTypes.Consumer | undefined {
        const consumerId = this.consumerIdsByProducerId.get(producerId);
        return consumerId ? this.consumers.get(consumerId) : undefined;
    }

    removeConsumer(consumerId: string): mediasoupTypes.Consumer | undefined {
        const consumer = this.consumers.get(consumerId);

        if (!consumer) {
            return undefined;
        }

        consumer.close();
        this.consumers.delete(consumerId);

        for (const [producerId, id] of this.consumerIdsByProducerId) {
            if (id === consumerId) {
                this.consumerIdsByProducerId.delete(producerId);
                break;
            }
        }

        return consumer;
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
        this.consumerIdsByProducerId.clear();
        this.pendingConsumerProducerIds.clear();
        this.producers.clear();
        this.producerIdsByMediaTag.clear();
        this.pendingProducerMediaTags.clear();
        this.transports.clear();
        this.transportIdsByDirection.clear();
        this.pendingTransportDirections.clear();
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
