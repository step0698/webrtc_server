import type { Request, Response } from 'express';

export default (express: typeof import('express')) => {
    const router = express.Router();

    router.get('/', (req: Request, res: Response) => {
        res.json({status: 200, message: 'success'});
    })

    return router;
}