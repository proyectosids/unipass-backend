# UniPass API — Referencia detallada de endpoints

Complemento de [API.md](API.md) (visión general, auth, modelo de datos). Aquí está el
**contrato exacto** de cada endpoint: request, response de ejemplo y errores, tal como los
produce el código actual. Base URL: `http://<host>:<PORT>` (sin prefijo `/api`).

Convenciones de los ejemplos:
- `🔒` = requiere `Authorization: Bearer <accessToken>`. Sin icono = endpoint abierto (deuda técnica conocida).
- Las fechas son `DATETIME` de SQL Server serializadas como ISO-8601 (`"2026-07-18T14:30:00.000Z"`).
- `⚠️ SELECT *`: la respuesta arrastra todas las columnas de las tablas del JOIN (incluidos campos
  sensibles de `LoginUniPass`); se documentan solo los campos que el cliente usa.

---

## 1. Sesión

### POST /login

```json
// Request (Matricula acepta matrícula o correo)
{ "Matricula": "221078", "Contraseña": "miPassword" }
```

```json
// 200
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "9f2c4a...64 hex chars",
  "token": "eyJhbGciOiJIUzI1NiIs...",        // alias legado de accessToken
  "user": { "IdLogin": 1, "Matricula": "221078", "Nombre": "Irving", "Apellidos": "González",
            "TipoUser": "ALUMNO", "Dormitorio": 3, "Documentacion": 1, "...": "⚠️ registro completo de LoginUniPass" },
  "capabilities": [
    { "type": "CHECKER", "pointType": "Dormitorio", "idDormitorio": 4, "scope": "AMBOS" }
  ]
}
```

| Error | Body |
|---|---|
| 400 | `{ "success": false, "message": "Debe proporcionar matrícula o correo" }` |
| 401 | `{ "success": false, "message": "Credenciales inválidas" }` |

### POST /refresh-token

```json
// Request
{ "refreshToken": "9f2c4a..." }
// 200 — par NUEVO; el refresh anterior queda revocado (rotación)
{ "accessToken": "eyJ...", "refreshToken": "b81d3e..." }
```

401 con `code`: `INVALID_REFRESH_TOKEN` · `REFRESH_REUSE_DETECTED` (reuso → revoca **todas** las
sesiones del usuario) · `REFRESH_EXPIRED` · `USER_NOT_FOUND`. 400 `MISSING_REFRESH_TOKEN`.

### POST /logout 🔒

Body `{ "refreshToken": "..." }` → **204** sin body (idempotente: si ya estaba revocado, también 204).

### GET /verifyToken 🔒

```json
// 200
{
  "success": true,
  "user": { "id": 1, "matricula": "221078", "nombre": "Irving", "apellidos": "González",
            "tipo": "ALUMNO", "dormitorio": 3, "iat": 1752868000, "exp": 1752868900 },
  "capabilities": [ { "type": "CHECKER", "pointType": "Caseta", "scope": "SALIDA" } ]
}
```

401: `{ message, code: "TOKEN_EXPIRED" | "TOKEN_INVALID" }` o `Token no proporcionado`.

---

## 2. Usuarios y registro

### POST /register

```json
// Request
{ "Matricula": "230001", "Contraseña": "abc123", "Correo": "alumno@ulv.edu.mx",
  "Nombre": "Ana", "Apellidos": "Pérez", "TipoUser": "ALUMNO", "Sexo": "F",
  "FechaNacimiento": "2004-05-12", "Celular": "9611234567", "Dormitorio": 1 }
// 200 — eco con IdLogin y StatusActividad: 1 (⚠️ incluye el hash en "Contraseña")
```

| Error | Body |
|---|---|
| 400 | `{ "message": "El rol DEPARTAMENTO fue retirado...", "code": "DEPARTAMENTO_RETIRED" }` |
| 400 | `{ "message": "Usuario ya registrado" }` |

### GET /user/:Id · GET /userMatricula/:Matricula

Usuario por `IdLogin` / por matrícula. **200**: ⚠️ registro completo de `LoginUniPass`
(incluye `Contraseña` hasheada y `TokenCFM` — pendiente de sanear). **404** `{ "message": "Dato no encontrado" }`.

### PUT /password/:Correo

Body `{ "NewPassword": "nuevo123" }` → **200** `{ "message": "Contraseña actualizado correctamente" }`.
**404** si el correo no existe (o la cuenta es DEPARTAMENTO, excluida a propósito).

### GET /buscarUser/:Nombre

Match **exacto** contra `Nombre` **o** `Apellidos` (no es LIKE; para búsqueda parcial usar
`/buscarPersona`). **200**: array de registros ⚠️ completos + `"ExisteEnPosition": "Existe en Position" | "No existe en Position"`.
**404** con body `null`.

### GET /userChecks/:EmailAsignador — legado

Cuentas `DEPARTAMENTO` asignadas por ese correo. Vivo solo durante la transición a CheckerGrant.
**404** `{ "message": "No hay datos registrados" }`.

### Cargo delegado y FCM

| Endpoint | Request | 200 |
|---|---|---|
| `PUT /cambiarCargo/:Matricula` | `{ "IdCargoDelegado": 7 }` | `{ "message": "Estado actualizado exitosamente" }` |
| `PUT /terminarCargo/:Matricula` | — | `{ "message": "Estado actualizado y registro eliminado exitosamente" }` (limpia `IdCargoDelegado` **y** borra la fila de `Position`) |
| `GET /VerToken/:Matricula` | — | `[ { "TokenCFM": "fcm_token..." } ]` — si la matrícula tiene delegado activo, devuelve el/los tokens del delegado; si no, el propio |
| `PUT /TokenDispositivo/:Matricula` | `{ "TokenCFM": "fcm_token..." }` | `"Dato Actulizado"` (string) |
| `PUT /Documentacion/:Matricula` | `{ "StatusDoc": 1 }` | `"Dato Actulizado"` (string) |

Errores: 400 `{ message: "El registro no tiene un IdCargoDelegado válido" }` (terminarCargo), 404 `{ message: "Dato no encontrado" }`.

---

## 3. Permisos de salida

### GET /permission/:Id?page=1&limit=10

Historial del alumno (`:Id` = `IdLogin`), ordenado por `FechaSolicitada` desc.

```json
// 200
{
  "data": [ { "IdPermission": 6033, "FechaSolicitada": "2026-07-10T08:00:00.000Z",
              "StatusPermission": "Aprobada", "FechaSalida": "2026-07-12T09:00:00.000Z",
              "FechaRegreso": "2026-07-13T18:00:00.000Z", "Motivo": "Visita familiar",
              "IdUser": 1, "IdTipoSalida": 2, "Observaciones": "Ninguna",
              "Descripcion": "Fin de semana", "...": "campos explícitos seguros (ver nota abajo)" } ],
  "pagination": { "totalItems": 42, "totalPages": 5, "currentPage": 1, "limit": 10 }
}
```

### POST /permission

```json
// Request
{ "IdUser": 1, "FechaSolicitada": "2026-07-18T10:00:00", "FechaSalida": "2026-07-19T09:00:00",
  "FechaRegreso": "2026-07-20T18:00:00", "StatusPermission": "Pendiente",
  "Motivo": "Trámite", "IdTipoSalida": 2, "MedioSalida": "Autobús" }
```

⚠️ El backend **resta 6 horas** a las tres fechas antes de guardar (ajuste CDMX hardcodeado):
manda hora local sin offset. **200**: eco con `Id` (IdPermission). **400**
`{ "error": "El IdUsuario no existe en dbo.Users" }`. Emite socket `new_permission_request`.

### Ciclo de vida

| Endpoint | Request | Efecto / 200 |
|---|---|---|
| `PUT /permission/:Id` | — | `StatusPermission = 'Cancelado'` → `"Dato Actualizado"`; emite `permission_cancelled` a los empleados de la cadena |
| ~~`PUT /permissionValorado/:Id`~~ | — | **RETIRADO (7.4B Commit A)** → 404. El estado global de `Permission` lo calcula el backend al resolver cada eslabón; el cliente no puede fijarlo. |
| `DELETE /permission/:Id` | — | Borra la fila → `{ "message": "Dato Eliminado" }` |

### Bandejas de autorización

- `GET /PermissionsPreceptor/:Id` — permisos donde el preceptor `:Id` (IdEmpleado/matrícula numérica)
  es **único aprobador** o el eslabón previo ya aprobó. Ventana: `FechaSalida` entre −30 y +15 días.
  Sin datos → `200 null`. Campos explícitos seguros (mismo set que `/permissionsEmployee`).
- `GET /permissionsEmployee/:Id` — permisos asignados al empleado `:Id` (misma ventana). Sin datos → `200 []` (arreglo vacío, no 404). Campos **explícitos y seguros** (sin `Contraseña`/`Correo`/`TokenCFM`): `IdPermission, FechaSolicitada, StatusPermission, FechaSalida, FechaRegreso, Motivo, IdUser, IdTipoSalida, Observaciones, Aprobo, IdTypeExit, Descripcion, IdLogin, Matricula, Nombre, Apellidos, TipoUser, Sexo, Dormitorio`.
- `GET /permissionTop/Student/:Id` · `/Employee/:Id` · `/Preceptor/:Id` — últimos 10 de cada bandeja. Sin datos → `200 []`. Employee/Preceptor con campos explícitos seguros (mismo set que `/permissionsEmployee`); Student solo lee `Permission` (sin JOIN a usuario).

### Dashboards (preceptor/administrativo)

```json
// GET /dashboardPermission/:IdPreceptor   (:IdPreceptor = matrícula)
[ { "Aprobadas": 12, "Rechazadas": 3, "Pendientes": 5, "Total": 20 } ]

// GET /dashboardDocumentos/:IdPreceptor
[ { "Total": 120, "Aprobado": 90, "Pendiente": 30 } ]
```

Regla: `Dormitorio = 5` en el perfil del consultante = vista global (administración); otro valor = solo su dormitorio.

### GET /permissions/filter/:IdPreceptor

Query params (todos opcionales): `fechaInicio` (día exacto de `FechaSalida`), `fechaFin` (día exacto
de `FechaRegreso`), `status`, `nombre` (LIKE), `matricula` (LIKE).
`:IdPreceptor` = matrícula del consultante; según su `TipoUser`:
`ADMINISTRATIVO` → todos los permisos; `PRECEPTOR` → los de su cadena; otro rol → **403**.
**200**: array con campos explícitos seguros (mismo set que `/permissionsEmployee`) · **404** usuario o sin resultados.

---

## 4. Cadena de autorización

### ~~POST /authorize~~ — RETIRADO (7.4B Commit B)

**Eliminado** (ruta + controlador + repo). Llamarlo → **404**. La cadena `Authorize` se crea
**server-side** dentro de `POST /permission` para tipos 1/2/3 (siempre `StatusAuthorize='Pendiente'`,
`Orden` autoritativo, `DualRole=1` cuando jefe==preceptor). El cliente ya no inserta autorizadores.

### PUT /autorizarPermission/:Id  🔒 (7.4B Commit A)

`:Id` = IdPermission. **Requiere Bearer.** Body **solo** `{ "StatusAuthorize": "Aprobada" | "Rechazada" }`.
El **actor se deriva del token** (matrícula resuelta server-side); el `IdEmpleado` del body se **ignora**.
Reglas: correspondencia de fila (`403 NOT_AUTHORIZER` si no es tu eslabón), máquina de estados
`Pendiente→Aprobada|Rechazada` (`409 INVALID_TRANSITION`), orden estricto (`409 ORDER_NOT_READY`),
`404 PERMISSION_NOT_FOUND`, `409 PERMISSION_NOT_PENDING`. El estado global de `Permission` lo **recalcula
el backend** (rechazo⇒Rechazada; todas aprobadas⇒Aprobada; si queda pendiente⇒Pendiente), todo en una
transacción con `AuditLog`. **200**: `{ IdPermission, IdAuthorize, StatusAuthorize, StatusPermission }`.
Emite `permission_status_changed` al alumno y, si aplica, `new_authorization_assigned` al siguiente.

### GET /progresAuthorize/:Id

```json
// 200 — avance de la cadena del permiso :Id
[ { "IdAuthorize": 980, "IdEmpleado": 100200, "NoDepto": 4, "IdPermission": 6033,
    "StatusAuthorize": "Aprobada", "FechaAprobacion": "2026-07-18T11:05:00.000Z",
    "DualRole": true, "Rol": "Jefe de trabajo", "NombreAprobador": "Rafael Mora",
    "Orden": 1, "Roles": ["Jefe de trabajo", "Preceptor"] } ]
```

`Roles` es `null` cuando `DualRole` es `false`. **404** si el permiso no tiene cadena.

### Otros

- `GET /validarAuthorize/:Id?IdPermiso=6033` — registro `Authorize` de ese empleado para ese permiso; **404** si no participa.
- `GET /asignarPrece/:Nivel?Sexo=F` — registro de `Bedroom` (dormitorio + preceptor) para ese nivel/sexo; **404** si no hay.

### GET /autorizadorSalida?tipo=2|3&nivelAcademico=...&sexo=...

Resuelve **quién autoriza** las salidas ESPECIAL (2) y A CASA (3) según el switch
`AUTORIZADOR_SALIDAS` de `UNIPASS.Configuracion` (migración `005`). Se alterna con un
UPDATE en BD, sin redesplegar. `nivelAcademico`/`sexo` solo se usan en modo PRECEPTOR.

```json
// 200 — modo COORDINADOR (hibrido)
{ "IdEmpleado": 264, "NoDepto": 351, "modo": "COORDINADOR" }

// 200 — modo PRECEPTOR (misma resolucion que la app hace hoy:
// Bedroom por sexo+nivel -> Identificador=NoDepto; preceptor del dormitorio -> IdEmpleado)
{ "IdEmpleado": 41, "NoDepto": 318, "modo": "PRECEPTOR" }
```

**Modo COORDINADOR (híbrido):** primero mira el override en `Configuracion`
(`COORDINADOR_IDEMPLEADO`/`COORDINADOR_NODEPTO`) — si ambos traen valor válido, mandan.
Si están vacíos (default tras migración `006`), resuelve al **ADMINISTRATIVO activo de
Coordinación** (`LoginUniPass.Dormitorio → Bedroom.Identificador`), de modo que al cambiar
de coordinador el resultado se hereda solo, sin tocar config ni código.

| Error | HTTP | Body |
|---|---|---|
| Tipo inválido | 400 | `{ "message": "tipo debe ser 2 o 3" }` |
| Coordinador ni configurado ni resoluble (modo COORDINADOR) | 400 | `{ "message": "Coordinador de dormitorios no configurado ni resoluble" }` |
| Faltan params (modo PRECEPTOR) | 400 | `{ "message": "nivelAcademico y sexo son obligatorios en modo PRECEPTOR" }` |
| Sin dormitorio para nivel/sexo | 404 | `{ "message": "Preceptor no resuelto para ese nivel/sexo" }` |
| Dormitorio sin preceptor activo | 404 | `{ "message": "Jefe de preceptor no resuelto para ese dormitorio" }` |
| Error interno (p. ej. migración 005 sin aplicar) | 500 | `{ "message": "Error resolviendo autorizador" }` |

---

## 5. Checador (grants + checks)

### POST /checkerGrant 🔒 (PRECEPTOR | VIGILANCIA)

```json
// Request — Tipo/IdDormitorio/AsignadoPor se derivan del token, NO se mandan
{ "IdLogin": 2064, "Scope": "AMBOS", "Vigencia": "PERMANENTE" }
// TEMPORAL requiere fecha:
{ "IdLogin": 2064, "Scope": "SALIDA", "Vigencia": "TEMPORAL", "FechaExpira": "2026-08-01T00:00:00" }
```

```json
// 201 creado / 200 reactivado (upsert por IdLogin+Tipo+IdDormitorio)
{ "IdGrant": 7, "IdLogin": 2064, "IdPoint": null, "Tipo": "Dormitorio", "IdDormitorio": 4,
  "Scope": "AMBOS", "AsignadoPor": 3, "Activo": true, "Vigencia": "PERMANENTE",
  "FechaExpira": null, "FechaCreacion": "2026-06-28T19:12:00.000Z" }
```

400: `MISSING_FIELDS` · `INVALID_SCOPE` · `INVALID_VIGENCIA` · `MISSING_FECHA_EXPIRA`. 403 `FORBIDDEN_ROLE`.

### GET /checkerGrants 🔒 (PRECEPTOR | VIGILANCIA)

Grants **activos** del alcance del consultante (PRECEPTOR → `Tipo='Dormitorio'` de su dorm;
VIGILANCIA → `Tipo='Caseta'`), enriquecidos con datos del beneficiario:

```json
[ { "IdGrant": 7, "IdLogin": 2064, "Tipo": "Dormitorio", "IdDormitorio": 4, "Scope": "AMBOS",
    "Vigencia": "PERMANENTE", "FechaExpira": null, "Activo": true, "AsignadoPor": 3,
    "FechaCreacion": "2026-06-28T19:12:00.000Z",
    "Matricula": "230500", "Nombre": "Samir", "Apellidos": "Alamilla", "TipoUser": "ALUMNO" } ]
```

### Resto de gestión 🔒 (PRECEPTOR | VIGILANCIA)

| Endpoint | Request | 200 |
|---|---|---|
| `GET /checkerGrantsByUser/:idLogin` | — | Todos los grants del usuario (activos e inactivos, sin JOIN) |
| `PUT /checkerGrant/:idGrant` | `{ "Activo": 0 }` | `{ "message": "Grant actualizado", "code": "GRANT_UPDATED" }` — 400 `INVALID_ACTIVO`, 404 `GRANT_NOT_FOUND` |
| `DELETE /checkerGrant/:idGrant` | — | `{ "message": "Grant revocado", "code": "GRANT_REVOKED" }` (DELETE físico) |
| `GET /buscarPersona/:Nombre` | — | `[ { "IdLogin": 2064, "Matricula": "230500", "Nombre": "Samir", "Apellidos": "Alamilla", "TipoUser": "ALUMNO" } ]` — LIKE parcial insensible a acentos/mayúsculas, solo activos, sin DEPARTAMENTO, **solo campos seguros**. Lista vacía si no hay match |

### GET /getCapabilities 🔒 (cualquier rol)

`{ "capabilities": [ { "type": "CHECKER", "pointType": "Caseta", "scope": "SALIDA" } ] }` — solo grants vigentes.

### Listados de checks pendientes

Los 4 devuelven el **mismo shape seguro** (sin `Contraseña`/`Correo`/`TokenCFM`) y `200 null` si no hay pendientes:

```json
[ { "IdCheck": 4037, "IdPermission": 6033, "Accion": "SALIDA", "Estatus": "Pendiente",
    "NombrePunto": "Dormitorio", "FechaSalida": "2026-07-19T09:00:00.000Z",
    "FechaRegreso": "2026-07-20T18:00:00.000Z", "Descripcion": "Fin de semana",
    "IdUser": 1, "Matricula": "221078", "Nombre": "Irving", "Apellidos": "González", "Paso": 1 } ]
```

| Endpoint | Paso | Visible cuando… |
|---|---|---|
| `GET /checksDormitorio/:Id` (`:Id`=IdDormitorio) | 1 | Permiso `Aprobada` y `FechaSalida` ≤ hoy |
| `GET /checksVigilancia` | 2 | Paso 1 `Confirmada` |
| `GET /checksVigilanciaRegreso` | 3 | Paso 2 `Confirmada` |
| `GET /checksDormitorioFin/:Id` | 4 | Pasos 2 **y** 3 `Confirmada` |

### POST /checks

`{ "Accion": "SALIDA", "IdPoint": 3, "IdPermission": 6033 }` →
`{ "Id": 4041, "StatusCheck": "Pendiente", "Accion": "SALIDA", "IdPoint": 3, "IdPermission": 6033, "Observaciones": "Ninguna" }`.
El cliente crea los 4 al aprobarse el permiso.

### PUT /checks/:id 🔒

```json
// Request
{ "FechaCheck": "2026-07-19T09:05:00", "Estatus": "Confirmada", "Observaciones": "Ninguna" }
// 200
{ "message": "CheckPoint actualizado correctamente" }
```

Secuencia de validación (en este orden):

| Código | HTTP | Cuándo |
|---|---|---|
| `CHECK_NOT_FOUND` | 404 | El IdCheck no existe |
| `NOT_AUTHORIZED_CHECKER` | 403 | Sin `CheckerGrant` vigente del tipo del check (Dormitorio = el del **alumno**; Caseta = cualquiera) o el `Scope` no cubre la `Accion` |
| `CHECK_OUT_OF_ORDER` | 409 | `Estatus:'Confirmada'` y el paso anterior (N−1) de esa salida no está `Confirmada` |

Al confirmar registra `ConfirmadoPor = IdLogin` del checador y emite `check_updated` al alumno.

---

> **🔒 Los tres endpoints `/admin/*` requieren `Authorization: Bearer <token>` + capability
> `ADMIN` o `SUPERVISOR`.** Sin token → `401`; autenticado sin la capability → `403
> { "message": "No tienes permiso para acceder a este recurso", "code": "FORBIDDEN_CAPABILITY" }`.
> `ADMIN` = coordinador `ADMINISTRATIVO` (por rol). `SUPERVISOR` = capability otorgada con
> `POST /supervisorGrant` (solo lectura; ver §5).

### GET /admin/dashboard?desde=YYYY-MM-DD&hasta=YYYY-MM-DD

Panel del Coordinador de dormitorios: conteos agregados calculados en SQL (COUNT/GROUP BY).
Periodo default: **semana actual** (lunes → hoy, por `FechaSolicitada`); `desde`/`hasta`
van juntos y `hasta` es inclusivo. El filtro compara por **fecha de calendario**
(`CAST(FechaSolicitada AS DATE)`), de modo que el día de hoy y el día `hasta` se incluyen
completos sin importar la hora ni la zona horaria (evita el shift de −6h del almacenamiento). El coordinador se resuelve con el mismo híbrido de
`/autorizadorSalida` (override en `Configuracion` o ADMINISTRATIVO activo de Coordinación).

```json
// 200
{
  "pendientes": {
    "total": 3,
    "porDormitorio": [ { "idDormitorio": 4, "nombre": "H.V.N.U", "total": 3 } ]
  },
  "alumnosFuera": [ { "idDormitorio": 4, "nombre": "H.V.N.U", "total": 1 } ],
  "actividadReciente": [
    { "idPermiso": 7039, "alumno": "IRVING YAEL PATRICIO GONZALEZ", "tipo": 3,
      "status": "Aprobada", "fecha": "2026-07-20T01:24:38.883Z" }
  ],
  "totalesPorDormitorio": [
    { "idDormitorio": 4, "nombre": "H.V.N.U", "solicitudes": 2, "aprobadas": 2, "rechazadas": 0 }
  ]
}
```

Semántica de cada bloque:
- `pendientes` — permisos tipos **2/3** con `StatusPermission='Pendiente'` **asignados al
  coordinador** (via `Authorize`), misma ventana −30/+15 días que su bandeja
  (`/permissionsEmployee`). Coincide con lo que ve en la app.
- `alumnosFuera` — alumnos (distintos) con salida de **Caseta confirmada** y sin retorno de
  Caseta confirmado. Estado físico actual: **no** filtra por periodo ni por tipo de salida.
- `actividadReciente` — últimos 10 permisos `Aprobada`/`Rechazada` (tipos 2/3) del periodo;
  `fecha` = `FechaAprobacion` del último eslabón o `FechaSolicitada` si no hay.
- `totalesPorDormitorio` — solicitudes tipos 2/3 del periodo y cuántas terminaron
  aprobadas/rechazadas. Listas vacías `[]` cuando no hay datos (nunca 404).

| Error | HTTP | Body |
|---|---|---|
| Rango inválido (falta uno, formato ≠ YYYY-MM-DD, o desde > hasta) | 400 | `{ "message": "Rango invalido: desde y hasta van juntos en formato YYYY-MM-DD, con desde <= hasta" }` |
| Coordinador ni configurado ni resoluble | 400 | `{ "message": "Coordinador de dormitorios no configurado ni resoluble" }` |
| Error interno | 500 | `{ "message": "Error generando dashboard" }` |

### GET /admin/reporte?desde=YYYY-MM-DD&hasta=YYYY-MM-DD

Salidas valoradas (`Aprobada`/`Rechazada`) de tipos **2/3** con `FechaSalida` en el rango
(`hasta` inclusivo; sin params = semana actual). Solo lectura.

```json
// 200
[
  { "idPermiso": 7039, "alumno": "IRVING YAEL PATRICIO GONZALEZ", "matricula": "221068",
    "dormitorio": "H.V.N.U", "tipo": 3, "fechaSalida": "2026-07-24T13:30:00.000Z",
    "fechaRegreso": "2026-07-26T15:00:00.000Z", "autorizadoPor": "TERESA LOPEZ ROSAS",
    "status": "Aprobada" }
]
```

- `autorizadoPor` = nombre de quien dio la valoración final (`Authorize` → `LoginUniPass` por
  matrícula); `""` si el permiso no tiene cadena de autorización registrada.
- `dormitorio` = `Bedroom.Nombre` del alumno (fallback `Dormitorio <n>`).
- Sin resultados → `200 []`.

### GET /admin/observaciones?desde=YYYY-MM-DD&hasta=YYYY-MM-DD

Observaciones **no vacías** de checadores (una por check) con `FechaCheck` en el rango. El
placeholder `'Ninguna'` se trata como vacío y se excluye. Solo lectura.

```json
// 200
[
  { "idCheck": 2037, "idPermiso": 4031, "alumno": "IRVING YAEL PATRICIO GONZALEZ",
    "dormitorio": "H.V.N.U", "paso": "Salida dormitorio", "checador": "IRVING YAEL PATRICIO GONZALEZ",
    "fecha": "2026-07-20T23:57:19.130Z", "observacion": "salió antes de su hora" }
]
```

- `paso` ∈ {`Salida dormitorio`, `Salida caseta`, `Retorno caseta`, `Retorno dormitorio`} (derivado de
  `Accion` + `NombrePunto`).
- `checador` = nombre resuelto desde `CheckPoints.ConfirmadoPor`; `""` si el check no fue confirmado.
- La observación se almacena **por check** (columna en cada fila de `CheckPoints`), no se comparte ni
  sobreescribe entre los 4 pasos de un permiso.
- Sin resultados → `200 []`.

**Error de rango (ambos endpoints):** `400 { "message": "Rango invalido: desde y hasta en formato
YYYY-MM-DD, desde <= hasta" }` (formato inválido, falta uno de los dos, o `desde > hasta`).

---

## 6. Dormitorios, puntos, cargos

### GET /dormitorio/:Sexo/:NivelAcademico

Registro de `Bedroom` para asignar dormitorio al registrarse (ej. `/dormitorio/F/Universidad`).
**200**: objeto `Bedroom` o body vacío si no hay match (no devuelve 404).

### GET /getPoints/:Id

`:Id` = `IdExit` (tipo de salida). **200**: `[ { "IdPoint": 3, "NombrePunto": "Dormitorio", "IdExit": 2, ... } ]`.
Base para crear los 4 `CheckPoints` del permiso.

### Position (suplencias)

| Endpoint | Request | Respuesta |
|---|---|---|
| `POST /createPosition` | `{ "MatriculaEncargado": "100200", "ClassUser": "PRECEPTOR", "Asignado": "230500" }` | **201** `{ message, data: <fila Position> }` — se crea con `Activo: 0` |
| `PUT /activarCargo/:Id` (`:Id`=IdCargo) | `{ "Activo": 1 }` (número, si no → 400) | **200** `{ message }` / **404** |
| `GET /InfoCargo/:Id` (`:Id`=matrícula del suplente) | — | JOIN `LoginUniPass`+`Position`; `null` si no tiene cargo |
| `GET /InfoDelegado/:Id` (`:Id`=matrícula del encargado) | — | Array de sus delegaciones; `null` si no hay |

Mientras `Activo = 1`, el suplente recibe los sockets/push del encargado y `GET /VerToken` devuelve su token FCM.

---

## 7. Documentos / expediente

Subida: `multipart/form-data`, campo de archivo **`Archivo`**. Tipos: jpg/jpeg/png/pdf (otros se
descartan en silencio → el endpoint responde `400 Archivo no cargado`). Máx 50 MB. Se guardan en
`public/uploads/<timestamp>.<ext>` y se sirven en `GET /uploads/<archivo>`.

### POST /doctosMul

Form fields: `Archivo` (file), `IdDocumento` (int, tipo de documento del catálogo), `IdLogin` (int).

```json
// 200 — upsert: si ya existía ese documento, lo reemplaza y limpia el rechazo previo
{ "Id": 512, "IdDocumento": 2, "Archivo": "/uploads/1752868000123.pdf",
  "StatusDoctos": "Adjunto", "IdLogin": 1 }
```

Si la BD falla después de subir el archivo, el archivo se borra (rollback en disco).

### PUT /doctosMul/updateProfile

Mismos fields que el POST. Reemplaza el archivo (borra el viejo del disco), resetea
`StatusRevision = 'Pendiente'` y limpia campos de rechazo. **200**: registro actualizado.

### Consulta

| Endpoint | Respuesta 200 |
|---|---|
| `GET /doctosProfile/:id?IdDocumento=1` | `{ "Archivo": "/uploads/....png" }` (solo la ruta; se usa para foto de perfil) |
| `GET /doctos/:Id` | Array por documento: `IdDoctos, IdLogin, IdDocumento, Archivo, StatusDoctos, StatusRevision, MotivoRechazo, ComentarioRechazo, FechaRechazo, TipoDocumento, RechazadoPor` (nombre completo del preceptor) |
| `GET /getExpediente/:IdDormi` | `[ { "Matricula", "Nombre", "Apellidos" } ]` — alumnos con expediente del dormitorio (`5` = todos los dormitorios 1–4). ⚠️ error responde HTTP `580` (typo de 500) |
| `GET /getArchivos/:Dormitorio/:Nombre?/:Apellidos?/:Matricula?` | Archivos del alumno. Con `Dormitorio=5` filtra **solo** por `Matricula`; con dormitorio real filtra por nombre/apellidos exactos. ⚠️ SELECT * |

### Revisión

| Endpoint | Request | Efecto |
|---|---|---|
| `PUT /statusRevision/:Id` (`:Id`=IdLogin) | `{ "IdDocumento": 2 }` | `StatusRevision = 'Aprobado'` → `{ message }` |
| `DELETE /doctosMul/:Id` (`:Id`=IdLogin) | `{ "IdDocumento": 2 }` | Borra registro + archivo físico → `{ "message": "DATO ELIMINADO" }` |

### PUT /doctosMul/reject/:Id

`:Id` = IdLogin del alumno.

```json
// Request (Comentario opcional)
{ "IdDocumento": 2, "Motivo": "Documento ilegible", "Comentario": "Vuelve a escanearlo",
  "MatriculaPreceptor": "100200" }
// 200
{ "message": "Documento rechazado" }
```

Valida que `MatriculaPreceptor` exista y sea `PRECEPTOR`/`EMPLEADO`/`VIGILANCIA` (**403** si no).
Marca `StatusRevision='Rechazado'` + motivo/comentario/quién/cuándo. Después de responder:
emite socket `document_rejected` **y** push FCM al alumno (si el token FCM es inválido, lo limpia de BD).
**400** si falta `IdDocumento`, `Motivo` o `MatriculaPreceptor`.

---

## 8. Referencia rápida de errores por código

| `code` | HTTP | Endpoint(s) |
|---|---|---|
| `TOKEN_EXPIRED` / `TOKEN_INVALID` | 401 | Cualquier 🔒 |
| `NOT_AUTHENTICATED` / `FORBIDDEN_ROLE` | 401 / 403 | Rutas con `requireRole` (checkerGrant) |
| `MISSING_REFRESH_TOKEN` | 400 | `/refresh-token`, `/logout` |
| `INVALID_REFRESH_TOKEN` / `REFRESH_REUSE_DETECTED` / `REFRESH_EXPIRED` / `USER_NOT_FOUND` | 401 | `/refresh-token` |
| `DEPARTAMENTO_RETIRED` | 400 | `/register` |
| `MISSING_FIELDS` / `INVALID_SCOPE` / `INVALID_VIGENCIA` / `MISSING_FECHA_EXPIRA` | 400 | `POST /checkerGrant` |
| `INVALID_ACTIVO` | 400 | `PUT /checkerGrant/:idGrant` |
| `GRANT_NOT_FOUND` | 404 | `PUT`/`DELETE /checkerGrant/:idGrant` |
| `GRANT_UPDATED` / `GRANT_REVOKED` | 200 | Éxito de `PUT`/`DELETE /checkerGrant/:idGrant` |
| `CHECK_NOT_FOUND` | 404 | `PUT /checks/:id` |
| `NOT_AUTHORIZED_CHECKER` | 403 | `PUT /checks/:id` |
| `CHECK_OUT_OF_ORDER` | 409 | `PUT /checks/:id` |
| `SERVER_ERROR` | 500 | checkerGrant y buscarPersona |
