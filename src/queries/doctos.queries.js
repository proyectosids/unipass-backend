export const getProfileQuery = `
SELECT Archivo FROM Doctos WHERE IdLogin = @id AND IdDocumento = @IdDocumento
`;

export const getDocumentsByUserQuery = `
SELECT * FROM Doctos WHERE IdLogin = @Id
`;

export const saveDocumentQuery = `
INSERT INTO Doctos (IdDocumento, Archivo, StatusDoctos, IdLogin)
VALUES (@IdDocumento, @Archivo, @StatusDoctos, @IdLogin);
SELECT SCOPE_IDENTITY() AS IdDoctos;
`;

export const uploadProfileQuery = `
UPDATE Doctos SET Archivo = @Archivo WHERE IdDocumento = @IdDocumento AND IdLogin = @IdLogin;
`;

export const getFilePathQuery = `
SELECT Archivo FROM Doctos WHERE IdLogin = @Id AND IdDocumento = @IdDocumento;
`;

export const deleteDocumentQuery = `
DELETE FROM Doctos WHERE IdLogin = @Id AND IdDocumento = @IdDocumento;
`;

export const getExpedientesAlumnosQuery = `
SELECT DISTINCT LoginUniPass.Matricula, LoginUniPass.Nombre, LoginUniPass.Apellidos
FROM Doctos 
INNER JOIN DocumentCatalog ON DocumentCatalog.IdDocument = Doctos.IdDocumento 
INNER JOIN LoginUniPass ON LoginUniPass.IdLogin = Doctos.IdLogin 
WHERE LoginUniPass.Dormitorio = @IdDormitorio AND LoginUniPass.TipoUser = 'ALUMNO'
`;

export const getArchivosAlumnoQuery = `
SELECT Doctos.*, DocumentCatalog.* 
FROM Doctos 
INNER JOIN DocumentCatalog ON DocumentCatalog.IdDocument = Doctos.IdDocumento
INNER JOIN LoginUniPass ON LoginUniPass.IdLogin = Doctos.IdLogin
WHERE LoginUniPass.Dormitorio = @Dormitorio 
  AND LoginUniPass.Nombre = @Nombre 
  AND LoginUniPass.Apellidos = @Apellidos
  AND DocumentCatalog.Estado = 'Activo'
`;

export const aprobarDocumentoQuery = `
UPDATE Doctos 
SET StatusRevision = 'Aprobado' 
WHERE IdLogin = @Id AND IdDocumento = @IdDocumento;
`;
