import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const SECRET_KEY = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

export const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Token no proporcionado' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            const expired = err.name === 'TokenExpiredError';
            return res.status(401).json({
                message: expired ? 'Access token expirado' : 'Token invalido',
                code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
            });
        }

        req.user = user;
        next();
    });
};
