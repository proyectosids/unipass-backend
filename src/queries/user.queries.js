export const getUserByIdQuery = `
SELECT * FROM LoginUniPass WHERE IdLogin = @Id
`;

export const getUserByMatriculaQuery = `
SELECT * FROM LoginUniPass WHERE Matricula = @Matricula
`;

export const getCheckersByEmailQuery = `
SELECT * FROM LoginUniPass WHERE TipoUser = 'DEPARTAMENTO' AND Correo = @EmailEncargado
`;

export const searchPersonQuery = `
SELECT 
    lp.*, 
    CASE 
        WHEN p.MatriculaEncargado IS NOT NULL THEN 'Existe en Position' 
        ELSE 'No existe en Position' 
    END AS ExisteEnPosition
FROM 
    LoginUniPass AS lp
LEFT JOIN 
    Position AS p ON lp.Matricula = p.Asignado
WHERE 
    (lp.Nombre = @Nombre OR lp.Apellidos = @Nombre)
`;

export const getTokenFCMQuery = `
IF EXISTS (
    SELECT * FROM LoginUniPass 
    INNER JOIN Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo
    WHERE Position.MatriculaEncargado = @Matricula
        AND Position.Activo = 1
)
BEGIN
    SELECT TokenCFM FROM LoginUniPass 
    INNER JOIN Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo
    WHERE Position.MatriculaEncargado = @Matricula
        AND Position.Activo = 1
END
ELSE
BEGIN
    SELECT TokenCFM FROM LoginUniPass WHERE Matricula = @Matricula
END
`;

export const updateDocumentStatusQuery = `
UPDATE LoginUniPass SET Documentacion = @StatusDoc WHERE Matricula = @Matricula
`;

export const updateTokenFCMQuery = `
UPDATE LoginUniPass SET TokenCFM = @TokenCFM WHERE Matricula = @Matricula
`;

export const getIdCargoDelegadoQuery = `
SELECT IdCargoDelegado FROM LoginUniPass WHERE Matricula = @Matricula
`;

export const setIdCargoDelegadoNullQuery = `
UPDATE LoginUniPass SET IdCargoDelegado = NULL WHERE Matricula = @Matricula
`;

export const deletePositionQuery = `
DELETE FROM Position WHERE IdCargo = @IdCargo
`;

export const updateCargoQuery = `
UPDATE LoginUniPass SET IdCargoDelegado = @Delegado WHERE Matricula = @Matricula
`;

export const getInfoCargoQuery = `
SELECT * FROM LoginUniPass 
INNER JOIN Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo 
WHERE LoginUniPass.Matricula = @Id
`;
