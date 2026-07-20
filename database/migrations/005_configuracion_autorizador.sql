-- 005_configuracion_autorizador.sql
-- Switch configurable (sin redeploy): quien autoriza las salidas ESPECIAL(2) y
-- A CASA(3) -> PRECEPTOR (comportamiento actual) o COORDINADOR (ADMINISTRATIVO,
-- coordinador de dormitorios). Idempotente: se puede correr varias veces.
--
-- Cambiar de modo:
--   UPDATE dbo.Configuracion SET Valor = 'COORDINADOR' WHERE Clave = 'AUTORIZADOR_SALIDAS';
--   UPDATE dbo.Configuracion SET Valor = 'PRECEPTOR'   WHERE Clave = 'AUTORIZADOR_SALIDAS';
-- Cambiar de coordinador: UPDATE a COORDINADOR_IDEMPLEADO / COORDINADOR_NODEPTO.

IF OBJECT_ID('dbo.Configuracion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Configuracion (
        Clave       NVARCHAR(80)  NOT NULL PRIMARY KEY,
        Valor       NVARCHAR(200) NOT NULL,
        Descripcion NVARCHAR(300) NULL
    );
END;
GO

-- Modo del autorizador de salidas 2/3. Arranca en PRECEPTOR (comportamiento actual).
MERGE dbo.Configuracion AS t
USING (SELECT 'AUTORIZADOR_SALIDAS' AS Clave) AS s ON t.Clave = s.Clave
WHEN NOT MATCHED THEN
  INSERT (Clave, Valor, Descripcion)
  VALUES ('AUTORIZADOR_SALIDAS', 'PRECEPTOR',
          'Quien autoriza salidas Especial(2)/Casa(3): PRECEPTOR o COORDINADOR');

-- IdEmpleado (= Matricula numerica en Authorize) y NoDepto del coordinador de
-- dormitorios. Valores reales verificados en BD (2026-07-19):
--   264 = TERESA LOPEZ ROSAS (ADMINISTRATIVO, Dormitorio 5)
--   351 = COORDINACION (Bedroom.Identificador, IdBedroom 5)
MERGE dbo.Configuracion AS t
USING (SELECT 'COORDINADOR_IDEMPLEADO' AS Clave) AS s ON t.Clave = s.Clave
WHEN NOT MATCHED THEN
  INSERT (Clave, Valor, Descripcion)
  VALUES ('COORDINADOR_IDEMPLEADO', '264', 'IdEmpleado (matricula) del coordinador de dormitorios');

MERGE dbo.Configuracion AS t
USING (SELECT 'COORDINADOR_NODEPTO' AS Clave) AS s ON t.Clave = s.Clave
WHEN NOT MATCHED THEN
  INSERT (Clave, Valor, Descripcion)
  VALUES ('COORDINADOR_NODEPTO', '351', 'NoDepto/departamento del coordinador (COORDINACION)');
GO

SELECT Clave, Valor, Descripcion FROM dbo.Configuracion ORDER BY Clave;
