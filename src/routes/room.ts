import * as roomController from '../controllers/roomController';

export default (express: typeof import('express')) => {
    const router = express.Router();

    router.post('/', roomController.generateRoom);

    return router;
}
