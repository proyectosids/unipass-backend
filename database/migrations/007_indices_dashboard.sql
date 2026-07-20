-- 007_indices_dashboard.sql
-- Indices de apoyo para GET /admin/dashboard (y las bandejas en general).
-- Idempotente: cada CREATE esta protegido con IF NOT EXISTS sobre sys.indexes.

-- Conteos por estatus/tipo (pendientes, totales del periodo)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Permission_Status_Tipo' AND object_id = OBJECT_ID('dbo.Permission'))
    CREATE NONCLUSTERED INDEX IX_Permission_Status_Tipo
        ON dbo.Permission (StatusPermission, IdTipoSalida)
        INCLUDE (IdUser, FechaSalida, FechaSolicitada);

-- Rango de periodo por FechaSolicitada (totales y actividad reciente)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Permission_FechaSolicitada' AND object_id = OBJECT_ID('dbo.Permission'))
    CREATE NONCLUSTERED INDEX IX_Permission_FechaSolicitada
        ON dbo.Permission (FechaSolicitada)
        INCLUDE (StatusPermission, IdTipoSalida, IdUser);

-- Ventana de bandeja por FechaSalida (pendientes -30/+15 dias)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Permission_FechaSalida' AND object_id = OBJECT_ID('dbo.Permission'))
    CREATE NONCLUSTERED INDEX IX_Permission_FechaSalida
        ON dbo.Permission (FechaSalida)
        INCLUDE (StatusPermission, IdTipoSalida, IdUser);

-- EXISTS de checks confirmados por permiso (alumnos fuera)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CheckPoints_Permission_Estatus' AND object_id = OBJECT_ID('dbo.CheckPoints'))
    CREATE NONCLUSTERED INDEX IX_CheckPoints_Permission_Estatus
        ON dbo.CheckPoints (IdPermission, Estatus, Accion)
        INCLUDE (IdPoint);

-- Agrupacion por dormitorio del alumno
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LoginUniPass_Dormitorio' AND object_id = OBJECT_ID('dbo.LoginUniPass'))
    CREATE NONCLUSTERED INDEX IX_LoginUniPass_Dormitorio
        ON dbo.LoginUniPass (Dormitorio)
        INCLUDE (TipoUser, Nombre, Apellidos);
GO

SELECT i.name AS Indice, OBJECT_NAME(i.object_id) AS Tabla
FROM sys.indexes i
WHERE i.object_id IN (OBJECT_ID('dbo.Permission'), OBJECT_ID('dbo.CheckPoints'), OBJECT_ID('dbo.LoginUniPass'))
  AND i.name LIKE 'IX_%'
ORDER BY Tabla, Indice;
