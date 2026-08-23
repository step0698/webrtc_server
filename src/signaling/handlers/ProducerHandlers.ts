import type { types as mediasoupTypes } from 'mediasoup';
import type { Socket } from 'socket.io';
import type { MediaRoomManager } from '../../managers';
import type {
    MediaTag,
    ProducerAppData,
} from '../../media/MediaTypes';
import { getSignalingContext } from '../SignalingContext';
import { replyError, replySuccess } from '../SocketResponse';
import type { SocketAck } from '../SocketTypes';

export type ProducerCreatePayload = {
    transportId?: unknown;
    kind?: unknown;
    rtpParameters?: unknown;
    mediaTag?: unknown;
};

export type ProducerClosePayload = {
    producerId?: unknown;
};

export type ProducerCreateResponse = {
    id: string;
    kind: mediasoupTypes.MediaKind;
    mediaTag: MediaTag;
};

const isObjectPayload = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
};

const isMediaKind = (value: unknown): value is mediasoupTypes.MediaKind => {
    return value === 'audio' || value === 'video';
};

const isMediaTag = (value: unknown): value is MediaTag => {
    return value === 'microphone' || value === 'camera' || value === 'screen';
};

const isValidKindForMediaTag = (
    kind: mediasoupTypes.MediaKind,
    mediaTag: MediaTag,
): boolean => {
    return mediaTag === 'microphone' ? kind === 'audio' : kind === 'video';
};

export const handleProducerCreate = async (
    socket: Socket,
    payload: ProducerCreatePayload,
    ack: SocketAck<ProducerCreateResponse>,
    mediaRoomManager: MediaRoomManager,
): Promise<void> => {
    if (
        !isObjectPayload(payload) ||
        !isNonEmptyString(payload.transportId) ||
        !isMediaKind(payload.kind) ||
        !isObjectPayload(payload.rtpParameters) ||
        !isMediaTag(payload.mediaTag) ||
        !isValidKindForMediaTag(payload.kind, payload.mediaTag)
    ) {
        replyError(
            ack,
            'INVALID_PRODUCER_PAYLOAD',
            'transportId, kind, rtpParameters, and a matching mediaTag are required.',
        );
        return;
    }

    const context = getSignalingContext(socket, mediaRoomManager);

    if (!context) {
        replyError(ack, 'NOT_JOINED_ROOM', 'Socket has not joined a room.');
        return;
    }

    const transportId = payload.transportId.trim();
    const transport = context.peer.getTransport(transportId);

    if (!transport) {
        replyError(
            ack,
            'TRANSPORT_NOT_FOUND',
            'Transport does not belong to this Peer.',
        );
        return;
    }

    if (context.peer.getTransportDirection(transportId) !== 'send') {
        replyError(
            ack,
            'INVALID_TRANSPORT_DIRECTION',
            'Producer must use the send Transport.',
        );
        return;
    }

    const kind = payload.kind;
    const mediaTag = payload.mediaTag;

    // 비동기 produce 호출 전에 태그를 예약하여 동시 중복 생성을 차단한다.
    if (!context.peer.beginProducerCreation(mediaTag)) {
        replyError(
            ack,
            'PRODUCER_ALREADY_EXISTS',
            `${mediaTag} Producer already exists or is being created.`,
        );
        return;
    }

    let producer: mediasoupTypes.Producer | undefined;

    try {
        const appData: ProducerAppData = {
            peerId: context.peer.peerId,
            mediaTag,
        };

        producer = await transport.produce({
            kind,
            rtpParameters:
                payload.rtpParameters as mediasoupTypes.RtpParameters,
            appData,
        });
        const producerId = producer.id;

        // send Transport가 닫히면 다른 Peer도 해당 미디어를 제거하도록 알린다.
        producer.on('transportclose', () => {
            socket.to(context.mediaRoom.roomCode).emit('producer:closed', {
                peerId: context.peer.peerId,
                producerId,
            });
        });

        // 생성 중 Peer가 퇴장했다면 등록에 실패하고 catch에서 Producer를 닫는다.
        context.peer.addProducer(producer, mediaTag);

        const notification = {
            peerId: context.peer.peerId,
            producerId: producer.id,
            kind: producer.kind,
            mediaTag,
        };

        replySuccess(ack, {
            id: producer.id,
            kind: producer.kind,
            mediaTag,
        });
        socket.to(context.mediaRoom.roomCode).emit(
            'producer:available',
            notification,
        );
    } catch (error) {
        producer?.close();
        context.peer.cancelProducerCreation(mediaTag);
        console.error(error);
        replyError(
            ack,
            'PRODUCER_CREATE_FAILED',
            'Failed to create Producer.',
        );
    }
};

export const handleProducerClose = (
    socket: Socket,
    payload: ProducerClosePayload,
    ack: SocketAck<Record<string, never>>,
    mediaRoomManager: MediaRoomManager,
): void => {
    if (!isObjectPayload(payload) || !isNonEmptyString(payload.producerId)) {
        replyError(
            ack,
            'INVALID_PRODUCER_PAYLOAD',
            'producerId is required.',
        );
        return;
    }

    const context = getSignalingContext(socket, mediaRoomManager);

    if (!context) {
        replyError(ack, 'NOT_JOINED_ROOM', 'Socket has not joined a room.');
        return;
    }

    const producerId = payload.producerId.trim();
    const producer = context.peer.getProducer(producerId);

    if (!producer) {
        replyError(
            ack,
            'PRODUCER_NOT_FOUND',
            'Producer does not belong to this Peer.',
        );
        return;
    }

    try {
        context.peer.removeProducer(producerId);
        socket.to(context.mediaRoom.roomCode).emit('producer:closed', {
            peerId: context.peer.peerId,
            producerId,
        });
        replySuccess(ack, {});
    } catch (error) {
        console.error(error);
        replyError(
            ack,
            'PRODUCER_CLOSE_FAILED',
            'Failed to close Producer.',
        );
    }
};
