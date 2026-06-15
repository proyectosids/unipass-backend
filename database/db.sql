-- CREATE DATABASE UniPass;

USE UniPass;

--CREATE TABLE Tutors (
--    Id INT IDENTITY(1, 1) PRIMARY KEY,
--    Nombre VARCHAR(100) NOT NULL,
----  Apellidos Varchar(100) NOT NULL,
--    Telefono VARCHAR(10) NOT NULL,
----  Direccion VARCHAR(150) NOT NULL,
----  Pais VARCHAR(150) NOT NULL,
----  Estado VARCHAR(150) NOT NULL,
----  Cuidad VARCHAR(150) NOT NULL,
----  CP_Tutor VARCHAR(150) NOT NULL,
--    Direccion VARCHAR(100),
--    Correo VARCHAR(80),
--)

-- DROP TABLE Tutors

INSERT INTO Tutors (Nombre , Telefono ,Celular , Direccion ,Correo) 
VALUES ('Irving Yael', '2871150148', '2121447548', 'Av. Loma Alta', 'iyael117@gmail.com');

-- CREATE TABLE Workplaces (
--     IdCentroTrabajo INT IDENTITY(1,1) PRIMARY KEY,
--     Departamento VARCHAR(100) NOT NULL,
--     JefeDepto VARCHAR(100),
-- )

INSERT INTO Workplaces (Departamento , JefeDepto)
VALUES ('Vigilancia', 'Samir Reyes');
INSERT INTO Workplaces (Departamento , JefeDepto)
VALUES ('Industrias', 'Eli Meza');
INSERT INTO Workplaces (Departamento , JefeDepto)
VALUES ('Limpieza', 'Maria Nava');
INSERT INTO Workplaces (Departamento , JefeDepto)
VALUES ('Comedor', 'Eney Cruz');
INSERT INTO Workplaces (Departamento , JefeDepto)
VALUES ('H.V.U.', 'Melitzyn Barrera');
INSERT INTO Workplaces (Departamento , JefeDepto)
VALUES ('H.S.U.', 'Laudy vazquez');

-- DROP TABLE Permission

CREATE TABLE Users (
    IdUser INT IDENTITY(1,1) PRIMARY KEY,
    Matricula VARCHAR(20) NOT NULL,
    Contraseña VARCHAR(50) NOT NULL,
    Correo VARCHAR(60) NOT NULL,
    Nombre VARCHAR(100) NOT NULL,
    Telefono VARCHAR(12) NOT NULL,
    Celular VARCHAR(12) NOT NULL,
    Sexo VARCHAR(10) NOT NULL, -- hACER OPCCIONES (hOMBRE O mUJER)
    Domicilio VARCHAR(120) NOT NULL,
    TipoUser VARCHAR(20) NOT NULL,
    IdTutor INT NOT NULL,
    IdTrabajo INT NOT NULL,
    -- IdDocumentos INT NOT NULL
    -- IdAviso INT NOT NUL    
    CONSTRAINT chk_sexo CHECK (Sexo IN ('Hombre', 'Mujer')),
    CONSTRAINT chk_tipouser CHECK (TipoUser IN ('Alumno', 'Empleado', 'Departamento')),
)

ALTER TABLE Users
ADD NivelAcademico VARCHAR(60) NULL

CREATE TABLE TypeExit (
    IdExit INT IDENTITY PRIMARY KEY,
    Descripcion VARCHAR(120),
    -- CONSTRAINT chk_typeexit CHECK (Descripcion IN ('Pueblo', 'Especial', 'A casa'))
)

INSERT INTO typeExit (Descripcion) VALUES('Pueblo');
INSERT INTO typeExit (Descripcion) VALUES('Especial');
INSERT INTO typeExit (Descripcion) VALUES('A casa');

CREATE TABLE Permission (
    IdPermission INT IDENTITY PRIMARY KEY,
    FechaSolicitada DATETIME NOT NULL,
    StatusPermission VARCHAR(30) DEFAULT 'Pendiente',
    FechaSalida DATETIME NOT NULL,
    FechaRegreso DATETIME NOT NULL,
    Motivo VARCHAR(150) NOT NULL,
    CheckSalidaDormitorio DATETIME,
    CheckRegresoDormitorio DATETIME,
    CheckSalidaVigilancia DATETIME,
    CheckRegresoVigilancia DATETIME,
    MedioSalida VARCHAR(30) NOT NULL,
    IdUsuario INT NOT NULL,
    IdTipoSalida INT Not NULL,
    CONSTRAINT fk_Id_usuario FOREIGN KEY (IdUsuario) REFERENCES Users(IdUser),
    CONSTRAINT fk_Id_tiposalida FOREIGN KEY (IdTipoSalida) REFERENCES TypeExit(IdExit),
    CONSTRAINT CHK_mediosalida CHECK (MedioSalida IN ('Caminando', 'En vehiculo')),
    CONSTRAINT CHK_statuspermission CHECK (StatusPermission IN ('Aprobada', 'Rechazada', 'Pendiente')),
)

-- Elimina la restricción CHECK existente
ALTER TABLE Permission DROP CONSTRAINT CHK_statuspermission;

-- Añade una nueva restricción CHECK con la opción adicional
ALTER TABLE Permission ADD CONSTRAINT CHK_statuspermission CHECK (StatusPermission IN ('Aprobada', 'Rechazada', 'Pendiente', 'Cancelado'));

ALTER TABLE Permission
ADD PuntoPartida VARCHAR(60) DEFAULT 'Caseta'

ALTER TABLE Permission
DROP COLUMN PuntoPartida


CREATE TABLE DocumentCatalog (
    IdDocument INT IDENTITY PRIMARY KEY,
    TipoDocumento VARCHAR(120) NOT NULL
)

INSERT INTO DocumentCatalog (TipoDocumento) VALUES ('Reglamento ULV')
INSERT INTO DocumentCatalog (TipoDocumento) VALUES ('Reglamento HVU')
INSERT INTO DocumentCatalog (TipoDocumento) VALUES ('Reglamento HVNM')
INSERT INTO DocumentCatalog (TipoDocumento) VALUES ('Reglamento HSU')
INSERT INTO DocumentCatalog (TipoDocumento) VALUES ('Reglamento HSNM')
INSERT INTO DocumentCatalog (TipoDocumento) VALUES ('Acuerdo de consentimietno')
INSERT INTO DocumentCatalog (TipoDocumento) VALUES ('Convenio de salidas')
INSERT INTO DocumentCatalog (TipoDocumento) VALUES ('Imagen Perfil')

CREATE TABLE Doctos (
    IdDoctos INT IDENTITY PRIMARY KEY,
    IdDocumento INT NOT NULL,
    Archivo VARCHAR(200),
    StatusDoctos VARCHAR(60),
    IdUser INT NOT NULL
    CONSTRAINT fk_id_document FOREIGN KEY (IdDocumento) REFERENCES DocumentCatalog(IdDocument),
    CONSTRAINT fk_id_user FOREIGN KEY (IdUser) REFERENCES Users(IdUser)
)

-- DROP TABLE Doctos

-- ============================================================
-- Tabla RefreshToken: persiste hash de refresh tokens (rotation)
-- ============================================================
CREATE TABLE RefreshToken (
    RefreshTokenId INT IDENTITY PRIMARY KEY,
    IdLogin INT NOT NULL,
    TokenHash VARCHAR(128) NOT NULL,
    ExpiresAt DATETIME NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    RevokedAt DATETIME NULL,
    ReplacedByTokenHash VARCHAR(128) NULL,
    DeviceInfo VARCHAR(255) NULL,
    CONSTRAINT fk_refreshtoken_login FOREIGN KEY (IdLogin) REFERENCES LoginUniPass(IdLogin)
);

CREATE INDEX IX_RefreshToken_IdLogin ON RefreshToken (IdLogin);
CREATE UNIQUE INDEX IX_RefreshToken_TokenHash ON RefreshToken (TokenHash);

-- Limpieza periodica (ejecutar como job o manualmente):
-- DELETE FROM RefreshToken WHERE ExpiresAt < GETDATE() OR (RevokedAt IS NOT NULL AND RevokedAt < DATEADD(DAY, -30, GETDATE()));

-- ============================================================
-- Authorize: enriquecimiento para UI de aprobaciones
-- ============================================================
ALTER TABLE Authorize ADD FechaAprobacion DATETIME NULL;
ALTER TABLE Authorize ADD DualRole BIT NOT NULL DEFAULT 0;
