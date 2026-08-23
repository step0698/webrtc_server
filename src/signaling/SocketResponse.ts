import type { SocketAck } from './SocketTypes';

export const replySuccess = <T>(ack: SocketAck<T>, data: T): void => {
    ack({ ok: true, data });
};

export const replyError = <T>(
    ack: SocketAck<T>,
    code: string,
    message: string,
): void => {
    ack({ ok: false, error: { code, message } });
};
