/* =============================================================================
   UNIPASS — Respaldo (backup) completo de la base de datos
   Genera un .bak con nombre  UNIPASS_YYYYMMDD_HHMMSS.bak
   ⚠️ El archivo se crea en el DISCO DEL SERVIDOR SQL (la cuenta de servicio de
      SQL Server debe poder escribir en @carpeta), NO en la máquina cliente.
   Uso:
     - SSMS: ajusta @carpeta y ejecuta.
     - CLI:  node scripts/run-sql.js database/schema/UNIPASS_backup.sql
   ============================================================================= */

-- @carpeta = NULL -> usa la CARPETA DE RESPALDO POR DEFECTO de la instancia (la cuenta de
-- servicio de SQL Server SIEMPRE puede escribir ahí). Ponle una ruta manual solo si quieres
-- otra carpeta Y le diste permiso de escritura a la cuenta de servicio de SQL Server.
DECLARE @carpeta  NVARCHAR(260) = NULL;   -- ej. manual Windows: N'C:\Backups\'  | Linux: N'/var/opt/mssql/backups/'

IF @carpeta IS NULL
BEGIN
    -- Lee la carpeta de backup por defecto del registro de la instancia (Windows).
    EXEC master.dbo.xp_instance_regread
        N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer',
        N'BackupDirectory', @carpeta OUTPUT;
    IF @carpeta IS NULL
    BEGIN
        RAISERROR('No se pudo resolver la carpeta de respaldo por defecto. Asigna @carpeta manualmente (a una carpeta con permiso de escritura para la cuenta de servicio de SQL Server).', 16, 1);
        RETURN;
    END
END
-- Separador correcto segun el SO del servidor (Linux usa '/', Windows '\').
IF RIGHT(@carpeta, 1) NOT IN (N'\', N'/')
    SET @carpeta = @carpeta + CASE WHEN CHARINDEX(N'/', @carpeta) > 0 THEN N'/' ELSE N'\' END;

-- Sello de tiempo SIN FORMAT() (FORMAT requiere CLR, deshabilitado en esta instancia):
--   112 -> 'yyyymmdd'   |   108 -> 'hh:mm:ss' (se le quitan los ':')
DECLARE @sello    NVARCHAR(20)  = CONVERT(NVARCHAR(8), GETDATE(), 112) + N'_' +
                                  REPLACE(CONVERT(NVARCHAR(8), GETDATE(), 108), ':', N'');
DECLARE @archivo  NVARCHAR(320) = @carpeta + N'UNIPASS_' + @sello + N'.bak';

BACKUP DATABASE UNIPASS
TO DISK = @archivo
WITH
    FORMAT,            -- crea un medio nuevo (no anexa a un .bak existente)
    INIT,              -- sobrescribe si ya existiera ese archivo
    CHECKSUM,          -- valida integridad de las páginas al respaldar
    STATS = 10,        -- progreso cada 10%
    NAME = N'UNIPASS respaldo completo';
    -- , COMPRESSION    -- descomenta si tu edición lo soporta (NO en SQL Server Express)

PRINT 'Respaldo creado en: ' + @archivo;
GO

/* -----------------------------------------------------------------------------
   RESTAURAR (referencia; correr solo cuando lo necesites, con la BD sin uso):
   -----------------------------------------------------------------------------
   ALTER DATABASE UNIPASS SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
   RESTORE DATABASE UNIPASS
     FROM DISK = N'C:\Backups\UNIPASS_YYYYMMDD_HHMMSS.bak'
     WITH REPLACE, RECOVERY, STATS = 10;
   ALTER DATABASE UNIPASS SET MULTI_USER;
   ----------------------------------------------------------------------------- */
