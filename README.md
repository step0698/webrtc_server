# WebRTC Server

Express, Socket.IO, Prisma, PostgreSQL 기반의 간단한 WebRTC 시그널링 서버 프로젝트입니다. 현재 구현은 WebRTC 룸 생성을 위한 HTTP API와 Socket.IO 연결 기반을 제공하며, 룸 정보는 PostgreSQL에 저장됩니다.

## 주요 기능

- Express 기반 HTTP 서버
- EJS 뷰 렌더링
- Socket.IO 서버 연결 및 접속 로그 출력
- Prisma 7 기반 PostgreSQL 연동
- Docker Compose 기반 로컬 PostgreSQL 실행
- 룸 생성 API
- 충돌 가능성을 고려한 랜덤 룸 코드 생성

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
│   │   └── socket.io.ts
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

현재는 연결 이벤트 기반만 구성되어 있으며, 실제 WebRTC offer/answer/candidate 교환 이벤트는 이후 확장 지점입니다.

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

## 타입 검사 및 빌드

```bash
npm run typecheck
npm run build
```

빌드 결과는 `dist` 디렉터리에 생성됩니다.
