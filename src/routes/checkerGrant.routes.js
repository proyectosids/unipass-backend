import { Router } from 'express';
import { verifyToken } from '../Middleware/verifityToken.js';
import { requireRole } from '../Middleware/authorizeRoles.js';
import {
    postCheckerGrant,
    getCheckerGrantsScoped,
    getCheckerGrantsByUser,
    putCheckerGrant,
    deleteCheckerGrant,
    getCapabilities,
    buscarPersonaAsignable
} from '../controllers/checkerGrant.controller.js';

const router = Router();

// Roles que pueden otorgar/gestionar grants.
const canGrant = requireRole('PRECEPTOR', 'VIGILANCIA');

// Gestion de grants (solo PRECEPTOR / VIGILANCIA)
router.post('/checkerGrant', verifyToken, canGrant, postCheckerGrant);
router.get('/checkerGrants', verifyToken, canGrant, getCheckerGrantsScoped);
router.get('/checkerGrantsByUser/:idLogin', verifyToken, canGrant, getCheckerGrantsByUser);
router.put('/checkerGrant/:idGrant', verifyToken, canGrant, putCheckerGrant);
router.delete('/checkerGrant/:idGrant', verifyToken, canGrant, deleteCheckerGrant);

// Busqueda de persona para asignar grant: LIKE parcial, solo activos, campos seguros.
router.get('/buscarPersona/:Nombre', verifyToken, canGrant, buscarPersonaAsignable);

// Capabilities del usuario autenticado (cualquier rol)
router.get('/getCapabilities', verifyToken, getCapabilities);

export default router;
