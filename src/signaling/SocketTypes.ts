export type SocketError = {
    code: string;
    message: string;
};

export type SocketResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: SocketError };

export type SocketAck<T> = (result: SocketResult<T>) => void;
