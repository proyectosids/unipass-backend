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
- **Capabilities**: además del rol, `/login`, `/verifyToken` y `/getCapabilities` devuelven las
  capabilities aditivas vigentes, para que el cliente muestre pantallas por permiso y no por `TipoUser`:
  ```json
  { "type": "CHECKER", "pointType": "Dormitorio", "idDormitorio": 4, "scope": "AMBOS" }
  { "type": "SUPERVISOR" }
  ```
  (para `CHECKER` con `pointType: "Caseta"` no se incluye `idDormitorio`; `SUPERVISOR` es global y no
  lleva más campos). Ambas viven en `CheckerGrant` (columna `Capability`, migración `008`).
- **`requireCapability([...])`** (`src/Middleware/requireCapability.js`): autoriza por capability
  **efectiva** = derivada del rol (`TipoUser='ADMINISTRATIVO'` → `ADMIN`) + otorgadas (`CHECKER`,
  `SUPERVISOR`). 401 sin token, 403 `FORBIDDEN_CAPABILITY` si no tiene ninguna de las permitidas.

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
| `GET /me` 🔒 | ✅ | **BOLA/IDOR R1**: perfil del usuario **autenticado** (identidad = token). **Proyección segura** (sin `Contraseña`/`TokenCFM`). Única lectura SELF de usuario. |
| ~~`GET /user/:Id`~~ | — | **RETIRADO (BOLA/IDOR R1-C)** → 404 (con o sin Bearer). Usar `GET /me`. |
| ~~`GET /userMatricula/:Matricula`~~ | — | **RETIRADO (BOLA/IDOR R1-C)** → 404. Usar `GET /me`. |
| `PUT /me/password` 🔒 | ✅ | **Task 7.1**: cambio del usuario autenticado. Body `{ actual, nueva }`; identidad del token. 200 / 400 `MISSING_FIELDS`\|`WEAK_PASSWORD` / 401 / 403 `PASSWORD_MISMATCH`. |
| ~~`PUT /password/:Correo`~~ | — | **RETIRADO (P0).** Eliminado (ruta + controlador + repo). El correo del cliente no autoriza cambios de contraseña → responde **404**. Usar `PUT /me/password` o el flujo de recuperación (`/password/forgot` → `/password/verify-otp` → `/password/reset`). |
| ~~`GET /buscarUser/:Nombre`~~ | — | **RETIRADO (BOLA/IDOR R1-A)** → 404 (SELECT lp.* incl. hash, enumeración anónima). Reemplazo seguro: `GET /buscarPersona/:Nombre` (🔒 `canGrant`, campos seguros + `ExisteEnPosition`). |
| ~~`GET /userChecks/:EmailAsignador`~~ | — | **RETIRADO (BOLA/IDOR R1-A)** → 404 (modelo DEPARTAMENTO retirado; SELECT * incl. hash). |
| `PUT /cambiarCargo/:Matricula` | — | Body `{ IdCargoDelegado }`. Asigna cargo delegado. |
| `PUT /terminarCargo/:Matricula` | — | Limpia `IdCargoDelegado` y borra el registro de `Position` asociado. |
| ~~`GET /VerToken/:Matricula`~~ | — | **RETIRADO (BOLA/IDOR R1-A)** → 404. Exponía `TokenCFM` (token de push) de cualquiera. La resolución FCM (incluida la suplencia de `Position`) es **interna** server-side (`notificationService`). |
| `PUT /TokenDispositivo/:Matricula` | ✅ | Body `{ TokenCFM }`. Registra token FCM. **Task 7.2**: matrícula del token (`:Matricula` ignorado). |
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
| `GET /getCapabilities` | Auth: ✅ Bearer (cualquier rol). `{ capabilities: [...] }` del usuario autenticado (incluye `CHECKER` y/o `SUPERVISOR`). |
| `POST /supervisorGrant` | Auth: ✅ Bearer + capability `ADMIN`. Body `{ IdLogin }`. Otorga/reactiva SUPERVISOR (global, solo lectura). 201 nuevo / 200 reactivado; 403 si no es ADMIN. |
| `DELETE /supervisorGrant/:idLogin` | Auth: ✅ Bearer + capability `ADMIN`. Revoca SUPERVISOR. 404 `GRANT_NOT_FOUND`. |

### Checks (`checks.routes.js`)

Los 4 listados devuelven únicamente **campos seguros** (sin `Contraseña`/`Correo`/`TokenCFM`):
`IdCheck, IdPermission, Accion, Estatus, NombrePunto, FechaSalida, FechaRegreso, Descripcion (tipo de salida), IdUser, Matricula, Nombre, Apellidos, Paso`.
Todos responden `200` con `null` cuando no hay pendientes.

| Método y ruta | Auth | Descripción |
|---|---|---|
| ~~`POST /checks`~~ | — | **RETIRADO (Checks Hardening C2)** → 404. Los 4 CheckPoints se crean **server-side** al transicionar `Permission → Aprobada` (`ensureCheckPointsTx`). Ninguna API pública inserta CheckPoints. |
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
| `GET /permission/:Id?page=1&limit=10` | Permisos del alumno (`:Id` = IdUser), **paginado**: `{ data, pagination: { totalItems, totalPages, currentPage, limit } }`. Campos explícitos seguros. |
| `POST /permission` 🔒 | **Task 7.2 + 7.4B/B**: `IdUser` = token (body ignorado). Crea permiso **y la cadena `Authorize` server-side** (tipos 1/2/3); **el cliente no manda autorizador ni estado** (`StatusPermission`/`StatusAuthorize`/`IdEmpleado` ignorados; todo nace `Pendiente`). Body `{ FechaSolicitada, FechaSalida, FechaRegreso, Motivo, IdTipoSalida, MedioSalida? }`. **Tipo 4 → 501 `SALIDA_TIPO_NO_DISPONIBLE`**; tipo inválido → 400. `409` si no se resuelve autorizador (sin permiso huérfano). ⚠️ Resta **6 h** a las fechas (UTC). Emite `new_permission_request`. 401 sin token. |
| `PUT /permission/:Id` 🔒 | **Cancela** (`StatusPermission='Cancelado'`). **Task 7.2**: solo el dueño (`Permission.IdUser == token.id`), si no **403** `FORBIDDEN_OWNERSHIP`; 404 `PERMISSION_NOT_FOUND`. Emite `permission_cancelled`. |
| `DELETE /permission/:Id` 🔒 | **Task 7 (§8)**: cerrado a capability `ADMIN` (Frontend no lo usa). Elimina el permiso. 401/403. |
| ~~`PUT /permissionValorado/:Id`~~ | **RETIRADO (7.4B Commit A)** → 404. El estado global de `Permission` lo calcula el backend al resolver cada eslabón; el cliente ya no lo fija. |
| `GET /PermissionsPreceptor/:Id` | Permisos pendientes de autorizar por el preceptor (`:Id` = IdEmpleado). Sin datos → `200 null`. |
| `GET /permissionsEmployee/:Id` | Permisos pendientes de autorizar por un empleado/jefe. Sin datos → `200 []`. Campos explícitos seguros (sin datos sensibles de `LoginUniPass`). |
| `GET /permissionTop/Student/:Id` | Últimos 10 permisos del alumno. Sin datos → `200 []`. |
| `GET /permissionTop/Employee/:Id` | Últimos 10 por autorizar del empleado. Sin datos → `200 []`. |
| `GET /permissionTop/Preceptor/:Id` | Últimos 10 por autorizar del preceptor. Sin datos → `200 []`. |
| `GET /dashboardPermission/:IdPreceptor` | Conteos de permisos para dashboard del preceptor. |
| `GET /dashboardDocumentos/:IdPreceptor` | Conteos de documentos para dashboard. |
| `GET /permissions/filter/:IdPreceptor?fechaInicio&fechaFin&status&nombre&matricula` | Filtro de permisos. `:IdPreceptor` es la **matrícula numérica** del consultante; según su `TipoUser` filtra como `ADMINISTRATIVO` (global) o `PRECEPTOR` (su dormitorio). Otros roles → 403. Sin resultados → 404. Campos explícitos seguros. |

## 8. Cadena de autorización (`authorize.routes.js`) — Auth: mixta (ver por ruta)

Un permiso genera registros en `Authorize` (jefe de trabajo → preceptor…). Si a la misma persona
le tocan ambos roles, el segundo `POST /authorize` **no duplica**: marca `DualRole = 1`.

| Método y ruta | Descripción |
|---|---|
| ~~`POST /authorize`~~ | **RETIRADO (7.4B Commit B)** → 404. La creación de filas `Authorize` es interna del backend (`POST /permission` arma la cadena server-side, siempre `Pendiente`). |
| `PUT /autorizarPermission/:Id` 🔒 | **7.4B Commit A.** `:Id` = IdPermission. **Requiere Bearer**; actor = token (matrícula server-side), `IdEmpleado` del body **ignorado**. Body `{ StatusAuthorize: 'Aprobada'\|'Rechazada' }`. Correspondencia de fila (`403 NOT_AUTHORIZER`), estados `Pendiente→Aprobada\|Rechazada` (`409`), orden estricto (`409 ORDER_NOT_READY`), `404`. Estado global de `Permission` recalculado por backend; atómico + AuditLog. Emite `permission_status_changed` (+ `new_authorization_assigned` al siguiente). |
| `GET /validarAuthorize/:Id?IdPermiso=` | ¿El empleado `:Id` tiene autorización sobre ese permiso? 404 si no. |
| `GET /progresAuthorize/:Id` | Avance de la cadena del permiso `:Id`. Cada fila incluye `DualRole` (bool) y `Roles: ['Jefe de trabajo','Preceptor']` cuando aplica. |
| `GET /asignarPrece/:Nivel?Sexo=` | Dormitorio/preceptor que corresponde por nivel académico y sexo (consulta `Bedroom`). |
| `GET /autorizadorSalida?tipo=2\|3&nivelAcademico=&sexo=` | Resuelve quién autoriza salidas ESPECIAL(2)/A CASA(3) según el switch `AUTORIZADOR_SALIDAS` en `Configuracion`: `{ IdEmpleado, NoDepto, modo }`. Modo `COORDINADOR` = **híbrido**: usa el override de config si está, si no resuelve al ADMINISTRATIVO activo de Coordinación (auto-hereda el cambio de coordinador); modo `PRECEPTOR` = misma resolución que hace hoy la app (Bedroom → preceptor del dormitorio). Sin fallback silencioso: 400 coordinador no resoluble / 404 preceptor no resuelto. |

### Dashboard del coordinador — `GET /admin/dashboard?desde=&hasta=` (Auth: ✅ Bearer + capability `ADMIN`|`SUPERVISOR`)

> Los tres endpoints `/admin/*` (dashboard, reporte, observaciones) requieren token y capability
> `ADMIN` (coordinador ADMINISTRATIVO) **o** `SUPERVISOR`. Sin token → 401; autenticado sin la
> capability → 403 `FORBIDDEN_CAPABILITY`. SUPERVISOR es solo lectura (no accede a escritura).


Conteos agregados para el panel del Coordinador de dormitorios (todo se calcula en SQL, sin filas
de detalle): `pendientes` (bandeja del coordinador: tipos 2/3 `Pendiente`, ventana −30/+15 días,
total + por dormitorio), `alumnosFuera` (salida de Caseta confirmada sin retorno confirmado — estado
actual, todos los tipos), `actividadReciente` (últimos 10 valorados del periodo, tipos 2/3) y
`totalesPorDormitorio` (solicitudes/aprobadas/rechazadas del periodo). Periodo default: semana
actual (lunes → hoy) por `FechaSolicitada`; override `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`. El
filtro es por **fecha de calendario** (`CAST(... AS DATE)`), así que el día de hoy y el día `hasta`
quedan incluidos completos, sin importar la hora ni la zona horaria.
El coordinador se resuelve con el mismo híbrido de `/autorizadorSalida`. Índices de apoyo en
migración `007`.

### Reportes del coordinador (Auth: —)

Solo lectura, filtran por **fecha de calendario** (`?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`, `hasta`
inclusivo, día completo sin importar hora/zona; sin params = semana actual). Rango inválido →
`400 { "message": "Rango invalido: desde y hasta en formato YYYY-MM-DD, desde <= hasta" }`. Vacío → `200 []`.

- `GET /admin/reporte` — salidas valoradas (`Aprobada`/`Rechazada`) tipos 2/3 con `FechaSalida` en el
  rango: `[ { idPermiso, alumno, matricula, dormitorio, tipo, fechaSalida, fechaRegreso, autorizadoPor, status } ]`.
  `autorizadoPor` = quien dio la valoración final (vía `Authorize`; vacío si el permiso no tiene cadena).
- `GET /admin/observaciones` — observaciones **no vacías** de checadores (una por check, `'Ninguna'` se
  trata como vacío) con `FechaCheck` en el rango: `[ { idCheck, idPermiso, alumno, dormitorio, paso,
  checador, fecha, observacion } ]`. `paso` ∈ {Salida dormitorio, Salida caseta, Retorno caseta, Retorno
  dormitorio}. Las observaciones se guardan **por check** (columna `CheckPoints.Observaciones` por fila,
  no se sobreescriben entre los 4 pasos).

## 9. Dormitorios y puntos — Auth: —

- `GET /dormitorio/:Sexo/:NivelAcademico` (`bedroom.routes.js`) — registro de `Bedroom` para ese sexo/nivel (asignación de dormitorio al registrarse).
- `GET /getPoints/:Id` (`point.routes.js`) — puntos de control de un tipo de salida (`:Id` = IdExit); base para crear los 4 checks.

## 10. Documentos / expediente (`doctos.routes.js`) — Auth: —

Subida con Multer a `public/uploads/` (nombre = timestamp + extensión). Tipos permitidos:
**jpg, jpeg, png, pdf** (otros se descartan silenciosamente → “Archivo no cargado”). Límite 50 MB.

| Método y ruta | Descripción |
|---|---|
| `POST /doctosMul` 🔒 | **Task 7.2**: `IdLogin` = token (body ignorado); `verifyToken` antes de multer. `multipart/form-data`: campo **`Archivo`** + `IdDocumento`. Crea documento `StatusDoctos: 'Adjunto'`. Rollback de archivo si la BD falla. 401 sin token. |
| `PUT /doctosMul/updateProfile` 🔒 | Igual pero **reemplaza** el archivo. **Task 7.2**: opera sobre el doc del token (`IdLogin` del body ignorado). |
| `DELETE /doctosMul/:Id` 🔒 | Borra doc **propio**. **Task 7.2**: `IdLogin` = token (`:Id` ignorado), body `{ IdDocumento }`. 401 sin token. |
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
