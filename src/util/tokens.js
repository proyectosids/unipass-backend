import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || '15m';
const REFRESH_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || '30', 10);

if (!ACCESS_SECRET) {
    console.warn('[Auth] JWT_ACCESS_SECRET (o JWT_SECRET) no esta definido. Los tokens no se firmaran correctamente.');
}

export const generateAccessToken = (user) => {
    const payload = {
        id: user.IdLogin,
        matricula: user.Matricula,
        nombre: user.Nombre,
        apellidos: user.Apellidos,
        tipo: user.TipoUser,
        dormitorio: user.Dormitorio,
    };
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRATION });
};

export const generateRefreshToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

export const hashRefreshToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

export const getRefreshExpiresAt = () => {
    const d = new Date();
    d.setDate(d.getDate() + REFRESH_DAYS);
    return d;
};

export const REFRESH_DAYS_CONFIGURED = REFRESH_DAYS;
export const ACCESS_EXPIRATION_CONFIGURED = ACCESS_EXPIRATION;
