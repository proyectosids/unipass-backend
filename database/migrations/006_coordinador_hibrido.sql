-- 006_coordinador_hibrido.sql
-- Hace OPCIONAL el pin del coordinador (modelo hibrido). Por defecto el coordinador
-- se resuelve por rol (ADMINISTRATIVO activo de Coordinacion), asi que al cambiar de
-- coordinador NO hay que tocar nada: se hereda del alta/baja del empleado.
--
-- Las claves siguen existiendo como OVERRIDE opcional:
--   Vacio ('')  -> resolver automaticamente por rol (default recomendado).
--   Con valor   -> fija ese coordinador (manda sobre la resolucion por rol).
--
-- Fijar un coordinador especifico:
--   UPDATE dbo.Configuracion SET Valor='<matricula>' WHERE Clave='COORDINADOR_IDEMPLEADO';
--   UPDATE dbo.Configuracion SET Valor='<nodepto>'   WHERE Clave='COORDINADOR_NODEPTO';
-- Volver a automatico: poner Valor='' en ambas.
-- Idempotente: se puede correr varias veces.

UPDATE dbo.Configuracion
SET Valor = '',
    Descripcion = 'Override IdEmpleado del coordinador; vacio = auto (ADMINISTRATIVO activo)'
WHERE Clave = 'COORDINADOR_IDEMPLEADO';

UPDATE dbo.Configuracion
SET Valor = '',
    Descripcion = 'Override NoDepto del coordinador; vacio = auto (Bedroom del coordinador)'
WHERE Clave = 'COORDINADOR_NODEPTO';
GO

SELECT Clave, Valor, Descripcion FROM dbo.Configuracion ORDER BY Clave;
