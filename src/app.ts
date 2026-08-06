// 외부 module
import createHttpError from 'http-errors';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import http from 'http';
import { Server } from 'socket.io';
import { env } from './config/env';
import { mediasoupConfig } from './config/mediasoup';
import { MediaRoomManager, WorkerManager } from './managers';

// socket setting
import socketSetup from './modules/socket.io';

// api router setting
import indexRouterFactory from './routes/index';
import roomRouterFactory from './routes/room';

const indexRouter = indexRouterFactory(express);
const roomRouter = roomRouterFactory(express);

const app = express();

// Express view engine 및 공통 middleware 설정
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/room', roomRouter);

// 등록된 route가 처리하지 않은 요청을 404 error handler로 전달한다.
app.use(function(req, res, next) {
  next(createHttpError(404));
});

// Express 요청 처리 중 발생한 오류의 최종 응답을 담당한다.
app.use(function(err: createHttpError.HttpError, req: Request, res: Response, next: NextFunction) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// Worker 준비 전에는 listen하지 않고 HTTP 서버 객체만 먼저 생성한다.
const httpServer = http.createServer(app);

// Socket.IO는 HTTP 서버를 공유하지만 실제 연결 수신은 listen 이후 시작된다.
const io = new Server(httpServer, {
  pingInterval: 10000,
  pingTimeout: 20000,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 현재는 Worker 한 개를 사용하지만 설정값으로 확장 가능한 Manager를 구성한다.
export const workerManager = new WorkerManager({
  workerCount: mediasoupConfig.workerCount,
  workerSettings: mediasoupConfig.workerSettings,
  onWorkerDied: (workerId, error) => {
    console.error(`mediasoup ${workerId} died.`, error);
  },
});

// 아직 signaling에는 연결하지 않으며 다음 단계에서 Socket.IO handler에 주입한다.
export const mediaRoomManager = new MediaRoomManager(
  workerManager,
  mediasoupConfig.routerOptions,
);

// Socket.IO signaling 계층이 활성 SFU Room 상태를 공유하도록 Manager를 주입한다.
socketSetup(io, mediaRoomManager);

const listen = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // 포트 충돌 등 listen 단계의 오류를 bootstrap 호출자에게 전달한다.
    const handleError = (error: Error) => {
      reject(error);
    };

    httpServer.once('error', handleError);
    httpServer.listen(env.httpPort, () => {
      httpServer.off('error', handleError);
      console.log(`✅ Server is running at port ${env.httpPort}.`);
      resolve();
    });
  });
};

/**
 * mediasoup가 준비되기 전에 클라이언트 요청을 받지 않도록
 * Worker 초기화가 성공한 이후 HTTP/Socket.IO 서버를 시작한다.
 */
export const bootstrap = async (): Promise<void> => {
  // Worker 생성 실패 시 HTTP 포트를 열지 않고 그대로 시작에 실패한다.
  await workerManager.initialize();
  console.log(`✅ ${workerManager.size} mediasoup Worker initialized.`);

  try {
    await listen();
  } catch (error) {
    // HTTP 서버를 열지 못했다면 이미 생성한 native Worker 프로세스를 정리한다.
    workerManager.close();
    throw error;
  }
};

void bootstrap().catch((error) => {
  // 시작 실패를 운영 환경에서 감지할 수 있도록 비정상 종료 코드를 설정한다.
  console.error('Failed to start server.', error);
  process.exitCode = 1;
});
