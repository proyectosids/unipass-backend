export const getUserByMatriculaQuery = `
SELECT * FROM LoginUniPass WHERE Matricula = @Matricula;
`;

export const getUserByCorreoQuery = `
SELECT * FROM LoginUniPass WHERE Correo = @Correo;
`;

export const updatePasswordQuery = `
UPDATE LoginUniPass 
SET Contraseña = @Password 
WHERE Correo = @Correo AND TipoUser != @TipoUser;
`;
