import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const SECRET_KEY = process.env.JWT_SECRET;
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '7d';

export const generateToken = (user) => {
    const data = {
        id: user.IdLogin,
        matricula: user.Matricula,
        nombre: user.Nombre,
        apellidos: user.Apellidos,
        tipo: user.TipoUser,
        dormitorio: user.Dormitorio,
    };

    return jwt.sign(data, SECRET_KEY, {expiresIn: TOKEN_EXPIRY});
};