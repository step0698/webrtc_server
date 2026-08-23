# WebRTC Server

Express, Socket.IO, Prisma, PostgreSQL, mediasoup 기반의 WebRTC SFU 서버 프로젝트입니다. 룸 생성/조회 API를 제공하고, 생성된 `roomCode`를 기준으로 mediasoup Router와 Peer의 미디어 리소스를 관리합니다.

## 주요 기능

- Express 기반 HTTP 서버
- EJS 뷰 렌더링
- Socket.IO 서버 연결 및 접속 로그 출력
- Prisma 7 기반 PostgreSQL 연동
- Docker Compose 기반 로컬 PostgreSQL 실행
- 룸 생성 API
- 룸 목록 조회 API
- 충돌 가능성을 고려한 랜덤 룸 코드 생성
- mediasoup Worker 및 Router 생명주기 관리
- SFU MediaRoom 및 Peer 리소스 메모리 관리

## 기술 스택

- Node.js
- TypeScript
- Express
- Socket.IO
- mediasoup
- Prisma
- PostgreSQL
- Docker Compose
- EJS

## 프로젝트 구조

```text
.
├── db
│   ├── docker
│   │   ├── docker-compose.yml
│   │   └── .env.example
│   └── prisma
│       ├── schema.prisma
│       └── migrations
├── public
│   └── stylesheets
├── src
│   ├── app.ts
│   ├── controllers
│   │   └── roomController.ts
│   ├── config
│   │   ├── env.ts
│   │   └── mediasoup.ts
│   ├── managers
│   │   ├── MediaRoomManager.ts
│   │   └── WorkerManager.ts
│   ├── media
│   │   ├── MediaRoom.ts
│   │   └── MediaTypes.ts
│   ├── modules
│   │   ├── PeerSession.ts
│   │   ├── prisma.ts
│   │   ├── socket.io.ts
│   │   └── socketEvents.ts
│   ├── routes
│   │   ├── index.ts
│   │   └── room.ts
│   └── views
│       ├── error.ejs
│       └── index.ejs
├── package.json
├── prisma.config.ts
└── tsconfig.json
```

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

루트 환경변수 파일을 생성합니다.

```bash
cp .env.example .env
```

애플리케이션 실행에는 `DATABASE_URL`이 필요합니다.

```env
HTTP_PORT=3000
MEDIASOUP_WORKER_COUNT=1
MEDIASOUP_WORKER_LOG_LEVEL=warn
MEDIASOUP_RTC_MIN_PORT=40000
MEDIASOUP_RTC_MAX_PORT=49999
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_ADDRESS=
MEDIASOUP_INITIAL_OUTGOING_BITRATE=1000000
DATABASE_URL=postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}?schema={POSTGRES_SCHEMA}
```

Docker Compose로 DB와 Prisma 명령을 실행할 때는 `db/docker/.env` 파일도 필요합니다.

```bash
cp db/docker/.env.example db/docker/.env
```

예시:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=my_db
POSTGRES_SCHEMA=my_schema
PRISMA_DATABASE_URL=postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@postgres:5432/{POSTGRES_DB}?schema={POSTGRES_SCHEMA}
```

> `DATABASE_URL`은 로컬 Node.js 애플리케이션과 Prisma 설정에서 사용하고, `PRISMA_DATABASE_URL`은 Docker Compose의 Prisma 컨테이너에서 사용합니다.

### 3. PostgreSQL 실행

```bash
docker compose -f db/docker/docker-compose.yml up -d postgres
```

### 4. Prisma 마이그레이션 및 클라이언트 생성

```bash
npm run db:update
```

개별 실행도 가능합니다.

```bash
npm run db:migrate
npm run db:generate
```

### 5. 개발 서버 실행

```bash
npm run dev
```

기본 포트는 `3000`입니다.

```text
http://localhost:3000
```

## 스크립트

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | `tsx watch`로 개발 서버 실행 |
| `npm run typecheck` | TypeScript 타입 검사 |
| `npm run build` | TypeScript 빌드 |
| `npm start` | 빌드된 `dist/app.js` 실행 |
| `npm run db:generate` | Prisma Client 생성 |
| `npm run db:migrate` | Docker Compose Prisma 컨테이너로 마이그레이션 실행 |
| `npm run db:update` | 마이그레이션 후 Prisma Client 생성 |
| `npm run db:studio` | Prisma Studio 실행 |

## API

### 룸 생성

```http
POST /room
Content-Type: application/json
```

요청 본문:

```json
{
  "name": "test room"
}
```

성공 응답:

```json
{
  "status": 200,
  "message": "created successfully.",
  "data": {
    "id": "uuid",
    "roomCode": "r_ABCD2345",
    "name": "test room",
    "createdAt": "2026-06-23T00:00:00.000Z",
    "updatedAt": "2026-06-23T00:00:00.000Z"
  }
}
```

`name`이 비어 있으면 `400` 응답을 반환합니다.

```json
{
  "status": 400,
  "message": "Room name is required."
}
```

### 룸 목록 조회

```http
GET /room/list
```

성공 응답:

```json
{
  "status": 200,
  "message": "success",
  "data": [
    {
      "id": "uuid",
      "roomCode": "r_ABCD2345",
      "name": "test room",
      "createdAt": "2026-06-23T00:00:00.000Z",
      "updatedAt": "2026-06-23T00:00:00.000Z"
    }
  ]
}
```

## 룸 코드 규칙

룸 생성 시 서버가 `roomCode`를 자동 생성합니다.

- 접두사: `r_`
- 길이: 8자
- 사용 문자: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- 혼동되기 쉬운 문자를 제외한 대문자/숫자 조합
- DB unique 제약 조건 충돌 시 최대 5회 재시도

예시:

```text
r_X7K2P9QA
```

## Socket.IO

서버는 HTTP 서버 위에 Socket.IO를 함께 띄웁니다.

설정:

```ts
const io = new Server(httpServer, {
  pingInterval: 10000,
  pingTimeout: 20000
});
```

클라이언트가 연결되면 서버 콘솔에 socket id와 IP가 출력됩니다.

```text
a user connected -> socket id : <socket_id> (IP: <ip>)
```

### Room 참가

클라이언트는 DB에 존재하는 `roomCode`로 Socket.IO room에 참가합니다.

```ts
socket.emit('room:join', {
  roomCode: 'r_ABCD2345'
});
```

서버는 참가 처리 중 `peerId`를 UUID로 생성합니다. 클라이언트는 참가 성공 응답의 `peerId`를 저장한 뒤 이후 signaling 흐름에서 사용합니다.

참가 성공 시 새 참가자에게 전달됩니다.

```ts
socket.on('room:joined', (payload) => {
  // payload.roomCode
  // payload.peerId
  // payload.peers
  // payload.producers
  // payload.routerRtpCapabilities
});
```

기존 참가자들에게는 새 peer 입장 이벤트가 전달됩니다.

```ts
socket.on('peer:joined', (payload) => {
  // payload.peerId
  // payload.joinedAt
});
```

### WebRTC Transport 생성

Room 참가 후 `routerRtpCapabilities`로 mediasoup-client `Device`를 로드하고,
송신용과 수신용 Transport를 각각 하나씩 생성합니다. Transport 이벤트는
acknowledgement callback으로 성공 또는 실패를 반환합니다.

```ts
socket.emit(
  'transport:create',
  { direction: 'send' },
  (result) => {
    if (!result.ok) {
      console.error(result.error);
      return;
    }

    // result.data.id
    // result.data.direction
    // result.data.iceParameters
    // result.data.iceCandidates
    // result.data.dtlsParameters
    // result.data.sctpParameters
  }
);
```

`direction`은 `send` 또는 `recv`만 허용하며, 한 Peer는 방향별 Transport를
최대 하나씩 가질 수 있습니다.

### WebRTC Transport 연결

mediasoup-client Transport의 `connect` 이벤트에서 서버 Transport의 DTLS
연결을 완료합니다.

```ts
sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
  socket.emit(
    'transport:connect',
    {
      transportId: sendTransport.id,
      dtlsParameters
    },
    (result) => {
      if (!result.ok) {
        errback(new Error(result.error.message));
        return;
      }

      callback();
    }
  );
});
```

acknowledgement 응답 형식:

```ts
type SocketResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

### Producer 생성

연결된 send Transport에 마이크, 카메라 또는 화면 공유 Producer를 생성합니다.
미디어 태그와 kind는 다음 조합만 허용됩니다.

```text
microphone → audio
camera     → video
screen     → video
```

```ts
sendTransport.on('produce', (
  { kind, rtpParameters, appData },
  callback,
  errback
) => {
  socket.emit(
    'producer:create',
    {
      transportId: sendTransport.id,
      kind,
      rtpParameters,
      mediaTag: appData.mediaTag
    },
    (result) => {
      if (!result.ok) {
        errback(new Error(result.error.message));
        return;
      }

      callback({ id: result.data.id });
    }
  );
});
```

같은 MediaRoom의 다른 Peer에게는 새 Producer가 전달됩니다.

```ts
socket.on('producer:available', (payload) => {
  // payload.peerId
  // payload.producerId
  // payload.kind
  // payload.mediaTag
});
```

Peer당 `microphone`, `camera`, `screen` Producer를 각각 최대 하나씩 생성할 수
있습니다. 늦게 참가한 Peer는 `room:joined`의 `producers` 목록으로 기존
Producer를 확인할 수 있습니다.

### Producer 종료

```ts
socket.emit(
  'producer:close',
  { producerId },
  (result) => {
    if (!result.ok) {
      console.error(result.error);
    }
  }
);
```

명시적 종료 또는 send Transport 종료로 Producer가 닫히면 다른 Peer에게
다음 이벤트가 전달됩니다.

```ts
socket.on('producer:closed', (payload) => {
  // payload.peerId
  // payload.producerId
});
```

### Room 퇴장

```ts
socket.emit('room:leave');
```

퇴장 또는 연결 종료 시 같은 room의 남은 참가자들에게 전달됩니다.

```ts
socket.on('peer:left', (payload) => {
  // payload.peerId
});
```

### Socket.IO 에러 이벤트

시그널링 또는 room 참가 실패 시 서버는 표준 에러 이벤트를 보냅니다.

```ts
socket.on('room:error', (payload) => {
  // payload.code
  // payload.message
});
```

현재 사용되는 에러 코드:

| 코드 | 의미 |
| --- | --- |
| `INVALID_ROOM_JOIN_PAYLOAD` | room 참가 payload가 올바르지 않거나 `roomCode`가 없음 |
| `ALREADY_JOINED_ROOM` | 하나의 socket이 이미 room에 참가 중 |
| `ROOM_NOT_FOUND` | DB에 존재하지 않는 roomCode |
| `ROOM_JOIN_FAILED` | room 참가 처리 중 서버 오류 |
| `INVALID_TRANSPORT_PAYLOAD` | Transport 요청 payload가 올바르지 않음 |
| `NOT_JOINED_ROOM` | MediaRoom에 참가하지 않은 socket의 요청 |
| `TRANSPORT_ALREADY_EXISTS` | 같은 방향 Transport가 이미 존재하거나 생성 중 |
| `TRANSPORT_NOT_FOUND` | 요청한 Transport가 해당 Peer 소유가 아님 |
| `TRANSPORT_CREATE_FAILED` | WebRTC Transport 생성 실패 |
| `TRANSPORT_CONNECT_FAILED` | WebRTC Transport DTLS 연결 실패 |
| `INVALID_PRODUCER_PAYLOAD` | Producer 요청 또는 kind/mediaTag 조합이 올바르지 않음 |
| `INVALID_TRANSPORT_DIRECTION` | recv Transport로 Producer 생성 요청 |
| `PRODUCER_ALREADY_EXISTS` | 같은 mediaTag Producer가 이미 존재하거나 생성 중 |
| `PRODUCER_NOT_FOUND` | 요청한 Producer가 해당 Peer 소유가 아님 |
| `PRODUCER_CREATE_FAILED` | Producer 생성 실패 |
| `PRODUCER_CLOSE_FAILED` | Producer 종료 처리 실패 |

활성 MediaRoom과 Peer 상태는 `MediaRoomManager`의 메모리에서 관리됩니다. 서버 재시작 시 mediasoup Router와 현재 접속 상태는 초기화되고, DB의 룸 생성 정보는 PostgreSQL에 남습니다.

## 데이터베이스 모델

```prisma
model Room {
  id        String   @id @default(uuid()) @db.Uuid
  roomCode  String   @unique
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@schema("my_schema")
}
```

## 개발 메모

- 서버 진입점은 `src/app.ts`입니다.
- 정적 파일 경로는 `src/app.ts` 기준 `public` 디렉터리로 설정되어 있습니다.
- Prisma Client는 개발 환경에서 `globalThis`에 캐시되어 watch 모드에서 중복 인스턴스 생성을 줄입니다.
- `socket.io.ts`는 Socket.IO 이벤트 바인딩을 담당하고, MediaRoom 참가/퇴장은 `socketEvents.ts`, Transport와 Producer 처리는 `signaling/handlers`에 분리되어 있습니다.
- `WorkerManager`는 Worker 생성과 Room 배치를, `MediaRoomManager`는 활성 Router와 Peer 상태를 관리합니다.

## 타입 검사 및 빌드

```bash
npm run typecheck
npm run build
```

빌드 결과는 `dist` 디렉터리에 생성됩니다.
