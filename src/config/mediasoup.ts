import type { types as mediasoupTypes } from 'mediasoup';
import { env } from './env';

// UDP와 TCP candidate에 동일하게 적용할 listen 주소와 동적 포트 범위다.
const listenInfoBase = {
    ip: env.mediasoup.listenIp,
    announcedAddress: env.mediasoup.announcedAddress,
    portRange: {
        min: env.mediasoup.rtcMinPort,
        max: env.mediasoup.rtcMaxPort,
    },
};

/**
 * mediasoup Worker, Router, WebRTC Transport가 공유하는 서버 설정이다.
 * Transport 설정은 다음 signaling 단계에서 실제 Transport 생성 시 사용한다.
 */
export const mediasoupConfig: {
    workerCount: number;
    workerSettings: mediasoupTypes.WorkerSettings;
    routerOptions: mediasoupTypes.RouterOptions;
    webRtcTransportOptions: mediasoupTypes.WebRtcTransportOptions;
} = {
    workerCount: env.mediasoup.workerCount,
    workerSettings: {
        logLevel: env.mediasoup.workerLogLevel,
        // 연결 및 품질 문제를 추적할 때 필요한 Worker 로그 범주다.
        logTags: [
            'info',
            'ice',
            'dtls',
            'rtp',
            'srtp',
            'rtcp',
            'rtx',
            'bwe',
        ],
    },
    routerOptions: {
        // Room의 모든 Producer/Consumer는 이 codec 집합을 기준으로 협상한다.
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48_000,
                channels: 2,
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90_000,
                parameters: {
                    'x-google-start-bitrate': 1_000,
                },
            },
        ],
    },
    webRtcTransportOptions: {
        // UDP를 우선 사용하고, UDP가 제한된 네트워크를 위해 TCP도 제공한다.
        listenInfos: [
            {
                protocol: 'udp',
                ...listenInfoBase,
            },
            {
                protocol: 'tcp',
                ...listenInfoBase,
            },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate:
            env.mediasoup.initialAvailableOutgoingBitrate,
        // 현재 단계에서는 오디오/영상만 처리하므로 DataChannel은 비활성화한다.
        enableSctp: false,
    },
};
