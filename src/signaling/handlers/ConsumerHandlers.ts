import type { types as mediasoupTypes } from 'mediasoup';
import type { Socket } from 'socket.io';
import type { MediaRoomManager } from '../../managers';
import type {
    ConsumerAppData,
    MediaTag,
} from '../../media/MediaTypes';
import { getSignalingContext } from '../SignalingContext';
import { replyError, replySuccess } from '../SocketResponse';
import type { SocketAck } from '../SocketTypes';

export type ConsumerCreatePayload = {
    transportId?: unknown;
    producerId?: unknown;
    rtpCapabilities?: unknown;
};

export type ConsumerIdPayload = {
    consumerId?: unknown;
};

export type ConsumerCreateResponse = {
    id: string;
    producerId: string;
    peerId: string;
    kind: mediasoupTypes.MediaKind;
    rtpParameters: mediasoupTypes.RtpParameters;
    type: mediasoupTypes.ConsumerType;
    producerPaused: boolean;
    mediaTag: MediaTag;
};

const isObjectPayload = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
};

export const handleConsumerCreate = async (
    socket: Socket,
    payload: ConsumerCreatePayload,
    ack: SocketAck<ConsumerCreateResponse>,
    mediaRoomManager: MediaRoomManager,
): Promise<void> => {
    if (
        !isObjectPayload(payload) ||
        !isNonEmptyString(payload.transportId) ||
        !isNonEmptyString(payload.producerId) ||
        !isObjectPayload(payload.rtpCapabilities)
    ) {
        replyError(
            ack,
            'INVALID_CONSUMER_PAYLOAD',
            'transportId, producerId, and rtpCapabilities are required.',
        );
        return;
    }

    const context = getSignalingContext(socket, mediaRoomManager);

    if (!context) {
        replyError(ack, 'NOT_JOINED_ROOM', 'Socket has not joined a room.');
        return;
    }

    const transportId = payload.transportId.trim();
    const producerId = payload.producerId.trim();
    const transport = context.peer.getTransport(transportId);

    if (!transport) {
        replyError(
            ack,
            'TRANSPORT_NOT_FOUND',
            'Transport does not belong to this Peer.',
        );
        return;
    }

    if (context.peer.getTransportDirection(transportId) !== 'recv') {
        replyError(
            ack,
            'INVALID_TRANSPORT_DIRECTION',
            'Consumer must use the recv Transport.',
        );
        return;
    }

    const producerContext = context.mediaRoom.findProducer(producerId);

    if (!producerContext || producerContext.producer.closed) {
        replyError(
            ack,
            'PRODUCER_NOT_FOUND',
            'Producer does not exist in this MediaRoom.',
        );
        return;
    }

    if (producerContext.peer.peerId === context.peer.peerId) {
        replyError(
            ack,
            'CANNOT_CONSUME_OWN_PRODUCER',
            'Peer cannot consume its own Producer.',
        );
        return;
    }

    const rtpCapabilities =
        payload.rtpCapabilities as mediasoupTypes.RtpCapabilities;

    try {
        if (!context.mediaRoom.router.canConsume({
            producerId,
            rtpCapabilities,
        })) {
            replyError(
                ack,
                'CANNOT_CONSUME',
                'RTP capabilities cannot consume this Producer.',
            );
            return;
        }
    } catch (error) {
        console.error(error);
        replyError(
            ack,
            'CANNOT_CONSUME',
            'RTP capabilities cannot consume this Producer.',
        );
        return;
    }

    // 비동기 consume 호출 전에 Producer ID를 예약하여 중복 생성을 차단한다.
    if (!context.peer.beginConsumerCreation(producerId)) {
        replyError(
            ack,
            'CONSUMER_ALREADY_EXISTS',
            'Consumer for this Producer already exists or is being created.',
        );
        return;
    }

    let consumer: mediasoupTypes.Consumer | undefined;

    try {
        const appData: ConsumerAppData = {
            peerId: context.peer.peerId,
            producerPeerId: producerContext.peer.peerId,
        };

        // 클라이언트 Consumer가 생성되기 전에 key frame이 유실되지 않도록 paused로 시작한다.
        consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true,
            appData,
        });
        const consumerId = consumer.id;

        // 원본 Producer가 닫히면 클라이언트도 해당 원격 트랙을 제거한다.
        consumer.on('producerclose', () => {
            socket.emit('consumer:closed', {
                consumerId,
                producerId,
            });
        });

        context.peer.addConsumer(consumer, producerId);

        replySuccess(ack, {
            id: consumer.id,
            producerId,
            peerId: producerContext.peer.peerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused,
            mediaTag: producerContext.mediaTag,
        });
    } catch (error) {
        consumer?.close();
        context.peer.cancelConsumerCreation(producerId);
        console.error(error);
        replyError(
            ack,
            'CONSUMER_CREATE_FAILED',
            'Failed to create Consumer.',
        );
    }
};

export const handleConsumerResume = async (
    socket: Socket,
    payload: ConsumerIdPayload,
    ack: SocketAck<Record<string, never>>,
    mediaRoomManager: MediaRoomManager,
): Promise<void> => {
    const context = getConsumerRequestContext(
        socket,
        payload,
        ack,
        mediaRoomManager,
    );

    if (!context) {
        return;
    }

    try {
        await context.consumer.resume();
        replySuccess(ack, {});
    } catch (error) {
        console.error(error);
        replyError(
            ack,
            'CONSUMER_RESUME_FAILED',
            'Failed to resume Consumer.',
        );
    }
};

export const handleConsumerClose = (
    socket: Socket,
    payload: ConsumerIdPayload,
    ack: SocketAck<Record<string, never>>,
    mediaRoomManager: MediaRoomManager,
): void => {
    const context = getConsumerRequestContext(
        socket,
        payload,
        ack,
        mediaRoomManager,
    );

    if (!context) {
        return;
    }

    try {
        context.peer.removeConsumer(context.consumer.id);
        replySuccess(ack, {});
    } catch (error) {
        console.error(error);
        replyError(
            ack,
            'CONSUMER_CLOSE_FAILED',
            'Failed to close Consumer.',
        );
    }
};

const getConsumerRequestContext = (
    socket: Socket,
    payload: ConsumerIdPayload,
    ack: SocketAck<Record<string, never>>,
    mediaRoomManager: MediaRoomManager,
) => {
    if (!isObjectPayload(payload) || !isNonEmptyString(payload.consumerId)) {
        replyError(
            ack,
            'INVALID_CONSUMER_PAYLOAD',
            'consumerId is required.',
        );
        return undefined;
    }

    const signalingContext = getSignalingContext(socket, mediaRoomManager);

    if (!signalingContext) {
        replyError(ack, 'NOT_JOINED_ROOM', 'Socket has not joined a room.');
        return undefined;
    }

    const consumer = signalingContext.peer.getConsumer(
        payload.consumerId.trim(),
    );

    if (!consumer) {
        replyError(
            ack,
            'CONSUMER_NOT_FOUND',
            'Consumer does not belong to this Peer.',
        );
        return undefined;
    }

    return {
        peer: signalingContext.peer,
        consumer,
    };
};
