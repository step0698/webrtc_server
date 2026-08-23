import type { types as mediasoupTypes } from 'mediasoup';
import type { Socket } from 'socket.io';
import { mediasoupConfig } from '../../config/mediasoup';
import type { MediaRoomManager } from '../../managers';
import type {
    TransportAppData,
    TransportDirection,
} from '../../media/MediaTypes';
import { getSignalingContext } from '../SignalingContext';
import { replyError, replySuccess } from '../SocketResponse';
import type { SocketAck } from '../SocketTypes';

export type TransportCreatePayload = {
    direction?: unknown;
};

export type TransportConnectPayload = {
    transportId?: unknown;
    dtlsParameters?: unknown;
};

export type TransportCreateResponse = {
    id: string;
    direction: TransportDirection;
    iceParameters: mediasoupTypes.IceParameters;
    iceCandidates: mediasoupTypes.IceCandidate[];
    dtlsParameters: mediasoupTypes.DtlsParameters;
    sctpParameters?: mediasoupTypes.SctpParameters;
};

const isObjectPayload = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
};

const isTransportDirection = (value: unknown): value is TransportDirection => {
    return value === 'send' || value === 'recv';
};

export const handleTransportCreate = async (
    socket: Socket,
    payload: TransportCreatePayload,
    ack: SocketAck<TransportCreateResponse>,
    mediaRoomManager: MediaRoomManager,
): Promise<void> => {
    if (!isObjectPayload(payload) || !isTransportDirection(payload.direction)) {
        replyError(
            ack,
            'INVALID_TRANSPORT_PAYLOAD',
            'direction must be send or recv.',
        );
        return;
    }

    const context = getSignalingContext(socket, mediaRoomManager);

    if (!context) {
        replyError(ack, 'NOT_JOINED_ROOM', 'Socket has not joined a room.');
        return;
    }

    const direction = payload.direction;

    // 비동기 Router 호출 전에 방향을 예약하여 동시 중복 생성을 차단한다.
    if (!context.peer.beginTransportCreation(direction)) {
        replyError(
            ack,
            'TRANSPORT_ALREADY_EXISTS',
            `${direction} Transport already exists or is being created.`,
        );
        return;
    }

    let transport: mediasoupTypes.WebRtcTransport | undefined;

    try {
        const appData: TransportAppData = {
            peerId: context.peer.peerId,
            direction,
        };

        transport = await context.mediaRoom.router.createWebRtcTransport({
            ...mediasoupConfig.webRtcTransportOptions,
            appData,
        });

        // 닫힌 DTLS 연결은 재사용할 수 없으므로 Transport도 함께 닫는다.
        transport.on('dtlsstatechange', (state) => {
            if (state === 'closed') {
                transport?.close();
            }
        });
        transport.on('icestatechange', (state) => {
            console.log(
                `Transport ${transport?.id} ICE state changed to ${state}.`,
            );
        });

        // 생성 중 Peer가 퇴장했다면 addTransport가 실패하고 아래 catch에서 닫힌다.
        context.peer.addTransport(transport, direction);

        replySuccess(ack, {
            id: transport.id,
            direction,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            sctpParameters: transport.sctpParameters,
        });
    } catch (error) {
        transport?.close();
        context.peer.cancelTransportCreation(direction);
        console.error(error);
        replyError(
            ack,
            'TRANSPORT_CREATE_FAILED',
            'Failed to create WebRTC Transport.',
        );
    }
};

export const handleTransportConnect = async (
    socket: Socket,
    payload: TransportConnectPayload,
    ack: SocketAck<Record<string, never>>,
    mediaRoomManager: MediaRoomManager,
): Promise<void> => {
    if (
        !isObjectPayload(payload) ||
        !isNonEmptyString(payload.transportId) ||
        !isObjectPayload(payload.dtlsParameters)
    ) {
        replyError(
            ack,
            'INVALID_TRANSPORT_PAYLOAD',
            'transportId and dtlsParameters are required.',
        );
        return;
    }

    const context = getSignalingContext(socket, mediaRoomManager);

    if (!context) {
        replyError(ack, 'NOT_JOINED_ROOM', 'Socket has not joined a room.');
        return;
    }

    const transport = context.peer.getTransport(payload.transportId.trim());

    if (!transport) {
        replyError(
            ack,
            'TRANSPORT_NOT_FOUND',
            'Transport does not belong to this Peer.',
        );
        return;
    }

    try {
        await transport.connect({
            dtlsParameters:
                payload.dtlsParameters as mediasoupTypes.DtlsParameters,
        });
        replySuccess(ack, {});
    } catch (error) {
        console.error(error);
        replyError(
            ack,
            'TRANSPORT_CONNECT_FAILED',
            'Failed to connect WebRTC Transport.',
        );
    }
};
