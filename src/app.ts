import createHttpError from 'http-errors';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import http from 'http';
import { Server } from 'socket.io';
import envs from 'dotenv';

import socketSetup from './modules/socket.io';

import indexRouterFactory from './routes/index';

const indexRouter = indexRouterFactory(express);

envs.config();

const HTTP_PORT = process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : 3000;

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createHttpError(404));
});

// error handler
app.use(function(err: createHttpError.HttpError, req: Request, res: Response, next: NextFunction) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

const httpServer = http.createServer(app).listen(HTTP_PORT, () => {
    console.log(`✅  Server is running at port ${HTTP_PORT}.`);
});

const io = new Server(httpServer, {
  pingInterval: 10000,
  pingTimeout: 20000
});

socketSetup(io);