import 'dotenv/config';
import type { types as mediasoupTypes } from 'mediasoup';

// 숫자형 환경변수의 기본값과 허용 범위를 한곳에서 검증한다.
const readInteger = (
    name: string,
    defaultValue: number,
    minimum: number,
    maximum: number,
): number => {
    const rawValue = process.env[name];

    if (rawValue === undefined || rawValue.trim() === '') {
        return defaultValue;
    }

    const value = Number(rawValue);

    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(
            `${name} must be an integer between ${minimum} and ${maximum}.`,
        );
    }

    return value;
};

const readWorkerLogLevel = (): mediasoupTypes.WorkerLogLevel => {
    const value = process.env.MEDIASOUP_WORKER_LOG_LEVEL ?? 'warn';
    const allowedLevels: mediasoupTypes.WorkerLogLevel[] = [
        'debug',
        'warn',
        'error',
        'none',
    ];

    // mediasoup가 허용하지 않는 log level은 Worker 생성 전에 차단한다.
    if (!allowedLevels.includes(value as mediasoupTypes.WorkerLogLevel)) {
        throw new Error(
            `MEDIASOUP_WORKER_LOG_LEVEL must be one of ${allowedLevels.join(', ')}.`,
        );
    }

    return value as mediasoupTypes.WorkerLogLevel;
};

// 실제 미디어 패킷이 사용하는 UDP/TCP 포트 범위다.
const rtcMinPort = readInteger(
    'MEDIASOUP_RTC_MIN_PORT',
    40_000,
    1_024,
    65_535,
);
const rtcMaxPort = readInteger(
    'MEDIASOUP_RTC_MAX_PORT',
    49_999,
    1_024,
    65_535,
);

// 개별 값이 유효하더라도 최소/최대 포트의 순서가 뒤집히면 시작하지 않는다.
if (rtcMinPort > rtcMaxPort) {
    throw new Error(
        'MEDIASOUP_RTC_MIN_PORT must be less than or equal to MEDIASOUP_RTC_MAX_PORT.',
    );
}

/**
 * 애플리케이션에서 사용하는 환경변수를 시작 시점에 파싱하고 검증한 값이다.
 * 이후 모듈은 process.env를 직접 읽지 않고 이 객체를 사용한다.
 */
export const env = {
    httpPort: readInteger('HTTP_PORT', 3_000, 1, 65_535),
    mediasoup: {
        // 현재 운영 기본값은 1이며 WorkerManager는 이 값을 기준으로 확장 가능하다.
        workerCount: readInteger('MEDIASOUP_WORKER_COUNT', 1, 1, 128),
        workerLogLevel: readWorkerLogLevel(),
        rtcMinPort,
        rtcMaxPort,
        // 0.0.0.0은 모든 네트워크 인터페이스에서 미디어 연결을 수신한다.
        listenIp: process.env.MEDIASOUP_LISTEN_IP?.trim() || '0.0.0.0',
        // NAT/컨테이너 환경에서는 클라이언트가 접근 가능한 공인 주소가 필요하다.
        announcedAddress:
            process.env.MEDIASOUP_ANNOUNCED_ADDRESS?.trim() || undefined,
        initialAvailableOutgoingBitrate: readInteger(
            'MEDIASOUP_INITIAL_OUTGOING_BITRATE',
            1_000_000,
            100_000,
            100_000_000,
        ),
    },
} as const;
