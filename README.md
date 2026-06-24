# WebRTC Server

Express, Socket.IO, Prisma, PostgreSQL 기반의 간단한 WebRTC 시그널링 서버 프로젝트입니다. 룸 생성/조회 API를 제공하고, 생성된 `roomCode`를 기준으로 Socket.IO room에 참가한 peer 간 WebRTC offer, answer, ICE candidate를 중계합니다.

## 주요 기능

- Express 기반 HTTP 서버
- EJS 뷰 렌더링
- Socket.IO 서버 연결 및 접속 로그 출력
- Prisma 7 기반 PostgreSQL 연동
- Docker Compose 기반 로컬 PostgreSQL 실행
- 룸 생성 API
- 룸 목록 조회 API
- 충돌 가능성을 고려한 랜덤 룸 코드 생성
- Socket.IO 기반 WebRTC 시그널링 이벤트 중계
- room별 참가자/peer 상태 메모리 관리

## 기술 스택

- Node.js
- TypeScript
- Express
- Socket.IO
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
│   ├── modules
│   │   ├── prisma.ts
│   │   ├── signalingStore.ts
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
DATABASE_URL=postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:5432/{POSTGRES_DB}?schema={POSTGRES_SCHEMA}
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
PRISMA_DATABASE_URL=postgresql://postgres:password@postgres:5432/my_db?schema=my_schema
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
  roomCode: 'r_ABCD2345',
  peerId: 'optional-client-peer-id'
});
```

`peerId`를 보내지 않으면 서버가 UUID를 생성합니다.

참가 성공 시 새 참가자에게 전달됩니다.

```ts
socket.on('room:joined', (payload) => {
  // payload.roomCode
  // payload.peerId
  // payload.participants
});
```

기존 참가자들에게는 새 peer 입장 이벤트가 전달됩니다.

```ts
socket.on('peer:joined', (payload) => {
  // payload.peerId
  // payload.joinedAt
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

### WebRTC 시그널 중계

서버는 SDP/ICE payload의 내부 구조를 해석하지 않고 객체 형태만 확인한 뒤, 같은 room 안의 대상 peer socket 하나에만 전달합니다.

Offer:

```ts
socket.emit('signal:offer', {
  toPeerId: 'target-peer-id',
  offer: {}
});

socket.on('signal:offer', (payload) => {
  // payload.fromPeerId
  // payload.offer
});
```

Answer:

```ts
socket.emit('signal:answer', {
  toPeerId: 'target-peer-id',
  answer: {}
});

socket.on('signal:answer', (payload) => {
  // payload.fromPeerId
  // payload.answer
});
```

ICE candidate:

```ts
socket.emit('signal:ice-candidate', {
  toPeerId: 'target-peer-id',
  candidate: {}
});

socket.on('signal:ice-candidate', (payload) => {
  // payload.fromPeerId
  // payload.candidate
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
| `PEER_ALREADY_JOINED` | 같은 room에 동일 peerId가 이미 참가 중 |
| `ROOM_JOIN_FAILED` | room 참가 처리 중 서버 오류 |
| `NOT_JOINED_ROOM` | room에 참가하지 않은 socket이 signal 전송 |
| `INVALID_SIGNAL_PAYLOAD` | signal payload가 올바르지 않음 |
| `PEER_NOT_FOUND` | 대상 peer가 같은 room에 존재하지 않음 |

참가자 상태는 `signalingStore`의 메모리 `Map`으로 관리됩니다. 서버 재시작 시 현재 접속 상태는 초기화되고, 룸 생성 정보는 PostgreSQL에 남습니다.

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
- `socket.io.ts`는 Socket.IO 이벤트 바인딩을 담당하고, 실제 room 참가/퇴장/signaling 처리는 `socketEvents.ts`에 분리되어 있습니다.
- `signalingStore.ts`는 roomCode별 참가자 목록과 socket별 현재 참가 상태를 메모리에서 관리합니다.

## 타입 검사 및 빌드

```bash
npm run typecheck
npm run build
```

빌드 결과는 `dist` 디렉터리에 생성됩니다.
