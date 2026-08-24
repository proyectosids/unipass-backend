/* =============================================================================
   UNIPASS — Migración de esquema: dbo -> UNIPASS (PRESERVA DATOS)
   Para la BD EXISTENTE (que hoy tiene las tablas en dbo con datos reales).
   Mueve cada tabla al esquema UNIPASS con ALTER SCHEMA ... TRANSFER (no copia,
   no pierde datos, conserva PK/FK/índices/constraints).
   Idempotente: solo transfiere las tablas que aún están en dbo.

   Ejecutar sobre la base actual:
     node scripts/run-sql.js database/schema/UNIPASS_migrate_dbo_to_schema.sql
   (o en SSMS con la BD UNIPASS seleccionada)

   ⚠️ Hacer respaldo antes. Detener el backend durante la transferencia.
   Tras correrlo, desplegar el código nuevo (que ya referencia UNIPASS.<Tabla>).
   ============================================================================= */

USE UNIPASS;
GO

/* 1) Crear el esquema si no existe */
IF SCHEMA_ID('UNIPASS') IS NULL
    EXEC('CREATE SCHEMA UNIPASS');
GO

/* 2) Transferir cada tabla de dbo -> UNIPASS (solo si sigue en dbo) */
DECLARE @tablas TABLE (nombre SYSNAME);
INSERT INTO @tablas (nombre) VALUES
 ('TypeExit'),('Bedroom'),('Position'),('DocumentCatalog'),('Configuracion'),
 ('LoginUniPass'),('Point'),('Permission'),('Authorize'),('CheckPoints'),
 ('CheckerGrant'),('Doctos'),('RefreshToken'),('PasswordReset'),('IdempotencyRequest');

DECLARE @n SYSNAME, @sql NVARCHAR(300);
DECLARE cur CURSOR FOR SELECT nombre FROM @tablas;
OPEN cur;
FETCH NEXT FROM cur INTO @n;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
               WHERE s.name='dbo' AND t.name=@n)
    BEGIN
        SET @sql = 'ALTER SCHEMA UNIPASS TRANSFER dbo.' + QUOTENAME(@n) + ';';
        PRINT @sql;
        EXEC sp_executesql @sql;
    END
    ELSE
        PRINT 'omitida (ya no esta en dbo): ' + @n;
    FETCH NEXT FROM cur INTO @n;
END
CLOSE cur; DEALLOCATE cur;
GO

/* 3) (Opcional recomendado) fijar el esquema por defecto del login de la app a UNIPASS,
      como defensa en profundidad. Sustituir <APP_LOGIN> por el usuario de DB_USER.
   ALTER USER [<APP_LOGIN>] WITH DEFAULT_SCHEMA = UNIPASS;
*/

/* 4) Verificación: todas deben quedar en el esquema UNIPASS */
SELECT s.name AS esquema, t.name AS tabla
FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE t.name IN ('TypeExit','Bedroom','Position','DocumentCatalog','Configuracion',
                 'LoginUniPass','Point','Permission','Authorize','CheckPoints',
                 'CheckerGrant','Doctos','RefreshToken','PasswordReset','IdempotencyRequest')
ORDER BY s.name, t.name;
GO
