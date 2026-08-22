# UniPass API — Arquitectura

Documento de arquitectura del backend UniPass (Node.js + Express + SQL Server).
Estado del código: `c492ca6`. Complementa [ENDPOINTS.md](ENDPOINTS.md),
[API.md](API.md) y [04-diagrama-base-de-datos.md](04-diagrama-base-de-datos.md).

## 1. Panorama general

UniPass API es el backend de un sistema universitario de **permisos de salida** de alumnos
internos y su **checado** físico (dormitorio/caseta), con autorización por cadena de empleados,
expediente documental, notificaciones en tiempo real y push. Es una API REST sin estado
(salvo la capa WebSocket), desplegada como un único proceso Node.

```
┌──────────────┐     HTTP/REST + JWT      ┌──────────────────────────┐
│   Flutter    │ ───────────────────────► │      UniPass API         │
│  (móvil)     │ ◄─── WebSocket (io) ──── │   Node.js + Express       │
└──────────────┘                          │                          │
                                          │  ┌────────────────────┐  │
                                          │  │ Rutas → Controllers │  │
                                          │  │ → Repos → SQL Server│  │
                                          │  └────────────────────┘  │
                                          └───┬───────────┬──────┬────┘
                                              │           │      │
                                   ┌──────────▼──┐  ┌─────▼───┐ ┌▼─────────────┐
                                   │ SQL Server  │  │ API-ULV │ │ Proveedor OTP│
                                   │  (UNIPASS)  │  │(institu-│ │  + Push FCM  │
                                   │             │  │ cional) │ │  (externos)  │
                                   └─────────────┘  └─────────┘ └──────────────┘
```

- **Stack:** Node.js (ESM), Express 4, `mssql`, Socket.IO 4, JWT (`jsonwebtoken`), bcrypt, Multer, morgan, cors.
- **Entrada:** `src/index.js` → crea HTTP server, monta Socket.IO (`src/socket.js`) y la app Express (`src/app.js`).
- **Config:** todo por variables de entorno (`.env`, gitignored; plantilla en `.env.example`).

## 2. Arquitectura en capas

El código sigue una separación por responsabilidad (estilo Clean Architecture pragmático):

```
Request
  │
  ▼
[ Rutas ]         src/routes/*.js          → definen path + método + middlewares
  │
  ▼
[ Middleware ]    src/Middleware/*.js       → verifyToken, requireRole, requireCapability,
  │                                            requireOwnership, storage (multer)
  ▼
[ Controllers ]   src/controllers/*.js      → orquestan: validan input, llaman repos/servicios,
  │                                            arman respuesta, emiten sockets/push
  ▼
[ Services ]      src/services/*.js          → integraciones externas encapsuladas
  │                                            (ulvApiService, otpProviderService, notificationService)
  ▼
[ Repositories ]  src/repositories/*.js      → único lugar con SQL; consultas parametrizadas
  │
  ▼
[ DB ]            src/database/connection.js → withConnection(pool), abre/cierra por operación
```

**Reglas de la separación:**
- El **SQL vive solo en repositories** (consultas parametrizadas con `mssql`; nunca concatenación de input).
- Los **controllers no hacen HTTP externo directo**: usan la capa `services` (evita dispersar llamadas y hosts).
- Los **middlewares** resuelven identidad/autorización antes del controller.
- `withConnection(fn)` (`src/database/connection.js`) abre un pool, ejecuta el callback y **garantiza el cierre** aunque truene; las operaciones transaccionales usan `sql.Transaction` dentro del mismo patrón.

### Estructura de carpetas
```
src/
├── index.js              # bootstrap (http + socket + listen)
├── app.js                # Express: middlewares globales + montaje de routers
├── config.js             # PORT + Cloudinary
├── socket.js             # Socket.IO: sala user_<matricula>
├── routes/               # 15 routers (montados en la raíz, sin prefijo /api)
├── controllers/          # lógica de cada recurso
├── services/             # integraciones externas (ULV, OTP, FCM)
├── repositories/         # acceso a datos (SQL)
├── Middleware/           # verifyToken, authorizeRoles, requireCapability, requireOwnership, storage
├── util/                 # tokens, hashData, passwordPolicy, dateRange, puebloChain, socketHelpers, notifications
└── database/connection.js
database/migrations/      # 010 migraciones SQL idempotentes
docs/                     # documentación
tests/                    # vitest + supertest (61 tests)
```

## 3. Ciclo de vida de una petición

1. **CORS + morgan + body parsers** (JSON/urlencoded hasta 50 MB) — `app.js`.
2. **Router** hace match del path.
3. **Middlewares** de la ruta (en orden): `verifyToken` (setea `req.user` desde el JWT) →
   `requireRole`/`requireCapability`/`requireOwnership` según corresponda → (multer si hay archivo).
4. **Controller**: valida el body, deriva identidad de `req.user` (nunca del body), llama services/repos.
5. **Repository**: consulta parametrizada vía `withConnection`.
6. **Respuesta** JSON; efectos secundarios (**socket**, **push FCM**) se emiten *después* de responder,
   en modo best-effort (un fallo de notificación no revierte la operación).

## 4. Modelo de autenticación y autorización

Tres niveles, aplicados en este orden (ver [API.md](API.md) §3):

1. **Autenticación** — `verifyToken`: exige `Authorization: Bearer <accessToken>`; pone el payload
   en `req.user` (`{ id, matricula, nombre, apellidos, tipo, dormitorio }`). 401 si falta/expira.
   - **Access token** JWT, ~15 min. **Refresh token** opaco (32 bytes), 30 días, guardado **hasheado**
     (SHA-256) en `RefreshToken`, con **rotación** y **detección de reuso** (revoca todas las sesiones).
2. **Autorización** — dos mecanismos:
   - `requireRole(...roles)` — por `TipoUser` del token (p. ej. PRECEPTOR/VIGILANCIA para grants CHECKER).
   - `requireCapability([...])` — por **capability efectiva** = rol (`ADMINISTRATIVO`→`ADMIN`) + otorgadas
     (`CHECKER`, `SUPERVISOR`, en `CheckerGrant`). Usado en `/admin/*` (`ADMIN|SUPERVISOR`) y `/supervisorGrant` (`ADMIN`).
3. **Ownership / scope** — `requireOwnership(resolveOwnerId)`: compara el dueño del recurso contra
   `req.user.id` (p. ej. cancelar un permiso propio → 403 `FORBIDDEN_OWNERSHIP` si es ajeno).

**Principio transversal (Task 7):** la identidad **siempre** sale del token; identificadores del
body/path (`IdUser`, `IdLogin`, `IdEmpleado`, `Matricula`, `Correo`) se aceptan por compatibilidad
pero **se ignoran** como fuente de autoridad.

**Capabilities** (aditivas al rol) se devuelven en `/login`, `/verifyToken`, `/getCapabilities` para
que el cliente muestre pantallas por permiso y no por `TipoUser`.

## 5. Integraciones externas (capa `services`)

| Servicio | Archivo | Uso | Config (env) |
|---|---|---|---|
| **API-ULV** (institucional) | `ulvApiService.js` | Fuente autoritativa: datos del alumno, `work`→jefe de depto, preceptor, coordinador, **correo institucional** (recuperación). | `ULV_API_URL`, `ULV_API_TIMEOUT_MS` |
| **Proveedor OTP** | `otpProviderService.js` | Enviar/validar OTP de recuperación server-side (token de servicio cacheado, renovación en 401). | `OTP_URL`, `OTP_EMAIL`, `OTP_PASSWORD`, `OTP_TIMEOUT_MS` |
| **Push FCM** | `notificationService.js` | Push directo (`POST {URL}/send`); token resuelto server-side. | `FIREBASE_NOTIFICATION_URL`, `FIREBASE_NOTIFICATION_TIMEOUT_MS` |
| **Push FCM (docs)** | `util/notifications.js` | Push de rechazo de documento vía microservicio. | `PUSH_API_URL`, `PUSH_TIMEOUT_MS` |

**Errores externos normalizados**: cada service convierte fallos de transporte a códigos internos
estables (`ULV_API_UNAVAILABLE/TIMEOUT`, `OTP_PROVIDER_UNAVAILABLE/TIMEOUT`) → el cliente nunca
depende de mensajes crudos del proveedor. Las llamadas externas ocurren **fuera** de las transacciones SQL.

## 6. Tiempo real (Socket.IO)

`src/socket.js` — el cliente conecta con `?matricula=<matricula>` y se une a la sala
`user_<matricula>`. Los controllers emiten con `util/socketHelpers.js` (`emitToUser`,
`emitToEmpleado`, este último resuelve la **cobertura/suplencia** vía `Position`). Eventos:
`new_permission_request`, `new_authorization_assigned`, `permission_status_changed`,
`permission_finalized`, `permission_cancelled`, `check_updated`, `document_rejected`.

## 7. Flujos críticos

**Creación de permiso Tipo 1 (Pueblo) — transaccional (Task 7.4A):**
```
POST /permission {IdTipoSalida:1}
  → identidad del token → matrícula del alumno
  → API-ULV: jefe de depto (work→JefeDepto) + preceptor (Bedroom.Identificador→prece)   [fuera de TX]
  → convertir matrícula institucional → cuenta UniPass (si falta → AUTHORIZER_NOT_REGISTERED)
  → dedupe Jefe/Preceptor
  ── BEGIN TX ──  crea Permission + Authorize(orden 1 Jefe, orden 2 Preceptor)  ── COMMIT ──
  → notifica al Jefe (socket + push FCM), best-effort, solo en creación real
```
Regla: **Permission + Authorize completos, o ninguno** (nunca huérfanos). Idempotencia por header
`Idempotency-Key` (tabla `IdempotencyRequest`).

**Recuperación de contraseña (Task 7.1.B):** `forgot` (por matrícula → email institucional → OTP) →
`verify-otp` (valida contra proveedor → emite `resetToken` hasheado, single-use, 10 min) →
`reset` (valida token + política, actualiza hash **atómicamente**, revoca refresh tokens).

**Checado (4 pasos ordenados):** `PUT /checks/:id` exige token + grant CHECKER del tipo de punto y
enforce de orden 1→4 (Salida Dorm → Salida Caseta → Regreso Caseta → Regreso Dorm).

## 8. Persistencia y migraciones

- **BD:** SQL Server (`UNIPASS`). 15 tablas; tabla de usuarios real: **`LoginUniPass`**. Detalle y
  diagrama en [04-diagrama-base-de-datos.md](04-diagrama-base-de-datos.md).
- **Migraciones:** `database/migrations/*.sql`, **idempotentes** (guardas `IF NOT EXISTS`), aplicadas con
  `node scripts/run-sql.js <archivo>` (divide por `GO`). Van de `001` (CheckerGrant) a `010` (PasswordReset).
- **Conexión:** pool por operación (`withConnection`); transacciones con `sql.Transaction` para flujos
  atómicos (creación Pueblo, reset de contraseña).

## 9. Testing

`vitest` + `supertest` (61 tests). Tres tipos: **smoke** (arranque/middleware, sin DB),
**integración** (DB real, con limpieza y guard `DB_SERVER`) y **unit** (funciones puras:
`puebloChain`, `passwordPolicy`, servicios con `fetch`/repos mockeados). Los proveedores externos
(API-ULV, OTP, FCM) se **mockean** en los tests.

## 10. Deuda técnica y estado

- Muchos endpoints legados siguen **abiertos** (sin token); el endurecimiento es **Task 7** (en curso).
  7.1.A/7.1.B/7.2/7.4A(Tipo 1) cerrados; 7.3, 7.4B, 7.5 pendientes. Ver [task7-plan.md](task7-plan.md).
- `GET /user/:Id`, `/userMatricula` y el `user` de `/login` aún exponen el registro completo (hash incluido).
- `POST /permission` aplica un ajuste horario `-6h` hardcodeado (deuda conocida).
- CORS abierto y body limit 50 MB global.
- `PUT /password/:Correo` legado sigue vivo hasta que Flutter migre recuperación.
