export const buscarCheckersQuery = `
SELECT * FROM LoginUniPass 
WHERE Correo = @CorreoCheck AND TipoUser = @User AND StatusActividad = @Activo
`;

export const cambiarActividadQuery = `
UPDATE LoginUniPass 
SET StatusActividad = @Actividad 
WHERE IdLogin = @IdLogin AND Matricula = @Credencial
`;

export const eliminarCheckerQuery = `
DELETE FROM LoginUniPass 
WHERE IdLogin = @IdLogin
`;
