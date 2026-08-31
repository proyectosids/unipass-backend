import { defineConfig } from 'vitest/config';

// Los tests de integración comparten UNA sola base de datos y algunos mantienen transacciones con
// locks (p. ej. la resolución de cadena de autorización 7.4B usa UPDLOCK/HOLDLOCK). Ejecutar los
// ARCHIVOS en serie evita contención de conexiones/locks entre archivos y hace la suite determinista.
// (Los tests dentro de un mismo archivo ya se ejecutan en serie.)
export default defineConfig({
    test: {
        fileParallelism: false
    }
});
