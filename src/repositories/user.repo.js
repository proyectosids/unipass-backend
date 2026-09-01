import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// === LoginUniPass: lecturas ===

// Uso INTERNO (verificación de password, resolución de identidad del token, etc.): trae el registro
// completo (incluye Contraseña/TokenCFM). NUNCA serializar su resultado directo a HTTP: usar toSafeUser
// o findSafeUserById. (BOLA/IDOR R1.)
export const findUserById = (id) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, id)
            .query('SELECT * FROM UNIPASS.LoginUniPass WHERE IdLogin = @Id');
        return result.recordset[0] || null;
    });

// BOLA/IDOR R1: proyección SEGURA por IdLogin (SELECT explícito de campos no sensibles). Para /me y
// respuestas de perfil. NO incluye Contraseña ni TokenCFM (capa 1 de defensa; toSafeUser es la capa 2).
export const findSafeUserById = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, idLogin)
            .query(`SELECT IdLogin, Matricula, Correo, Nombre, Apellidos, TipoUser, Sexo,
                           FechaNacimiento, Celular, StatusActividad, Dormitorio, IdCargoDelegado, Documentacion
                    FROM UNIPASS.LoginUniPass WHERE IdLogin = @Id`);
        return result.recordset[0] || null;
    });

export const findUserByMatricula = (matricula) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query('SELECT * FROM UNIPASS.LoginUniPass WHERE Matricula = @Matricula');
        return result.recordset[0] || null;
    });

// Task 7.1.B: usuario por Correo (para recuperación de contraseña). null si no existe.
export const findUserByCorreo = (correo) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Correo', sql.VarChar, correo)
            .query('SELECT * FROM UNIPASS.LoginUniPass WHERE Correo = @Correo');
        return result.recordset[0] || null;
    });

export const findUserByMatriculaOrCorreo = (value) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, value)
            .query('SELECT * FROM UNIPASS.LoginUniPass WHERE Matricula = @Matricula OR Correo = @Matricula');
        return result.recordset[0] || null;
    });

// RETIRADO (BOLA/IDOR R1): findCheckersByEmail (GET /userChecks, modelo DEPARTAMENTO retirado,
// SELECT * incl. hash, anónimo) y findPersonaByNombreOApellidos (GET /buscarUser, SELECT lp.* incl.
// hash/token, enumeración anónima por nombre) fueron ELIMINADAS junto con sus endpoints. La búsqueda
// de personas segura y protegida vive en searchAssignablePersonsByName (GET /buscarPersona, canGrant).

// Busqueda de personas asignables como checador (pantalla de gestion).
// LIKE parcial sobre nombre/apellidos; solo activos; sin DEPARTAMENTO (retirado).
// SELECT explicito de campos seguros: NO expone Contraseña, TokenCFM ni Correo.
export const searchAssignablePersonsByName = (q) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('q', sql.VarChar, q)
            .query(`SELECT IdLogin, Matricula, Nombre, Apellidos, TipoUser
                    FROM UNIPASS.LoginUniPass
                    WHERE StatusActividad = 1
                      AND TipoUser <> 'DEPARTAMENTO'
                      AND (
                          Nombre COLLATE Latin1_General_CI_AI LIKE '%' + @q + '%'
                          OR Apellidos COLLATE Latin1_General_CI_AI LIKE '%' + @q + '%'
                          OR (Nombre + ' ' + Apellidos) COLLATE Latin1_General_CI_AI LIKE '%' + @q + '%'
                      )
                    ORDER BY Nombre, Apellidos`);
        return result.recordset;
    });

// Preceptor activo de un dormitorio (Bedroom.IdBedroom = LoginUniPass.Dormitorio).
// Su Matricula numerica es el IdEmpleado que usa Authorize: equivale al "ID JEFE"
// que la app resuelve hoy con la API institucional (/api/datos/prece por NoDepto).
export const findPreceptorMatriculaByDormitorio = (dormitorio) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Dormitorio', sql.Int, dormitorio)
            .query(`SELECT TOP 1 Matricula FROM UNIPASS.LoginUniPass
                    WHERE TipoUser = 'PRECEPTOR'
                      AND Dormitorio = @Dormitorio
                      AND StatusActividad = 1`);
        return result.recordset[0]?.Matricula ?? null;
    });

// Coordinador de dormitorios activo (ADMINISTRATIVO). Su Matricula = IdEmpleado en
// Authorize; el NoDepto sale de su dormitorio (LoginUniPass.Dormitorio ->
// Bedroom.IdBedroom -> Identificador). Permite resolver al coordinador sin fijar su
// id en Configuracion: cuando cambie el ADMINISTRATIVO activo, se hereda solo.
export const findCoordinadorActivo = () =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .query(`SELECT TOP 1 L.Matricula AS IdEmpleado, B.Identificador AS NoDepto
                    FROM UNIPASS.LoginUniPass L
                    LEFT JOIN UNIPASS.Bedroom B ON B.IdBedroom = L.Dormitorio
                    WHERE L.TipoUser = 'ADMINISTRATIVO'
                      AND L.StatusActividad = 1
                    ORDER BY L.IdLogin`);
        return result.recordset[0] || null;
    });

export const findTokenFCMByMatricula = (matricula) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query(`IF EXISTS (
                        SELECT * FROM UNIPASS.LoginUniPass
                        INNER JOIN UNIPASS.Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo
                        WHERE Position.MatriculaEncargado = @Matricula
                          AND Position.Activo = 1
                    )
                    BEGIN
                        SELECT TokenCFM FROM UNIPASS.LoginUniPass
                        INNER JOIN UNIPASS.Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo
                        WHERE Position.MatriculaEncargado = @Matricula
                          AND Position.Activo = 1
                    END
                    ELSE
                    BEGIN
                        SELECT TokenCFM FROM UNIPASS.LoginUniPass WHERE Matricula = @Matricula
                    END`);
        return result.recordset;
    });

// === LoginUniPass: escrituras ===

// Task 7.1: cambio de contraseña del usuario AUTENTICADO (identidad = IdLogin del token).
export const updateUserPasswordById = (idLogin, hashedPassword) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, idLogin)
            .input('Password', sql.VarChar, hashedPassword)
            .query('UPDATE UNIPASS.LoginUniPass SET Contraseña = @Password WHERE IdLogin = @Id');
        return result.rowsAffected[0] > 0;
    });

// RETIRADO (P0): updateUserPassword(correo) — actualizaba la contraseña por correo arbitrario, sin
// identidad autenticada ni resetToken. Eliminada junto con PUT /password/:Correo. La única escritura
// por identidad es updateUserPasswordById (arriba, por IdLogin del token); la recuperación usa
// consumeResetAndUpdatePasswordTx (por IdLogin ligado a un resetToken válido). No reintroducir una
// función genérica correo -> contraseña accesible fuera de esos flujos.

export const updateDocumentacion = (matricula, statusDoc) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .input('StatusDoc', sql.Int, statusDoc)
            .query('UPDATE UNIPASS.LoginUniPass SET Documentacion = @StatusDoc WHERE Matricula = @Matricula');
        return result.rowsAffected[0] > 0;
    });

export const updateTokenFCM = (matricula, tokenCFM) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .input('TokenCFM', sql.VarChar, tokenCFM)
            .query('UPDATE UNIPASS.LoginUniPass SET TokenCFM = @TokenCFM WHERE Matricula = @Matricula');
        return result.rowsAffected[0] > 0;
    });

export const clearTokenFCMByMatricula = (matricula) =>
    withConnection(async (pool) => {
        await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query('UPDATE UNIPASS.LoginUniPass SET TokenCFM = NULL WHERE Matricula = @Matricula');
    });

// === Cargo / Position ===

export const findIdCargoDelegadoByMatricula = (matricula) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query('SELECT IdCargoDelegado FROM UNIPASS.LoginUniPass WHERE Matricula = @Matricula');
        if (result.recordset.length === 0) return undefined;
        return result.recordset[0].IdCargoDelegado;
    });

export const clearIdCargoDelegado = (matricula) =>
    withConnection(async (pool) => {
        await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query('UPDATE UNIPASS.LoginUniPass SET IdCargoDelegado = NULL WHERE Matricula = @Matricula');
    });

export const deletePositionByIdCargo = (idCargo) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdCargo', sql.VarChar, idCargo.toString())
            .query('DELETE FROM UNIPASS.Position WHERE IdCargo = @IdCargo');
        return result.rowsAffected[0] > 0;
    });

export const updateUserCargo = (matricula, idCargoDelegado) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .input('Delegado', sql.Int, idCargoDelegado)
            .query('UPDATE UNIPASS.LoginUniPass SET IdCargoDelegado = @Delegado WHERE Matricula = @Matricula');
        return result.rowsAffected[0] > 0;
    });

