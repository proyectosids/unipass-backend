# UniPass API — Documentación completa

API REST del sistema **UniPass** (ULV): gestión de usuarios, permisos de salida de alumnos,
cadena de autorización, checador de salidas/retornos (4 checks), expediente documental,
cargos delegados y notificaciones en tiempo real.

- **Stack:** Node.js (ESM) + Express 4 · SQL Server (`mssql`) · Socket.IO 4 · JWT + refresh tokens · Multer (archivos) · bcrypt.
- **Entrada:** `src/index.js` → `src/app.js` (todas las rutas se montan **en la raíz**, sin prefijo `/api`).
- **Archivos estáticos:** `public/` (los documentos subidos quedan accesibles en `/uploads/<archivo>`).
- **Logs HTTP:** morgan (`dev`). **CORS:** abierto (`cors()` sin restricción). **Body:** JSON/urlencoded hasta 50 MB.

---

## 1. Arranque y variables de entorno

```bash
npm run dev     # nodemon src/index.js (desarrollo)
npm start       # node src/index.js
npm test        # vitest run
```

| Variable | Requerida | Descripción |
|---|---|---|
| `PORT` | ✅ | Puerto HTTP del servidor. |
| `DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_DATABASE` | ✅ | Conexión a SQL Server (BD real: `UNIPASS`). |
| `DB_PORT` | — | Default `1433`. |
| `DB_POOL_MAX` / `DB_POOL_MIN` / `DB_POOL_IDLE_MS` | — | Pool (defaults 10 / 0 / 30000). |
| `DB_ENCRYPT`, `DB_TRUST_CERT` | — | `'true'` para activar encrypt / trustServerCertificate. |
| `JWT_ACCESS_SECRET` (o legado `JWT_SECRET`) | ✅ | Firma de access tokens. |
| `JWT_ACCESS_EXPIRATION` | — | Default `15m`. |
| `REFRESH_TOKEN_EXPIRATION_DAYS` | — | Default `30`. |
| `PUSH_API_URL` | — | Microservicio de push FCM (`POST {PUSH_API_URL}/send`). Si falta, se omite el push. |
| `PUSH_TIMEOUT_MS` | — | Default `5000`. |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | — | Configurados en `src/config.js` (Cloudinary; hoy la subida real usa disco local vía Multer). |

Cada consulta abre y cierra su propio pool mediante `withConnection` (`src/database/connection.js`).

---

## 2. Modelo de datos (resumen operativo)

> La tabla real de usuarios es **`LoginUniPass`** (el archivo `db.sql` del repo está desactualizado).

- **`LoginUniPass`** — usuarios. Campos clave: `IdLogin`, `Matricula`, `Contraseña` (bcrypt), `Correo`,
  `Nombre`, `Apellidos`, `TipoUser`, `Sexo`, `FechaNacimiento`, `Celular`, `StatusActividad`,
  `Dormitorio`, `Documentacion`, `TokenCFM`, `IdCargoDelegado`.
- **`TipoUser`:** `ALUMNO`, `EMPLEADO`, `VIGILANCIA`, `PRECEPTOR`, `ADMINISTRATIVO`.
  `DEPARTAMENTO` está **retirado** (ver §6).
- **`Permission`** — permisos de salida (`StatusPermission`: `Pendiente`/`Aprobada`/`Rechazada`/`Cancelada`…,
  `FechaSalida`, `FechaRegreso`, `Motivo`, `IdUser`, `IdTipoSalida`).
- **`Authorize`** — cadena de autorización por permiso (`IdEmpleado`, `NoDepto`, `StatusAuthorize`,
  `FechaAprobacion`, `DualRole`).
- **`CheckPoints`** — los 4 checks por permiso (`Accion`: `SALIDA`/`RETORNO`; `Estatus`:
  `Pendiente`/`Confirmada`…; `FechaCheck`, `Observaciones`, `ConfirmadoPor`, `IdPoint`, `IdPermission`).
- **`Point`** — puntos de control; `NombrePunto`: `'Dormitorio'` o `'Caseta'`.
- **`CheckerGrant`** — capability de checador (ver §6): `IdGrant`, `IdLogin`, `Tipo`
  (`'Dormitorio'|'Caseta'`), `IdDormitorio`, `Scope` (`SALIDA|RETORNO|AMBOS`), `Vigencia`
  (`TEMPORAL|PERMANENTE`), `FechaExpira`, `Activo`, `AsignadoPor`, `FechaCreacion`.
  Unicidad `(IdLogin, Tipo, IdDormitorio)`.
- **`RefreshToken`** — sesiones (hash SHA-256 del refresh, `ExpiresAt`, `RevokedAt`, rotación con detección de reuso).
- **`Bedroom`**, **`TypeExit`**, **`Position`** (cargos delegados/suplencias), **`Doctos`** (expediente documental).
- **`Configuracion`** — clave/valor operable con UPDATE (sin redeploy). Claves: `AUTORIZADOR_SALIDAS`
  (`PRECEPTOR`|`COORDINADOR`), y el override **opcional** del coordinador `COORDINADOR_IDEMPLEADO`
  / `COORDINADOR_NODEPTO` (migración `005`; vaciados en `006` → por defecto el coordinador se
  resuelve por rol, ver §6).

### Orden estricto de los 4 checks (`Paso`)

El paso se deriva de `(Accion, NombrePunto)` — es determinístico, no depende de fechas:

| Paso | Accion | NombrePunto |
|---|---|---|
| 1 | SALIDA | Dormitorio |
| 2 | SALIDA | Caseta |
| 3 | RETORNO | Caseta |
| 4 | RETORNO | Dormitorio |

Confirmar un paso exige que el anterior esté `Confirmada` (si no → `409 CHECK_OUT_OF_ORDER`).

---

## 3. Autenticación y sesión

### Esquema

- **Access token (JWT)**, expira en 15 min. Se envía en `Authorization: Bearer <accessToken>`.
  Payload: `{ id, matricula, nombre, apellidos, tipo, dormitorio }` (disponible como `req.user`).
- **Refresh token** opaco (32 bytes hex), vive 30 días, se guarda **hasheado** en BD y **rota** en
  cada uso. Si se reutiliza un refresh ya rotado, se revocan **todas** las sesiones del usuario.
- **Capabilities**: además del rol, `/login` y `/verifyToken` devuelven las capabilities aditivas
  vigentes (hoy solo `CHECKER`), para que el cliente muestre pantallas por permiso y no por `TipoUser`:
  ```json
  { "type": "CHECKER", "pointType": "Dormitorio", "idDormitorio": 4, "scope": "AMBOS" }
  ```
  (para `pointType: "Caseta"` no se incluye `idDormitorio`).

### Middleware

- `verifyToken` (`src/Middleware/verifityToken.js`) — 401 `TOKEN_EXPIRED` / `TOKEN_INVALID` / sin token.
- `requireRole(...roles)` (`src/Middleware/authorizeRoles.js`) — compara `req.user.tipo`;
  401 `NOT_AUTHENTICATED`, 403 `FORBIDDEN_ROLE`.

> ⚠️ La **mayoría** de los endpoints históricos **no exigen token** (se listan como “Auth: —”).
> Solo el flujo de sesión, `PUT /checks/:id` y todo `/checkerGrant*` están protegidos.

### Endpoints de sesión

#### `POST /login` — Auth: —
Body: `{ "Matricula": "<matrícula O correo>", "Contraseña": "..." }`
(el campo `Matricula` acepta también el correo; se busca por `Matricula OR Correo`).

- **200**: `{ success, accessToken, refreshToken, token, user, capabilities }`
  - `token` = alias legado de `accessToken`.
  - ⚠️ `user` es el registro completo de `LoginUniPass` (incluye hash de contraseña).
- **400** falta matrícula/correo · **401** `Credenciales inválidas`.

#### `POST /refresh-token` — Auth: —
Body: `{ "refreshToken": "..." }` → **200** `{ accessToken, refreshToken }` (par nuevo; el viejo queda revocado).
Errores 401: `INVALID_REFRESH_TOKEN`, `REFRESH_REUSE_DETECTED` (revoca todo), `REFRESH_EXPIRED`, `USER_NOT_FOUND`. 400: `MISSING_REFRESH_TOKEN`.

#### `POST /logout` — Auth: ✅ Bearer
Body: `{ "refreshToken": "..." }` → **204** (idempotente). 400 `MISSING_REFRESH_TOKEN`.

#### `GET /verifyToken` — Auth: ✅ Bearer
**200** `{ success: true, user: <payload del token>, capabilities }`. Úsalo al abrir la app para validar sesión y refrescar capabilities.

---

## 4. Convenciones de respuesta y errores

- Éxito: JSON directo (objeto o arreglo). Varios listados devuelven `200` con **`null`** cuando no hay
  resultados (checks, `PermissionsPreceptor`); otros devuelven **404** con `{ message }` — se indica en cada endpoint.
- Error de negocio: `{ "message": "...", "code": "..." }` cuando hay código; endpoints legados devuelven
  solo `{ message }` o `{ error }`.
- Códigos usados: `TOKEN_EXPIRED`, `TOKEN_INVALID`, `NOT_AUTHENTICATED`, `FORBIDDEN_ROLE`,
  `MISSING_REFRESH_TOKEN`, `INVALID_REFRESH_TOKEN`, `REFRESH_REUSE_DETECTED`, `REFRESH_EXPIRED`,
  `USER_NOT_FOUND`, `DEPARTAMENTO_RETIRED`, `MISSING_FIELDS`, `INVALID_SCOPE`, `INVALID_VIGENCIA`,
  `MISSING_FECHA_EXPIRA`, `INVALID_ACTIVO`, `GRANT_NOT_FOUND`, `GRANT_UPDATED`, `GRANT_REVOKED`,
  `CHECK_NOT_FOUND`, `NOT_AUTHORIZED_CHECKER`, `CHECK_OUT_OF_ORDER`, `SERVER_ERROR`.

---

## 5. Usuarios (`src/routes/user.routes.js`)

| Método y ruta | Auth | Descripción |
|---|---|---|
| `GET /user/:Id` | — | Usuario por `IdLogin`. ⚠️ Devuelve el registro completo (incluye hash). 404 si no existe. |
| `GET /userMatricula/:Matricula` | — | Usuario por matrícula. ⚠️ Registro completo. 404 si no existe. |
| `PUT /password/:Correo` | — | Body `{ NewPassword }`. Hashea con bcrypt y actualiza por correo (excluye cuentas DEPARTAMENTO). 404 si no actualizó. |
| `GET /buscarUser/:Nombre` | — | Búsqueda **exacta** por `Nombre` o `Apellidos`. Añade `ExisteEnPosition`. 404 → body `null`. |
| `GET /userChecks/:EmailAsignador` | — | **Legado**: checkers `DEPARTAMENTO` por correo del asignador. Vivo a propósito durante la transición (ver §6). |
| `PUT /cambiarCargo/:Matricula` | — | Body `{ IdCargoDelegado }`. Asigna cargo delegado. |
| `PUT /terminarCargo/:Matricula` | — | Limpia `IdCargoDelegado` y borra el registro de `Position` asociado. |
| `GET /VerToken/:Matricula` | — | Tokens FCM: si la matrícula tiene delegado activo en `Position`, devuelve el/los del delegado; si no, el propio. `[{ TokenCFM }]`. |
| `PUT /TokenDispositivo/:Matricula` | — | Body `{ TokenCFM }`. Registra token FCM del dispositivo. |
| `PUT /Documentacion/:Matricula` | — | Body `{ StatusDoc }` (int). Marca expediente completo/incompleto. |

### Registro — `POST /register` (`resgister.routes.js`)

Body: `{ Matricula, Contraseña, Correo, Nombre, Apellidos, TipoUser, Sexo, FechaNacimiento, Celular, Dormitorio }`.

- Rechaza `TipoUser: 'DEPARTAMENTO'` → **400** `DEPARTAMENTO_RETIRED` (usar `POST /checkerGrant`).
- **400** `Usuario ya registrado` si la matrícula existe.
- **200**: eco del usuario creado con `IdLogin` y `StatusActividad: 1`.

---

## 6. Checador: CheckerGrant y checks

### Modelo

Ser **checador ya no es una cuenta** (`DEPARTAMENTO`, retirado) sino una **capability
(`CheckerGrant`) sobre cualquier cuenta real**. El alcance es por **tipo de punto**:

- **PRECEPTOR** otorga checadores de **Dormitorio** → solo ven/confirman checks de alumnos de
  **su** dormitorio (`IdDormitorio` se toma del token del preceptor, nunca del cliente).
- **VIGILANCIA** otorga checadores de **Caseta** → ven/confirman todos los checks de caseta.

Un grant está **vigente** si `Activo = 1` y (`Vigencia = 'PERMANENTE'` o `FechaExpira` nula o futura).

### Gestión de grants (`checkerGrant.routes.js`) — Auth: ✅ Bearer + rol `PRECEPTOR`/`VIGILANCIA` (salvo `getCapabilities`)

| Método y ruta | Descripción |
|---|---|
| `POST /checkerGrant` | Body `{ IdLogin, Scope: 'SALIDA'\|'RETORNO'\|'AMBOS', Vigencia: 'TEMPORAL'\|'PERMANENTE', FechaExpira? }` (`FechaExpira` obligatoria si TEMPORAL). `Tipo`/`IdDormitorio`/`AsignadoPor` se derivan del token. Upsert: **201** creado / **200** reactivado-actualizado; devuelve el grant. Errores 400: `MISSING_FIELDS`, `INVALID_SCOPE`, `INVALID_VIGENCIA`, `MISSING_FECHA_EXPIRA`. |
| `GET /checkerGrants` | Grants **activos** scopeados por rol del consultante (PRECEPTOR → su dormitorio; VIGILANCIA → caseta), con `Matricula/Nombre/Apellidos/TipoUser` del beneficiario. |
| `GET /checkerGrantsByUser/:idLogin` | Todos los grants (activos o no) de un usuario. |
| `PUT /checkerGrant/:idGrant` | Body `{ Activo: 0\|1 }`. 400 `INVALID_ACTIVO`, 404 `GRANT_NOT_FOUND`. |
| `DELETE /checkerGrant/:idGrant` | Revoca definitivamente (DELETE físico). 404 `GRANT_NOT_FOUND`. |
| `GET /buscarPersona/:Nombre` | Personas **asignables** como checador. LIKE parcial sobre nombre/apellidos/nombre completo, **insensible a mayúsculas y acentos** (`COLLATE Latin1_General_CI_AI`), solo `StatusActividad = 1`, excluye DEPARTAMENTO. Devuelve **solo campos seguros**: `IdLogin, Matricula, Nombre, Apellidos, TipoUser`. Lista vacía si no hay match. |
| `GET /getCapabilities` | Auth: ✅ Bearer (cualquier rol). `{ capabilities: [...] }` del usuario autenticado. |

### Checks (`checks.routes.js`)

Los 4 listados devuelven únicamente **campos seguros** (sin `Contraseña`/`Correo`/`TokenCFM`):
`IdCheck, IdPermission, Accion, Estatus, NombrePunto, FechaSalida, FechaRegreso, Descripcion (tipo de salida), IdUser, Matricula, Nombre, Apellidos, Paso`.
Todos responden `200` con `null` cuando no hay pendientes.

| Método y ruta | Auth | Descripción |
|---|---|---|
| `POST /checks` | — | Crea un checkpoint. Body `{ Accion, IdPoint, IdPermission }` → `{ Id, StatusCheck: 'Pendiente', ... }`. Lo llama el cliente al aprobar un permiso (4 por salida). |
| `GET /checksDormitorio/:Id` | — | Paso 1 pendientes. `:Id` = **IdDormitorio**. Permisos `Aprobada`, `FechaSalida` ≤ hoy. |
| `GET /checksVigilancia` | — | Paso 2 pendientes (caseta-salida) cuyo paso 1 ya está `Confirmada`. |
| `GET /checksVigilanciaRegreso` | — | Paso 3 pendientes (caseta-retorno) con salida de caseta confirmada. |
| `GET /checksDormitorioFin/:Id` | — | Paso 4 pendientes del dormitorio `:Id`, con pasos 2 y 3 confirmados. |
| `PUT /checks/:id` | ✅ Bearer | **Confirmación de un check** (ver flujo abajo). |

#### `PUT /checks/:id` — flujo de confirmación

Body: `{ FechaCheck, Estatus, Observaciones }` (`Estatus: 'Confirmada'` para confirmar).

1. **404** `CHECK_NOT_FOUND` si el check no existe.
2. **Autorización por grant**: el usuario del token necesita `CheckerGrant` **vigente** del tipo del
   check — `Caseta` (cualquier dorm) o `Dormitorio` **del alumno** del check — con `Scope` que cubra
   la `Accion`. Si no → **403** `NOT_AUTHORIZED_CHECKER`.
3. **Orden**: al confirmar el paso N (>1), el paso N−1 de esa salida debe estar `Confirmada`,
   si no → **409** `CHECK_OUT_OF_ORDER`.
4. Actualiza el check; si confirma, registra `ConfirmadoPor = IdLogin` del checador.
5. **200** `{ message: 'CheckPoint actualizado correctamente' }` + evento Socket.IO `check_updated` al alumno.

### Retiro de DEPARTAMENTO (estado)

- Código: `/buscarCheckers`, `/DesactivarChecker`, `/EliminarChecker` **eliminados** (404); `/register` rechaza DEPARTAMENTO.
- Datos: cuentas 2035/2063 desactivadas (migración `003` fase 2a); borrado definitivo (2b) pendiente de decisión.
- `GET /userChecks/:EmailAsignador` sigue vivo a propósito para la transición del cliente.

---

## 7. Permisos de salida (`permission.routes.js`) — Auth: —

| Método y ruta | Descripción |
|---|---|
| `GET /permission/:Id?page=1&limit=10` | Permisos del alumno (`:Id` = IdUser), **paginado**: `{ data, pagination: { totalItems, totalPages, currentPage, limit } }`. |
| `POST /permission` | Crea permiso. Body `{ IdUser, FechaSolicitada, FechaSalida, FechaRegreso, StatusPermission, Motivo, IdTipoSalida, MedioSalida? }`. ⚠️ Resta **6 h** a las tres fechas (ajuste zona horaria hardcodeado) y guarda en UTC. 400 si `IdUser` no existe. Emite `new_permission_request`. |
| `PUT /permission/:Id` | **Cancela** el permiso. Emite `permission_cancelled` a los empleados de su cadena. |
| `DELETE /permission/:Id` | Elimina el permiso. |
| `PUT /permissionValorado/:Id` | Resolución final. Body `{ StatusPermission, Observaciones }`. Emite `permission_finalized` al alumno. |
| `GET /PermissionsPreceptor/:Id` | Permisos pendientes de autorizar por el preceptor (`:Id` = IdEmpleado). Sin datos → `200 null`. |
| `GET /permissionsEmployee/:Id` | Permisos pendientes de autorizar por un empleado/jefe. Sin datos → `200 []`. |
| `GET /permissionTop/Student/:Id` | Últimos 10 permisos del alumno. |
| `GET /permissionTop/Employee/:Id` | Últimos 10 por autorizar del empleado. |
| `GET /permissionTop/Preceptor/:Id` | Últimos 10 por autorizar del preceptor. |
| `GET /dashboardPermission/:IdPreceptor` | Conteos de permisos para dashboard del preceptor. |
| `GET /dashboardDocumentos/:IdPreceptor` | Conteos de documentos para dashboard. |
| `GET /permissions/filter/:IdPreceptor?fechaInicio&fechaFin&status&nombre&matricula` | Filtro de permisos. `:IdPreceptor` es la **matrícula numérica** del consultante; según su `TipoUser` filtra como `ADMINISTRATIVO` (global) o `PRECEPTOR` (su dormitorio). Otros roles → 403. Sin resultados → 404. |

## 8. Cadena de autorización (`authorize.routes.js`) — Auth: —

Un permiso genera registros en `Authorize` (jefe de trabajo → preceptor…). Si a la misma persona
le tocan ambos roles, el segundo `POST /authorize` **no duplica**: marca `DualRole = 1`.

| Método y ruta | Descripción |
|---|---|
| `POST /authorize` | Body `{ IdEmpleado, NoDepto, IdPermission, StatusAuthorize }`. Idempotente por `(IdPermission, IdEmpleado)` (aplica DualRole). Devuelve eco + `DualRole`. Emite `new_authorization_assigned` al empleado (solo si no fue DualRole). |
| `PUT /autorizarPermission/:Id` | `:Id` = IdPermission. Body `{ IdEmpleado, StatusAuthorize }` (`Aprobada`/`Rechazada` sella `FechaAprobacion`). Devuelve el registro actualizado. Emite `permission_status_changed` al alumno y, si se aprobó y hay siguiente eslabón pendiente, `new_authorization_assigned` a ese empleado. |
| `GET /validarAuthorize/:Id?IdPermiso=` | ¿El empleado `:Id` tiene autorización sobre ese permiso? 404 si no. |
| `GET /progresAuthorize/:Id` | Avance de la cadena del permiso `:Id`. Cada fila incluye `DualRole` (bool) y `Roles: ['Jefe de trabajo','Preceptor']` cuando aplica. |
| `GET /asignarPrece/:Nivel?Sexo=` | Dormitorio/preceptor que corresponde por nivel académico y sexo (consulta `Bedroom`). |
| `GET /autorizadorSalida?tipo=2\|3&nivelAcademico=&sexo=` | Resuelve quién autoriza salidas ESPECIAL(2)/A CASA(3) según el switch `AUTORIZADOR_SALIDAS` en `Configuracion`: `{ IdEmpleado, NoDepto, modo }`. Modo `COORDINADOR` = **híbrido**: usa el override de config si está, si no resuelve al ADMINISTRATIVO activo de Coordinación (auto-hereda el cambio de coordinador); modo `PRECEPTOR` = misma resolución que hace hoy la app (Bedroom → preceptor del dormitorio). Sin fallback silencioso: 400 coordinador no resoluble / 404 preceptor no resuelto. |

## 9. Dormitorios y puntos — Auth: —

- `GET /dormitorio/:Sexo/:NivelAcademico` (`bedroom.routes.js`) — registro de `Bedroom` para ese sexo/nivel (asignación de dormitorio al registrarse).
- `GET /getPoints/:Id` (`point.routes.js`) — puntos de control de un tipo de salida (`:Id` = IdExit); base para crear los 4 checks.

## 10. Documentos / expediente (`doctos.routes.js`) — Auth: —

Subida con Multer a `public/uploads/` (nombre = timestamp + extensión). Tipos permitidos:
**jpg, jpeg, png, pdf** (otros se descartan silenciosamente → “Archivo no cargado”). Límite 50 MB.

| Método y ruta | Descripción |
|---|---|
| `POST /doctosMul` | `multipart/form-data`: campo archivo **`Archivo`** + `IdDocumento`, `IdLogin`. Crea documento con `StatusDoctos: 'Adjunto'`. Si la BD falla, borra el archivo subido (rollback). |
| `PUT /doctosMul/updateProfile` | Igual que el anterior pero **reemplaza** el archivo existente (borra el viejo del disco). |
| `DELETE /doctosMul/:Id` | `:Id` = IdLogin. Body `{ IdDocumento }`. Borra registro y archivo físico. |
| `GET /doctosProfile/:id?IdDocumento=` | Un documento específico del usuario (p. ej. foto de perfil). |
| `GET /doctos/:Id` | Todos los documentos del usuario `:Id` (IdLogin). 404 si no hay. |
| `GET /getExpediente/:IdDormi` | Expedientes de los alumnos de un dormitorio (revisión del preceptor). |
| `GET /getArchivos/:Dormitorio/:Nombre?/:Apellidos?/:Matricula?` | Archivos filtrados; solo `Dormitorio` es obligatorio. |
| `PUT /statusRevision/:Id` | Aprueba documento. `:Id` = IdLogin, body `{ IdDocumento }`. |
| `PUT /doctosMul/reject/:Id` | Rechaza documento. `:Id` = IdLogin, body `{ IdDocumento, Motivo, Comentario?, MatriculaPreceptor }`. Valida que `MatriculaPreceptor` exista y sea PRECEPTOR/EMPLEADO/VIGILANCIA (403 si no). Emite `document_rejected` (socket) **y** push FCM al alumno. |

## 11. Cargos delegados / Position (`position.routes.js`) — Auth: —

Mecanismo de **suplencia entre empleados** (independiente de CheckerGrant).

| Método y ruta | Descripción |
|---|---|
| `POST /createPosition` | Body `{ MatriculaEncargado, ClassUser, Asignado }`. Crea el cargo. |
| `GET /InfoCargo/:Id` | Cargo por matrícula del encargado. |
| `GET /InfoDelegado/:Id` | Cargos donde `:Id` es el encargado (a quién delegó). |
| `PUT /activarCargo/:Id` | `:Id` = IdCargo. Body `{ Activo }` (número). Activa/desactiva la suplencia. |

El delegado activo recibe también los eventos de socket y los push del encargado
(`emitToEmpleado` resuelve la cobertura vía `Position`), y `GET /VerToken` devuelve su token FCM.

---

## 12. Socket.IO (tiempo real)

Conexión: el cliente se conecta con `?matricula=<matricula>` en el handshake y queda en la sala
`user_<matricula>`. Transports: websocket + polling. CORS abierto.

| Evento (servidor → cliente) | Destinatario | Payload | Se emite en |
|---|---|---|---|
| `new_permission_request` | Alumno | `{ idPermission, idTipoSalida, matriculaAlumno, nombreAlumno, fechaSalida, timestamp }` | `POST /permission` |
| `new_authorization_assigned` | Empleado (+ suplentes) | `{ idPermission, status, timestamp }` | `POST /authorize`, y al aprobarse el eslabón previo |
| `permission_status_changed` | Alumno | `{ idPermission, status, updatedBy, timestamp }` | `PUT /autorizarPermission/:Id` |
| `permission_finalized` | Alumno | `{ idPermission, status, observaciones, timestamp }` | `PUT /permissionValorado/:Id` |
| `permission_cancelled` | Empleados de la cadena (+ suplentes) | `{ idPermission, timestamp }` | `PUT /permission/:Id` |
| `check_updated` | Alumno | `{ idCheck, idPermission, estatus, accion, timestamp }` | `PUT /checks/:id` |
| `document_rejected` | Alumno | `{ idLogin, idDocumento, tipoDocumento, motivo, comentario, rechazadoPor, timestamp }` | `PUT /doctosMul/reject/:Id` |

## 13. Push (FCM)

`src/util/notifications.js` delega en un microservicio (`POST {PUSH_API_URL}/send` con
`{ token, title, body, data }`). Hoy solo se usa para **rechazo de documento**. Si el token FCM
resulta inválido (`messaging/registration-token-not-registered` / `invalid-registration-token`),
se limpia `TokenCFM` del usuario automáticamente. Sin `PUSH_API_URL`, el push se omite con warning.

---

## 14. Deuda técnica conocida (para no redescubrirla)

1. **Sin auth en la mayoría de endpoints**: permisos, documentos, usuarios, authorize, position y los
   GET de checks no exigen token. Endurecerlos es el siguiente paso natural de seguridad.
2. `GET /user/:Id`, `GET /userMatricula/:Matricula` y la respuesta `user` de `/login` devuelven el
   registro completo de `LoginUniPass` (hash de contraseña incluido). Los listados de checks y
   `/buscarPersona` ya fueron saneados; estos tres siguen pendientes.
3. `POST /permission` resta 6 h fijas a las fechas (no maneja DST ni otras zonas).
4. `GET /getExpediente/:IdDormi` responde `580` (código inexistente; typo de 500) en error.
5. `db.sql` está desactualizado respecto a la BD real (`LoginUniPass` es la fuente de verdad).
6. CORS totalmente abierto y body limit de 50 MB global.
7. `GET /userChecks/:EmailAsignador` es legado del modelo DEPARTAMENTO; se retirará al terminar la
   migración del cliente (fase 2b: borrado de cuentas 2035/2063, pendiente).
