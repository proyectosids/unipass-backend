# Contrato Flutter — Task 7.3 D2-A (lecturas documentales)

> **Backend:** `D2-A Backend read containment = DONE`. Las lecturas documentales anónimas se cerraron.
> Los endpoints legacy **siguen vivos como bridges** (compatibilidad), pero ahora **exigen `Authorization: Bearer`**
> y aplican ownership/scope server-side. Flutter debe migrar a los contratos nuevos (fase **D2-B**);
> luego el backend retirará los bridges (**D2-C**).

## Migración recomendada (nuevos contratos, todos con Bearer)

| Uso en Flutter | Antes (anónimo) | Ahora (migrar a) |
|---|---|---|
| Mis documentos (alumno) | `GET /doctos/:IdLogin` | **`GET /me/documents`** (sin `:Id`; el actor es el token) |
| Lista de alumnos a revisar (preceptor) | `GET /getExpediente/:IdDormi` | **`GET /documents/review/students`** (sin `:IdDormi`; dorm del token) |
| Documentos de un alumno (preceptor) | `GET /getArchivos/:Dormitorio/...` | **`GET /documents/review/students/:idLogin/documents`** (por `IdLogin`, no por nombre) |
| Foto de perfil | `GET /doctosProfile/:id?IdDocumento=6` | **`GET /users/:idLogin/profile-photo`** (sin enviar `IdDocumento`) |

## Reglas que Flutter YA no debe asumir

- **No enviar el dormitorio** para revisión: se resuelve del token (PRECEPTOR). No existe la vista global
  `dorm=5`; pedir 5 → `403 FORBIDDEN_DOCUMENT_SCOPE`.
- **No identificar al alumno por nombre** para leer sus documentos: usar `IdLogin` (de
  `/documents/review/students`).
- **Revisión = solo PRECEPTOR.** EMPLEADO/VIGILANCIA/ADMINISTRATIVO → `403 FORBIDDEN_DOCUMENT_REVIEWER`.
- **Foto de perfil**: no mandar `IdDocumento`; el backend fuerza `6`. Un checker ve la foto de un alumno
  **solo** si tiene un `CheckerGrant` vigente que lo cubra (Dormitorio del dorm, o Caseta global).

## Bridges (transición, DEPRECATED — se retiran en D2-C)

Siguen respondiendo pero con auth: `GET /doctos/:Id` (SELF-only), `GET /doctosProfile/:id?IdDocumento=6`
(solo foto), `GET /getExpediente/:IdDormi` y `GET /getArchivos/...` (dorm forzado al del token).
`GET /doctos` (sin `:Id`) ya no existe → `404`.

## Advertencia de seguridad pendiente (`DIRECT_FILE_ACCESS_BYPASS`)

El campo `Archivo` (`/uploads/<archivo>`) hoy se sirve **estático y sin auth** (`app.js` `express.static`).
Proteger estos `GET` **no** protege el binario. La forma de servir imágenes/documentos cambiará cuando se
resuelva el bypass (endpoint autenticado o URL firmada); Flutter deberá adaptarse en esa fase.
