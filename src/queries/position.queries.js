export const getInfoDelegadoQuery = `
SELECT * FROM LoginUniPass 
INNER JOIN Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo
WHERE Position.MatriculaEncargado = @Id
`;

export const createPositionQuery = `
INSERT INTO Position (MatriculaEncargado, ClassUser, Asignado, Activo) 
VALUES (@MatriculaEncargado, @ClassUser, @Asignado, @Activo);
SELECT SCOPE_IDENTITY() AS id;
`;

export const getPositionByIdQuery = `
SELECT * FROM Position WHERE IdCargo = @id
`;

export const updateActivoQuery = `
UPDATE Position SET Activo = @Activo WHERE IdCargo = @Id
`;
