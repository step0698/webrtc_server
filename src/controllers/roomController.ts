import type { NextFunction, Request, Response } from 'express';
import db from '../modules/prisma';

/* Room 생성 */
export const generateRoom = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const room = await db.room.create({ data: {
            name: req.body.name
        } });

        res.status(200).json({
            status: 200,
            message: 'created successfully.',
            data: room,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
        })
    }
}
