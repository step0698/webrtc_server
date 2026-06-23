import type { Request, Response } from 'express';

export default (express: typeof import('express')) => {
    const router = express.Router();

    router.get('/', (req: Request, res: Response) => {
        res.render('index', { title: 'Simple WebRTC Server' });
    })

    return router;
}