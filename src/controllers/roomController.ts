import type { NextFunction, Request, Response } from 'express';
import { randomInt } from 'crypto';
import db from '../modules/prisma';

const ROOM_CODE_PREFIX = 'r_';
const ROOM_CODE_LENGTH = 8;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOM_CODE_RETRIES = 5;

const generateRoomCode = () => {
    let code = '';

    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    }

    return `${ROOM_CODE_PREFIX}${code}`;
};

/* Room 생성 */
export const generateRoom = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

        if (!name) {
            return res.status(400).json({
                status: 400,
                message: 'Room name is required.',
            });
        }

        // unique 하지 않을 시 재시도
        for (let attempt = 0; attempt < MAX_ROOM_CODE_RETRIES; attempt++) {
            try {
                const room = await db.room.create({
                    data: {
                        name,
                        roomCode: generateRoomCode(),
                    },
                });

                return res.status(200).json({
                    status: 200,
                    message: 'created successfully.',
                    data: room,
                });
            } catch (error: any) {
                if (error?.code !== 'P2002') {
                    throw error;
                }
            }
        }

        return res.status(500).json({
            status: 500,
            message: 'Failed to generate unique room code.',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
        })
    }
}
