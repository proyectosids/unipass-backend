export const createAuthorizeQuery = `
INSERT INTO Authorize (IdEmpleado, NoDepto, IdPermission, StatusAuthorize) 
VALUES (@IdEmpleado, @NoDepto, @IdPermission, @StatusAuthorize); 
SELECT SCOPE_IDENTITY() AS IdAuthorize;
`;

export const asignarPreceptorQuery = `
SELECT * FROM Bedroom 
WHERE NivelDormitorio = @NivelDormitorio AND Sexo = @Sexo;
`;

export const definirAutorizacionQuery = `
UPDATE Authorize 
SET StatusAuthorize = @StatusAuthorize 
WHERE IdAuthorize = (
    SELECT TOP 1 IdAuthorize 
    FROM Authorize 
    WHERE IdPermission = @IdPermiso AND IdEmpleado = @IdEmpleado 
    ORDER BY IdAuthorize
);
`;

export const selectUpdatedAuthorizationQuery = `
SELECT * FROM Authorize 
WHERE IdPermission = @IdPermiso 
  AND IdEmpleado = @IdEmpleado 
  AND StatusAuthorize = @StatusAuthorize 
ORDER BY IdAuthorize DESC;
`;

export const verificarValidacionQuery = `
SELECT * FROM Authorize 
WHERE IdEmpleado = @IdEmpleado AND IdPermission = @IdPermiso;
`;

export const advancePermissionQuery = `
SELECT * FROM Authorize 
WHERE IdPermission = @Id;
`;
