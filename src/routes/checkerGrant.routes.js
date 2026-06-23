import { Router } from 'express';
import { verifyToken } from '../Middleware/verifityToken.js';
import { requireRole } from '../Middleware/authorizeRoles.js';
import {
    postCheckerGrant,
    getCheckerGrantsByPoint,
    getCheckerGrantsByUser,
    putCheckerGrant,
    deleteCheckerGrant,
    getCapabilities
} from '../controllers/checkerGrant.controller.js';
import { buscarPersona } from '../controllers/user.controllers.js';

const router = Router();

// Roles que pueden otorgar/gestionar grants.
const canGrant = requireRole('PRECEPTOR', 'VIGILANCIA');

// Gestion de grants (solo PRECEPTOR / VIGILANCIA)
router.post('/checkerGrant', verifyToken, canGrant, postCheckerGrant);
router.get('/checkerGrants/:idPoint', verifyToken, canGrant, getCheckerGrantsByPoint);
router.get('/checkerGrantsByUser/:idLogin', verifyToken, canGrant, getCheckerGrantsByUser);
router.put('/checkerGrant/:idGrant', verifyToken, canGrant, putCheckerGrant);
router.delete('/checkerGrant/:idGrant', verifyToken, canGrant, deleteCheckerGrant);

// Busqueda de persona para asignar grant (alias de /buscarUser, incluye alumnos)
router.get('/buscarPersona/:Nombre', verifyToken, canGrant, buscarPersona);

// Capabilities del usuario autenticado (cualquier rol)
router.get('/getCapabilities', verifyToken, getCapabilities);

export default router;
