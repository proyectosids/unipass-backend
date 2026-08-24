/* =============================================================================
   UNIPASS — Script de creación completo
   Base de datos:  UNIPASS
   Esquema:        UNIPASS   (tablas referenciadas como UNIPASS.<Tabla>)
   Contenido:      15 tablas, constraints, índices, descripciones (MS_Description)
                   y datos semilla (catálogos) necesarios para que la app arranque.
   Idempotente a nivel de BD/esquema; las tablas se crean si no existen.
   Ejecutar con SSMS o:  node scripts/run-sql.js database/schema/UNIPASS_full_schema.sql
   ============================================================================= */

/* ---------- 1. Base de datos ---------- */
IF DB_ID('UNIPASS') IS NULL
    CREATE DATABASE UNIPASS;
GO
USE UNIPASS;
GO

/* ---------- 2. Esquema ---------- */
IF SCHEMA_ID('UNIPASS') IS NULL
    EXEC('CREATE SCHEMA UNIPASS');
GO

/* =============================================================================
   3. TABLAS  (orden por dependencias de FK)
   ============================================================================= */

/* --- Catálogo de tipos de salida --- */
IF OBJECT_ID('UNIPASS.TypeExit','U') IS NULL
CREATE TABLE UNIPASS.TypeExit (
    IdTypeExit  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TypeExit PRIMARY KEY,
    Descripcion VARCHAR(50) NOT NULL
);
GO

/* --- Dormitorios --- */
IF OBJECT_ID('UNIPASS.Bedroom','U') IS NULL
CREATE TABLE UNIPASS.Bedroom (
    IdBedroom       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Bedroom PRIMARY KEY,
    Identificador   VARCHAR(5)  NOT NULL,   -- id institucional (315..351)
    Nombre          VARCHAR(20) NOT NULL,
    NivelDormitorio VARCHAR(30) NOT NULL,
    Sexo            VARCHAR(15) NOT NULL
);
GO

/* --- Cargos / suplencias entre empleados --- */
IF OBJECT_ID('UNIPASS.Position','U') IS NULL
CREATE TABLE UNIPASS.Position (
    IdCargo            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Position PRIMARY KEY,
    MatriculaEncargado VARCHAR(15) NOT NULL,
    ClassUser          VARCHAR(25) NOT NULL,
    Asignado           VARCHAR(15) NOT NULL,
    Activo             INT NOT NULL
);
GO

/* --- Catálogo de documentos --- */
IF OBJECT_ID('UNIPASS.DocumentCatalog','U') IS NULL
CREATE TABLE UNIPASS.DocumentCatalog (
    IdDocument    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DocumentCatalog PRIMARY KEY,
    TipoDocumento VARCHAR(120) NOT NULL,
    Estado        VARCHAR(30) NULL CONSTRAINT DF_DocumentCatalog_Estado DEFAULT ('Inactivo')
);
GO

/* --- Configuración clave/valor (operable con UPDATE, sin redeploy) --- */
IF OBJECT_ID('UNIPASS.Configuracion','U') IS NULL
CREATE TABLE UNIPASS.Configuracion (
    Clave       NVARCHAR(80)  NOT NULL CONSTRAINT PK_Configuracion PRIMARY KEY,
    Valor       NVARCHAR(200) NOT NULL,
    Descripcion NVARCHAR(300) NULL
);
GO

/* --- Usuarios (alumnos y empleados) --- */
IF OBJECT_ID('UNIPASS.LoginUniPass','U') IS NULL
CREATE TABLE UNIPASS.LoginUniPass (
    IdLogin         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LoginUniPass PRIMARY KEY,
    Matricula       VARCHAR(10)  NOT NULL,
    [Contraseña]    VARCHAR(MAX) NOT NULL,   -- hash bcrypt
    Correo          VARCHAR(80)  NOT NULL,
    Nombre          VARCHAR(120) NOT NULL,
    Apellidos       VARCHAR(120) NOT NULL,
    TipoUser        VARCHAR(20)  NOT NULL,   -- ALUMNO|EMPLEADO|PRECEPTOR|VIGILANCIA|ADMINISTRATIVO
    Sexo            VARCHAR(15)  NOT NULL,
    FechaNacimiento DATETIME     NOT NULL,
    Celular         VARCHAR(15)  NOT NULL,
    StatusActividad INT NULL,
    Dormitorio      INT NULL CONSTRAINT FK_LoginUniPass_Bedroom  REFERENCES UNIPASS.Bedroom(IdBedroom),
    IdCargoDelegado INT NULL CONSTRAINT FK_LoginUniPass_Position REFERENCES UNIPASS.Position(IdCargo),
    TokenCFM        VARCHAR(MAX) NULL,
    Documentacion   INT NULL
);
GO

/* --- Puntos de control (por tipo de salida) --- */
IF OBJECT_ID('UNIPASS.Point','U') IS NULL
CREATE TABLE UNIPASS.Point (
    IdPoint     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Point PRIMARY KEY,
    NombrePunto VARCHAR(30) NOT NULL,   -- Dormitorio|Caseta
    IdExit      INT NOT NULL CONSTRAINT FK_Point_TypeExit REFERENCES UNIPASS.TypeExit(IdTypeExit)
);
GO

/* --- Permisos de salida --- */
IF OBJECT_ID('UNIPASS.Permission','U') IS NULL
CREATE TABLE UNIPASS.Permission (
    IdPermission     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Permission PRIMARY KEY,
    FechaSolicitada  DATETIME NOT NULL,
    StatusPermission VARCHAR(30) NULL CONSTRAINT DF_Permission_Status DEFAULT ('Pendiente')
        CONSTRAINT CK_Permission_Status CHECK (StatusPermission IN ('Pendiente','Aprobada','Rechazada','Cancelado')),
    FechaSalida      DATETIME NOT NULL,
    FechaRegreso     DATETIME NOT NULL,
    Motivo           VARCHAR(150) NOT NULL,
    IdUser           INT NOT NULL CONSTRAINT FK_Permission_LoginUniPass REFERENCES UNIPASS.LoginUniPass(IdLogin),
    IdTipoSalida     INT NOT NULL CONSTRAINT FK_Permission_TypeExit     REFERENCES UNIPASS.TypeExit(IdTypeExit),
    Observaciones    VARCHAR(50) NULL CONSTRAINT DF_Permission_Obs DEFAULT ('Ninguna'),
    Aprobo           VARCHAR(15) NULL   -- en desuso
);
GO

/* --- Cadena de autorización por permiso --- */
IF OBJECT_ID('UNIPASS.Authorize','U') IS NULL
CREATE TABLE UNIPASS.Authorize (
    IdAuthorize     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Authorize PRIMARY KEY,
    IdEmpleado      INT NOT NULL,   -- matrícula institucional del autorizador (no IdLogin)
    NoDepto         INT NOT NULL,
    IdPermission    INT NOT NULL CONSTRAINT FK_Authorize_Permission REFERENCES UNIPASS.Permission(IdPermission),
    StatusAuthorize VARCHAR(60) NULL,   -- Pendiente|Aprobada|Rechazada
    DualRole        BIT NOT NULL CONSTRAINT DF_Authorize_DualRole DEFAULT (0),
    FechaAprobacion DATETIME NULL,
    Orden           INT NOT NULL CONSTRAINT DF_Authorize_Orden DEFAULT (1)
);
GO

/* --- Checks (4 por permiso) --- */
IF OBJECT_ID('UNIPASS.CheckPoints','U') IS NULL
CREATE TABLE UNIPASS.CheckPoints (
    IdCheck       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CheckPoints PRIMARY KEY,
    FechaCheck    DATETIME NULL,
    Estatus       VARCHAR(30) NULL CONSTRAINT CK_CheckPoints_Estatus CHECK (Estatus IN ('Confirmada','No confirmada','Pendiente')),
    Accion        VARCHAR(30) NOT NULL CONSTRAINT CK_CheckPoints_Accion CHECK (Accion IN ('SALIDA','RETORNO')),
    IdPoint       INT NOT NULL CONSTRAINT FK_CheckPoints_Point       REFERENCES UNIPASS.Point(IdPoint),
    IdPermission  INT NOT NULL CONSTRAINT FK_CheckPoints_Permission  REFERENCES UNIPASS.Permission(IdPermission),
    Observaciones VARCHAR(120) NULL CONSTRAINT DF_CheckPoints_Obs DEFAULT ('Ninguna'),
    ConfirmadoPor INT NULL CONSTRAINT FK_CheckPoints_ConfirmadoPor   REFERENCES UNIPASS.LoginUniPass(IdLogin)
);
GO

/* --- Capabilities asignables: CHECKER / SUPERVISOR --- */
IF OBJECT_ID('UNIPASS.CheckerGrant','U') IS NULL
CREATE TABLE UNIPASS.CheckerGrant (
    IdGrant       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CheckerGrant PRIMARY KEY,
    IdLogin       INT NOT NULL CONSTRAINT FK_CheckerGrant_Login    REFERENCES UNIPASS.LoginUniPass(IdLogin),
    IdPoint       INT NULL     CONSTRAINT FK_CheckerGrant_Point    REFERENCES UNIPASS.Point(IdPoint),  -- legado
    Scope         NVARCHAR(10) NOT NULL CONSTRAINT CK_CheckerGrant_Scope CHECK (Scope IN ('SALIDA','RETORNO','AMBOS')),
    AsignadoPor   INT NOT NULL CONSTRAINT FK_CheckerGrant_Asignado REFERENCES UNIPASS.LoginUniPass(IdLogin),
    Activo        BIT NOT NULL CONSTRAINT DF_CheckerGrant_Activo DEFAULT (1),
    Vigencia      NVARCHAR(12) NOT NULL CONSTRAINT CK_CheckerGrant_Vigencia CHECK (Vigencia IN ('TEMPORAL','PERMANENTE')),
    FechaExpira   DATETIME NULL,
    FechaCreacion DATETIME NOT NULL CONSTRAINT DF_CheckerGrant_Fecha DEFAULT (GETDATE()),
    Tipo          NVARCHAR(12) NULL CONSTRAINT CK_CheckerGrant_Tipo CHECK (Tipo IS NULL OR Tipo IN ('Dormitorio','Caseta')),
    IdDormitorio  INT NULL,
    Capability    NVARCHAR(20) NOT NULL CONSTRAINT DF_CheckerGrant_Capability DEFAULT ('CHECKER')
        CONSTRAINT CK_CheckerGrant_Capability CHECK (Capability IN ('CHECKER','SUPERVISOR')),
    CONSTRAINT UQ_CheckerGrant_Tipo_Dorm UNIQUE (IdLogin, Tipo, IdDormitorio)
);
GO

/* --- Documentos del expediente --- */
IF OBJECT_ID('UNIPASS.Doctos','U') IS NULL
CREATE TABLE UNIPASS.Doctos (
    IdDoctos          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Doctos PRIMARY KEY,
    IdDocumento       INT NOT NULL CONSTRAINT FK_Doctos_DocumentCatalog REFERENCES UNIPASS.DocumentCatalog(IdDocument),
    Archivo           VARCHAR(200) NULL,
    StatusDoctos      VARCHAR(60) NULL CONSTRAINT DF_Doctos_Status DEFAULT ('Inactivo'),
    IdLogin           INT NOT NULL CONSTRAINT FK_Doctos_LoginUniPass REFERENCES UNIPASS.LoginUniPass(IdLogin),
    StatusRevision    VARCHAR(255) NULL CONSTRAINT DF_Doctos_Revision DEFAULT ('Pendiente'),
    MotivoRechazo     VARCHAR(80) NULL,
    ComentarioRechazo NVARCHAR(500) NULL,
    RechazadoPor      VARCHAR(20) NULL,
    FechaRechazo      DATETIME NULL
);
GO

/* --- Refresh tokens (sesiones) --- */
IF OBJECT_ID('UNIPASS.RefreshToken','U') IS NULL
CREATE TABLE UNIPASS.RefreshToken (
    RefreshTokenId      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RefreshToken PRIMARY KEY,
    IdLogin             INT NOT NULL CONSTRAINT FK_RefreshToken_Login REFERENCES UNIPASS.LoginUniPass(IdLogin),
    TokenHash           VARCHAR(128) NOT NULL,
    ExpiresAt           DATETIME NOT NULL,
    CreatedAt           DATETIME NOT NULL CONSTRAINT DF_RefreshToken_Created DEFAULT (GETDATE()),
    RevokedAt           DATETIME NULL,
    ReplacedByTokenHash VARCHAR(128) NULL,
    DeviceInfo          VARCHAR(255) NULL,
    CONSTRAINT UQ_RefreshToken_TokenHash UNIQUE (TokenHash)
);
GO

/* --- Reset tokens de recuperación de contraseña --- */
IF OBJECT_ID('UNIPASS.PasswordReset','U') IS NULL
CREATE TABLE UNIPASS.PasswordReset (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PasswordReset PRIMARY KEY,
    IdLogin        INT NOT NULL,   -- relación lógica a LoginUniPass (sin FK, por diseño)
    ResetTokenHash NVARCHAR(128) NOT NULL,
    ExpiraEn       DATETIME NOT NULL,
    UsadoEn        DATETIME NULL,
    FechaCreacion  DATETIME NOT NULL CONSTRAINT DF_PasswordReset_Fecha DEFAULT (GETDATE())
);
GO

/* --- Idempotencia de POST /permission --- */
IF OBJECT_ID('UNIPASS.IdempotencyRequest','U') IS NULL
CREATE TABLE UNIPASS.IdempotencyRequest (
    IdempotencyKey NVARCHAR(80) NOT NULL CONSTRAINT PK_IdempotencyRequest PRIMARY KEY,
    IdLogin        INT NOT NULL,   -- relación lógica a LoginUniPass (sin FK, por diseño)
    IdPermission   INT NULL,
    FechaCreacion  DATETIME NOT NULL CONSTRAINT DF_IdempotencyRequest_Fecha DEFAULT (GETDATE())
);
GO

/* =============================================================================
   4. ÍNDICES de apoyo (dashboards, bandejas, lookups)
   ============================================================================= */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Permission_Status_Tipo' AND object_id=OBJECT_ID('UNIPASS.Permission'))
    CREATE NONCLUSTERED INDEX IX_Permission_Status_Tipo ON UNIPASS.Permission (StatusPermission, IdTipoSalida) INCLUDE (IdUser, FechaSalida, FechaSolicitada);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Permission_FechaSolicitada' AND object_id=OBJECT_ID('UNIPASS.Permission'))
    CREATE NONCLUSTERED INDEX IX_Permission_FechaSolicitada ON UNIPASS.Permission (FechaSolicitada) INCLUDE (StatusPermission, IdTipoSalida, IdUser);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Permission_FechaSalida' AND object_id=OBJECT_ID('UNIPASS.Permission'))
    CREATE NONCLUSTERED INDEX IX_Permission_FechaSalida ON UNIPASS.Permission (FechaSalida) INCLUDE (StatusPermission, IdTipoSalida, IdUser);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CheckPoints_Permission_Estatus' AND object_id=OBJECT_ID('UNIPASS.CheckPoints'))
    CREATE NONCLUSTERED INDEX IX_CheckPoints_Permission_Estatus ON UNIPASS.CheckPoints (IdPermission, Estatus, Accion) INCLUDE (IdPoint);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_LoginUniPass_Dormitorio' AND object_id=OBJECT_ID('UNIPASS.LoginUniPass'))
    CREATE NONCLUSTERED INDEX IX_LoginUniPass_Dormitorio ON UNIPASS.LoginUniPass (Dormitorio) INCLUDE (TipoUser, Nombre, Apellidos);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PasswordReset_Hash' AND object_id=OBJECT_ID('UNIPASS.PasswordReset'))
    CREATE NONCLUSTERED INDEX IX_PasswordReset_Hash ON UNIPASS.PasswordReset (ResetTokenHash);
GO

/* =============================================================================
   5. DESCRIPCIONES (MS_Description) de tablas y columnas
   ============================================================================= */

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Catalogo de tipos de salida (1 PUEBLO, 2 ESPECIAL, 3 A CASA, 4 FIN DE CURSO).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'TypeExit';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'TypeExit', @level2type=N'COLUMN',@level2name=N'IdTypeExit';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Nombre del tipo de salida.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'TypeExit', @level2type=N'COLUMN',@level2name=N'Descripcion';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Dormitorios; Identificador es el id institucional usado por API-ULV.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Bedroom';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK; = LoginUniPass.Dormitorio.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Bedroom', @level2type=N'COLUMN',@level2name=N'IdBedroom';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Id institucional (315..351).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Bedroom', @level2type=N'COLUMN',@level2name=N'Identificador';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Nombre corto del dormitorio.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Bedroom', @level2type=N'COLUMN',@level2name=N'Nombre';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'NIVEL MEDIO|UNIVERSITARIO|AMBOS.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Bedroom', @level2type=N'COLUMN',@level2name=N'NivelDormitorio';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'F|M|N.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Bedroom', @level2type=N'COLUMN',@level2name=N'Sexo';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Suplencias entre empleados (mecanismo aparte de CheckerGrant).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Position';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Position', @level2type=N'COLUMN',@level2name=N'IdCargo';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Matricula del encargado titular.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Position', @level2type=N'COLUMN',@level2name=N'MatriculaEncargado';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Rol/clase del cargo.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Position', @level2type=N'COLUMN',@level2name=N'ClassUser';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Matricula del suplente.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Position', @level2type=N'COLUMN',@level2name=N'Asignado';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'1 activa la cobertura.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Position', @level2type=N'COLUMN',@level2name=N'Activo';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Catalogo de tipos de documento del expediente.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'DocumentCatalog';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'DocumentCatalog', @level2type=N'COLUMN',@level2name=N'IdDocument';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Nombre del tipo de documento.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'DocumentCatalog', @level2type=N'COLUMN',@level2name=N'TipoDocumento';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Activo|Inactivo.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'DocumentCatalog', @level2type=N'COLUMN',@level2name=N'Estado';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Parametros clave/valor operables con UPDATE (sin redeploy).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Configuracion';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK (AUTORIZADOR_SALIDAS, COORDINADOR_IDEMPLEADO, COORDINADOR_NODEPTO).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Configuracion', @level2type=N'COLUMN',@level2name=N'Clave';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Valor actual.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Configuracion', @level2type=N'COLUMN',@level2name=N'Valor';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Que controla la clave.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Configuracion', @level2type=N'COLUMN',@level2name=N'Descripcion';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Usuarios (alumnos y empleados). Fuente de verdad de identidad.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'IdLogin';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Matricula institucional.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'Matricula';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Hash bcrypt.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'Contraseña';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Correo (puede diferir del institucional en empleados).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'Correo';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Nombre(s).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'Nombre';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Apellidos.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'Apellidos';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'ALUMNO|EMPLEADO|PRECEPTOR|VIGILANCIA|ADMINISTRATIVO.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'TipoUser';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'F|M.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'Sexo';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Fecha de nacimiento.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'FechaNacimiento';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Telefono celular.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'Celular';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'1 activo, 0 inactivo.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'StatusActividad';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK Bedroom.IdBedroom.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'Dormitorio';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK Position.IdCargo (suplencia).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'IdCargoDelegado';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Token FCM del dispositivo.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'TokenCFM';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Estado del expediente.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'LoginUniPass', @level2type=N'COLUMN',@level2name=N'Documentacion';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Puntos de control por tipo de salida.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Point';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Point', @level2type=N'COLUMN',@level2name=N'IdPoint';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Dormitorio|Caseta.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Point', @level2type=N'COLUMN',@level2name=N'NombrePunto';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK TypeExit.IdTypeExit.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Point', @level2type=N'COLUMN',@level2name=N'IdExit';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Solicitud de salida del alumno.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'IdPermission';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Cuando se solicito.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'FechaSolicitada';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Pendiente|Aprobada|Rechazada|Cancelado.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'StatusPermission';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Salida programada.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'FechaSalida';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Regreso programado.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'FechaRegreso';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Motivo de la salida.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'Motivo';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK LoginUniPass.IdLogin (alumno).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'IdUser';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK TypeExit.IdTypeExit.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'IdTipoSalida';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Observaciones.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'Observaciones';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'En desuso.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Permission', @level2type=N'COLUMN',@level2name=N'Aprobo';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Cadena de aprobadores por permiso, en orden.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Authorize';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Authorize', @level2type=N'COLUMN',@level2name=N'IdAuthorize';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Matricula institucional del autorizador (NO IdLogin).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Authorize', @level2type=N'COLUMN',@level2name=N'IdEmpleado';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Departamento del autorizador.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Authorize', @level2type=N'COLUMN',@level2name=N'NoDepto';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK Permission.IdPermission.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Authorize', @level2type=N'COLUMN',@level2name=N'IdPermission';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Pendiente|Aprobada|Rechazada.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Authorize', @level2type=N'COLUMN',@level2name=N'StatusAuthorize';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'1 si la persona cubre dos roles.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Authorize', @level2type=N'COLUMN',@level2name=N'DualRole';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Cuando resolvio.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Authorize', @level2type=N'COLUMN',@level2name=N'FechaAprobacion';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Orden del eslabon (1..n).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Authorize', @level2type=N'COLUMN',@level2name=N'Orden';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Los 4 checks fisicos por permiso (salida/retorno x dormitorio/caseta).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckPoints';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckPoints', @level2type=N'COLUMN',@level2name=N'IdCheck';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Cuando se registro el check.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckPoints', @level2type=N'COLUMN',@level2name=N'FechaCheck';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Pendiente|Confirmada|No confirmada.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckPoints', @level2type=N'COLUMN',@level2name=N'Estatus';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'SALIDA|RETORNO.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckPoints', @level2type=N'COLUMN',@level2name=N'Accion';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK Point.IdPoint.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckPoints', @level2type=N'COLUMN',@level2name=N'IdPoint';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK Permission.IdPermission.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckPoints', @level2type=N'COLUMN',@level2name=N'IdPermission';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Observacion del checador.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckPoints', @level2type=N'COLUMN',@level2name=N'Observaciones';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK LoginUniPass.IdLogin (checador).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckPoints', @level2type=N'COLUMN',@level2name=N'ConfirmadoPor';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Capability asignable: CHECKER (checador) o SUPERVISOR (solo lectura).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'IdGrant';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK LoginUniPass (beneficiario).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'IdLogin';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Legado (modelo por punto).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'IdPoint';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'SALIDA|RETORNO|AMBOS.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'Scope';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK LoginUniPass (quien otorgo).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'AsignadoPor';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'1 vigente.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'Activo';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'TEMPORAL|PERMANENTE.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'Vigencia';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Expiracion si TEMPORAL.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'FechaExpira';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Alta.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'FechaCreacion';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Dormitorio|Caseta (alcance).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'Tipo';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Dormitorio del alcance (si Tipo=Dormitorio).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'IdDormitorio';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'CHECKER|SUPERVISOR.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'CheckerGrant', @level2type=N'COLUMN',@level2name=N'Capability';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Documentos del expediente del usuario.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK (id unico por documento).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'IdDoctos';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK DocumentCatalog (TIPO de documento; se repite entre usuarios).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'IdDocumento';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Ruta del archivo.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'Archivo';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Estado de adjunto.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'StatusDoctos';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK LoginUniPass (dueno).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'IdLogin';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Pendiente|Aprobado|Rechazado.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'StatusRevision';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Motivo si rechazado.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'MotivoRechazo';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Comentario del revisor.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'ComentarioRechazo';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Matricula del revisor.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'RechazadoPor';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Cuando se rechazo.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'Doctos', @level2type=N'COLUMN',@level2name=N'FechaRechazo';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Sesiones: refresh tokens hasheados con rotacion y revocacion.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'RefreshToken';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'RefreshToken', @level2type=N'COLUMN',@level2name=N'RefreshTokenId';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'FK LoginUniPass.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'RefreshToken', @level2type=N'COLUMN',@level2name=N'IdLogin';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'SHA-256 del refresh token.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'RefreshToken', @level2type=N'COLUMN',@level2name=N'TokenHash';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Expiracion.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'RefreshToken', @level2type=N'COLUMN',@level2name=N'ExpiresAt';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Alta.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'RefreshToken', @level2type=N'COLUMN',@level2name=N'CreatedAt';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Revocacion (NULL = vigente).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'RefreshToken', @level2type=N'COLUMN',@level2name=N'RevokedAt';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Hash del token que lo reemplazo (rotacion).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'RefreshToken', @level2type=N'COLUMN',@level2name=N'ReplacedByTokenHash';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'User-agent/dispositivo.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'RefreshToken', @level2type=N'COLUMN',@level2name=N'DeviceInfo';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Tokens de recuperacion de contrasena (solo hash, single-use).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'PasswordReset';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'PasswordReset', @level2type=N'COLUMN',@level2name=N'Id';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Usuario (relacion logica, sin FK).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'PasswordReset', @level2type=N'COLUMN',@level2name=N'IdLogin';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'SHA-256 del reset token.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'PasswordReset', @level2type=N'COLUMN',@level2name=N'ResetTokenHash';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Expiracion (~10 min).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'PasswordReset', @level2type=N'COLUMN',@level2name=N'ExpiraEn';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Consumo (NULL = no usado).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'PasswordReset', @level2type=N'COLUMN',@level2name=N'UsadoEn';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Alta.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'PasswordReset', @level2type=N'COLUMN',@level2name=N'FechaCreacion';

EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Dedupe de POST /permission por Idempotency-Key.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'IdempotencyRequest';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'PK (clave enviada por el cliente).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'IdempotencyRequest', @level2type=N'COLUMN',@level2name=N'IdempotencyKey';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Usuario (relacion logica, sin FK).', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'IdempotencyRequest', @level2type=N'COLUMN',@level2name=N'IdLogin';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Permiso creado para esa clave.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'IdempotencyRequest', @level2type=N'COLUMN',@level2name=N'IdPermission';
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Alta.', @level0type=N'SCHEMA',@level0name=N'UNIPASS', @level1type=N'TABLE',@level1name=N'IdempotencyRequest', @level2type=N'COLUMN',@level2name=N'FechaCreacion';
GO

/* =============================================================================
   6. DATOS SEMILLA (catalogos necesarios para que la app funcione)
   ============================================================================= */

/* TypeExit */
SET IDENTITY_INSERT UNIPASS.TypeExit ON;
IF NOT EXISTS (SELECT 1 FROM UNIPASS.TypeExit)
INSERT INTO UNIPASS.TypeExit (IdTypeExit, Descripcion) VALUES
 (1,'PUEBLO'),(2,'ESPECIAL'),(3,'A CASA'),(4,'FIN DE CURSO');
SET IDENTITY_INSERT UNIPASS.TypeExit OFF;
GO

/* Point (Dormitorio/Caseta por tipo de salida) */
SET IDENTITY_INSERT UNIPASS.Point ON;
IF NOT EXISTS (SELECT 1 FROM UNIPASS.Point)
INSERT INTO UNIPASS.Point (IdPoint, NombrePunto, IdExit) VALUES
 (1,'Dormitorio',1),(2,'Caseta',1),(3,'Dormitorio',2),(4,'Caseta',2),(5,'Dormitorio',3),(6,'Caseta',3);
SET IDENTITY_INSERT UNIPASS.Point OFF;
GO

/* Bedroom (dormitorios institucionales; IdBedroom = LoginUniPass.Dormitorio) */
SET IDENTITY_INSERT UNIPASS.Bedroom ON;
IF NOT EXISTS (SELECT 1 FROM UNIPASS.Bedroom)
INSERT INTO UNIPASS.Bedroom (IdBedroom, Identificador, Nombre, NivelDormitorio, Sexo) VALUES
 (1,'315','H.S.N.M','NIVEL MEDIO','F'),
 (2,'316','H.S.N.U','UNIVERSITARIO','F'),
 (3,'317','H.V.N.M','NIVEL MEDIO','M'),
 (4,'318','H.V.N.U','UNIVERSITARIO','M'),
 (5,'351','COORDINACION','AMBOS','N'),
 (6,'0','NA','NA','N');
SET IDENTITY_INSERT UNIPASS.Bedroom OFF;
GO

/* DocumentCatalog (tipos de documento del expediente) */
SET IDENTITY_INSERT UNIPASS.DocumentCatalog ON;
IF NOT EXISTS (SELECT 1 FROM UNIPASS.DocumentCatalog)
INSERT INTO UNIPASS.DocumentCatalog (IdDocument, TipoDocumento, Estado) VALUES
 (1,'Reglamento HVU','Activo'),
 (2,'Reglamento HVNM','Activo'),
 (3,'Reglamento HSU','Activo'),
 (4,'Reglamento HSNM','Activo'),
 (5,'Convenio de salidas','Activo'),
 (6,'Imagen Perfil','Activo'),
 (7,'INE Tutor','Activo'),
 (8,'Justificante','Inactivo');
SET IDENTITY_INSERT UNIPASS.DocumentCatalog OFF;
GO

/* Configuracion (switch de autorizador; arranca en PRECEPTOR, override coordinador vacio = auto por rol) */
IF NOT EXISTS (SELECT 1 FROM UNIPASS.Configuracion WHERE Clave='AUTORIZADOR_SALIDAS')
INSERT INTO UNIPASS.Configuracion (Clave, Valor, Descripcion) VALUES
 ('AUTORIZADOR_SALIDAS','PRECEPTOR','Quien autoriza salidas Especial(2)/Casa(3): PRECEPTOR o COORDINADOR');
IF NOT EXISTS (SELECT 1 FROM UNIPASS.Configuracion WHERE Clave='COORDINADOR_IDEMPLEADO')
INSERT INTO UNIPASS.Configuracion (Clave, Valor, Descripcion) VALUES
 ('COORDINADOR_IDEMPLEADO','','Override IdEmpleado del coordinador; vacio = auto (ADMINISTRATIVO activo)');
IF NOT EXISTS (SELECT 1 FROM UNIPASS.Configuracion WHERE Clave='COORDINADOR_NODEPTO')
INSERT INTO UNIPASS.Configuracion (Clave, Valor, Descripcion) VALUES
 ('COORDINADOR_NODEPTO','','Override NoDepto del coordinador; vacio = auto (Bedroom del coordinador)');
GO

PRINT 'UNIPASS: esquema, tablas, descripciones y semillas aplicados.';
