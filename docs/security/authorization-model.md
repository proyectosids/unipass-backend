# UniPass — Modelo de autorización

> **Estado: FASE A+B (análisis/diseño) + FASE C (infra + piloto) IMPLEMENTADAS.**
> - FASE A (análisis del modelo actual) y FASE B (diseño) — abajo.
> - **FASE C implementada (2026-08-30):** ver sección **"FASE C — IMPLEMENTADO"** al final.
>   Tabla nueva `CapabilityGrant`, catálogo de permisos, `requirePermission`/`validateScope`,
>   auditoría `AuditLog`, `permissions[]` aditivo en `/getCapabilities`, y **piloto `/admin/*`**
>   migrado al nuevo modelo. El resto de endpoints sigue en autorización legacy.
> - **Decisión clave:** las capabilities se guardan en **`CapabilityGrant`** (tabla genérica),
>   NO extendiendo `CheckerGrant`.
> No mezcla password legacy, 7.4B, revisión documental ni BOLA de lecturas.

---

# FASE A — Análisis del modelo ACTUAL

## A.1 Cómo se autoriza hoy
Tres middlewares, en `src/Middleware/`:
- **`verifyToken`** — exige `Authorization: Bearer`; pone `req.user = { id, matricula, nombre, apellidos, tipo, dormitorio }` (payload del JWT).
- **`requireRole(...roles)`** — compara `req.user.tipo` (TipoUser) contra una lista. Usado solo en `/checkerGrant*` (`PRECEPTOR`,`VIGILANCIA`).
- **`requireCapability([...])`** — reúne las **capabilities efectivas** y exige que tenga alguna:
  - **derivada del rol**: `TipoUser==='ADMINISTRATIVO'` → `ADMIN` (regla implícita, ⚠️ punto A.5).
  - **otorgadas**: `findCapabilitiesByLogin` lee `CheckerGrant` vigente → `CHECKER` / `SUPERVISOR`.
- **`requireOwnership(resolveOwnerId)`** — compara el dueño del recurso contra `req.user.id` (identidad del token). Usado en `PUT /permission/:Id` (cancelar).

**No hay** concepto de "permiso concreto" ni de "scope" explícito; la autorización es
"¿tiene esta capability/rol?" y en un caso "¿es el dueño?".

## A.2 Almacenamiento de capabilities — tabla `CheckerGrant`
Columnas: `IdGrant, IdLogin, IdPoint(legado), Scope('SALIDA'|'RETORNO'|'AMBOS'), AsignadoPor,
Activo, Vigencia('TEMPORAL'|'PERMANENTE'), FechaExpira, FechaCreacion, Tipo('Dormitorio'|'Caseta'|NULL),
IdDormitorio, Capability('CHECKER'|'SUPERVISOR')`. Unicidad `(IdLogin, Tipo, IdDormitorio)`.
- `CHECKER`: `Tipo`+`IdDormitorio`+`Scope` definen su alcance (ya es un "scope" de facto).
- `SUPERVISOR`: `Tipo=NULL`, `IdDormitorio=NULL`, `Scope='AMBOS'` (relleno) → global, solo lectura.

**Datos actuales (BD real):** 3 CHECKER activos, 1 SUPERVISOR activo, 2 CHECKER inactivos.

## A.3 Roles/capabilities existentes hoy
| Nombre | Dónde vive | Efecto |
|---|---|---|
| `ADMIN` | derivado de `TipoUser='ADMINISTRATIVO'` | pasa `requireCapability(['ADMIN'])`: `/admin/*`, `/supervisorGrant*`, `DELETE /permission/:Id` |
| `SUPERVISOR` | `CheckerGrant.Capability` | solo lectura `/admin/*` |
| `CHECKER` | `CheckerGrant.Capability` (por Tipo/dorm/scope) | confirmar checks (`PUT /checks/:id`) |
| roles `PRECEPTOR`/`VIGILANCIA` (TipoUser) | `requireRole` | gestionar grants CHECKER |

## A.4 `getCapabilities` / respuesta que consume Flutter
`/login`, `/verifyToken`, `/getCapabilities` devuelven `capabilities: [...]` con la forma:
- `{ type:'CHECKER', pointType, idDormitorio?, scope }`
- `{ type:'SUPERVISOR' }`
Flutter usa esto para decidir qué pestañas/pantallas mostrar. **Cualquier cambio debe ser
aditivo** (no romper estas claves).

## A.5 Dependencia `ADMINISTRATIVO → ADMIN` (crítica de documentar)
- **Única línea:** `src/Middleware/requireCapability.js` → `if (req.user.tipo === 'ADMINISTRATIVO') efectivas.add('ADMIN')`.
- **Endpoints que dependen de que el coordinador (ADMINISTRATIVO) sea ADMIN:** `/admin/dashboard`,
  `/admin/reporte`, `/admin/observaciones`, `POST/DELETE /supervisorGrant`, `DELETE /permission/:Id`.
- **Concepto acoplado adicional:** `/autorizadorSalida` y `/admin/*` resuelven al "coordinador de
  dormitorios" con `findCoordinadorActivo()` (busca `TipoUser='ADMINISTRATIVO'`). Es OTRO acoplamiento
  a `ADMINISTRATIVO`, aparte del de capability.
- **Distribución de TipoUser (BD):** 1 ADMINISTRATIVO (Teresa), 21 ALUMNO, 6 EMPLEADO, 4 PRECEPTOR,
  1 VIGILANCIA, 2 DEPARTAMENTO (retirado). → Hoy solo **1 cuenta** obtiene ADMIN por este puente.

## A.6 Estado de `POST /register` (REDISEÑADO — autoregistro público seguro)
Ya **implementado** como flujo público de 3 pasos (ver `docs/security/register-security-contract.md`):
- **Es público** (sin `verifyToken`, sin `requireCapability`). La versión ADMIN-only intermedia se descartó.
- **No concede capabilities.** El alta crea solo **identidad** (fila en `LoginUniPass`); CHECKER/SUPERVISOR/
  ADMIN/SUPERADMIN se otorgan siempre por su vía controlada, nunca por registro.
- **`TipoUser` se determina server-side** desde ULV (`ALUMNO`→`ALUMNO`, `EMPLEADO`→`EMPLEADO`; los subtipos
  elevados NO se autoasignan). El `TipoUser`/`Dormitorio`/datos institucionales del body se **ignoran**.
- **Prueba de identidad:** OTP al correo institucional (verificado server-side) → `registrationToken`
  opaco, ligado a la matrícula, de un solo uso y expiración corta → alta.
- Se conserva del endurecimiento previo: respuesta sin hash, sin TokenCFM/tokens, sin log de contraseña,
  pruebas reutilizables. Flutter solo aporta `Matricula`, `otp` y `Contraseña`.

## A.7 Impacto en Flutter (resumen)
- Consume `capabilities[]` (no debe romperse).
- `/register` sigue siendo su flujo de autoregistro, ahora en 3 pasos (`/register/otp` →
  `/register/verify-otp` → `/register`). Ver contrato en `register-security-contract.md`.
- Los grants CHECKER/SUPERVISOR y el panel admin siguen igual en esta fase.

---

# FASE B — Diseño propuesto

## B.1 Separación conceptual (los 3 niveles)
```
Identidad institucional     Capabilities/roles de seguridad     Permisos concretos
(TipoUser)                  (CHECKER/SUPERVISOR/ADMIN/SUPERADMIN) (USERS_VIEW, ...)
ALUMNO/EMPLEADO/…      →    otorgadas/derivadas            →    resueltas server-side
```
- **TipoUser** = qué es la persona institucionalmente (dato de ULV). **No** decide permisos por sí solo.
- **Capability/rol** = nivel de seguridad UniPass, se **otorga** (no se autoasigna).
- **Permiso concreto** = acción atómica; la capability se **resuelve** a un conjunto de permisos server-side.
- **Scope** = ámbito sobre el que aplica el permiso (SELF/DORMITORIO/GLOBAL).

Regla de oro: la autorización de un endpoint = **`permiso` + `scope`**, ambos derivados de
`token + capabilities(BD) + relaciones institucionales`. Nunca del body/params del cliente.

## B.2 Catálogo de permisos (VIEW/MANAGE por módulo) — estático en código
Se define en `src/security/permissions.js` (constante), **no** como tabla (evita confusión con la
tabla `Permission` de salidas y churn de BD; es un enum fijo del código):
```
USERS_VIEW, USERS_MANAGE
PERMISSIONS_VIEW, PERMISSIONS_MANAGE
DOCUMENTS_VIEW, DOCUMENTS_MANAGE
CHECKS_VIEW, CHECKS_MANAGE
DASHBOARD_VIEW
REPORTS_VIEW
CAPABILITIES_VIEW, CAPABILITIES_MANAGE
AUDIT_VIEW
CONFIG_VIEW, CONFIG_MANAGE
```
> **Nota de granularidad:** para la cadena de autorización (7.4B) probablemente se necesiten
> `PERMISSIONS_APPROVE` / `PERMISSIONS_REJECT` separados de `PERMISSIONS_MANAGE`, porque "aprobar
> como el autorizador asignado" es distinto de "gestionar permisos en general". **Se documenta la
> razón aquí pero NO se agregan todavía** (fuera de alcance de esta fase; se decidirá en 7.4B).

## B.3 Capabilities → permisos (mapping server-side, estático)
```
SUPERVISOR  → USERS_VIEW, PERMISSIONS_VIEW, DOCUMENTS_VIEW, CHECKS_VIEW, DASHBOARD_VIEW, REPORTS_VIEW
              (solo VIEW; NUNCA MANAGE)
ADMIN       → todos los VIEW + USERS_MANAGE, PERMISSIONS_MANAGE, DOCUMENTS_MANAGE, CHECKS_MANAGE,
              CAPABILITIES_VIEW   (NO CAPABILITIES_MANAGE, NO AUDIT_VIEW, NO CONFIG_MANAGE, NO SUPERADMIN)
SUPERADMIN  → TODOS los permisos (VIEW+MANAGE) + CAPABILITIES_MANAGE + AUDIT_VIEW + CONFIG_MANAGE;
              scope GLOBAL; puede abarcar ADMIN/SUPERVISOR/CHECKER.
CHECKER     → CHECKS_VIEW, CHECKS_MANAGE (acotado por Tipo/dorm/scope del grant)
```
Resolución: `resolvePermissions(capabilities) -> Set<permiso>`. Un usuario con varias capabilities
obtiene la **unión** de sus permisos.

## B.4 Scope (SELF / DORMITORIO / GLOBAL)
Se resuelve server-side:
- **SELF** — el recurso pertenece a `req.user.id` (ej. alumno consulta lo suyo).
- **DORMITORIO** — el recurso pertenece al dormitorio del actor (`req.user.dormitorio`), o el actor
  es coordinador (ADMINISTRATIVO dorm 5) → cubre todos. Aplica a PRECEPTOR/reviewers.
- **GLOBAL** — SUPERADMIN (y ADMIN según regla).

Scope por capability (inicial): `ALUMNO`→SELF · `PRECEPTOR`→DORMITORIO · `SUPERVISOR`→según asignación
(hoy global de lectura) · `CHECKER`→su Tipo/dorm del grant · `ADMIN`→según regla admin · `SUPERADMIN`→GLOBAL.

## B.5 Middleware nuevo (reutilizable)
Bajo `src/Middleware/`:
- **`requirePermission('USERS_VIEW')`** — resuelve permisos efectivos (de capabilities) y exige el
  permiso; 401 sin token, 403 sin permiso (`FORBIDDEN_PERMISSION`).
- **`validateScope(resolver, tipoScope)`** — generaliza `requireOwnership`: dado el recurso, verifica
  que caiga en el scope del actor. `resolver(req) -> { ownerIdLogin?, dormitorio? }`. Para SELF compara
  `req.user.id`; para DORMITORIO compara `req.user.dormitorio` (con excepción coordinador); GLOBAL siempre pasa.
- Uso conceptual:
  ```
  GET /users/:id  → verifyToken, requirePermission('USERS_VIEW'),  validateScope(resolveUserDorm)
  PUT /users/:id  → verifyToken, requirePermission('USERS_MANAGE'), validateScope(resolveUserDorm)
  ```
- `requireCapability`/`requireRole`/`requireOwnership` se **conservan** como adaptadores durante la
  migración (compat), y se re-expresan encima del nuevo modelo cuando cada endpoint se migre.

## B.6 SUPERADMIN  (decisión revisada: CapabilityGrant, no CheckerGrant)
- **Se implementa como capability** en la **tabla nueva `CapabilityGrant`** (`Capability='SUPERADMIN',
  ScopeType='GLOBAL', ScopeId=NULL, Activo=1`). No se extiende `CheckerGrant` (evita deuda semántica).
- Scope **GLOBAL**, resuelve a **todos** los permisos.
- **Nunca** es un `TipoUser`; `POST /register` jamás lo acepta ni lo produce.
- **No hay API** para otorgar SUPERADMIN; el primer grant se hace con el script controlado
  `database/scripts/grant_superadmin.sql` (parametrizado, no automático, tras autorización). Un ADMIN
  normal no puede otorgarlo.
- Puede realizar acciones administrativas globales; sus operaciones sensibles se **auditan** (B.9).

## B.7 Aprovisionamiento inicial de SUPERADMIN (punto 9)
- **Migración `012` (a diseñar):** solo **extiende el CHECK** de `Capability` para permitir
  `ADMIN`/`SUPERADMIN`. **NO** otorga SUPERADMIN a nadie.
- **Otorgamiento de la 1ª cuenta:** script/migración **parametrizado y comentado** que inserta un
  grant SUPERADMIN para un `IdLogin` **que tú indiques** (no automático, requiere tu autorización).
- Regla futura (a confirmar): **solo SUPERADMIN** puede otorgar/revocar SUPERADMIN (un ADMIN normal no).

## B.8 Rediseño de `POST /register` (autoregistro público SEGURO) — ✅ IMPLEMENTADO
Flujo **público de 3 pasos** ya implementado. Contrato completo en
`docs/security/register-security-contract.md`. Resumen:
```
1) POST /register/otp        { matricula }        -> 200 genérico (anti-enumeración).
      Envía OTP al correo institucional (ULV) solo si la matrícula existe, tiene correo y NO está registrada.
2) POST /register/verify-otp { matricula, otp }   -> { registrationToken }
      Verifica el OTP SERVER-SIDE contra el proveedor. Token opaco (sha256 en BD), ligado a la matrícula,
      single-use, expiración 10 min. Rate-limit por matrícula (5/10min -> 429).
3) POST /register            { Matricula, Contraseña, registrationToken } -> 201 (identidad creada)
      Valida token (inválido/usado/expirado/mismatch), política de contraseña, unicidad; deriva
      TipoUser+Dormitorio SERVER-SIDE desde ULV; consume token e inserta en una transacción.
```
Reglas aplicadas:
- **TipoUser SERVER-SIDE** desde ULV. `ALUMNO`→`ALUMNO`. Para `EMPLEADO` se resuelve la función con
  endpoints específicos de ULV, precedencia **VIGILANCIA→PRECEPTOR→EMPLEADO** (VIGILANCIA vía
  `/api/datos/vigilancia/:matrícula`, PRECEPTOR vía `/api/datos/prece/:idDepartamento`). **ADMINISTRATIVO
  NO se auto-asigna** (no es dato de ULV y concede ADMIN → manual/controlado). `TipoUser`/`Dormitorio`/
  datos del body se **ignoran** por completo.
- **NUNCA otorga capabilities** (ADMIN/SUPERADMIN/SUPERVISOR/CHECKER). El alta crea solo identidad.
- Se conserva del hardening previo: sin hash en respuesta, sin TokenCFM/tokens, sin log de contraseña,
  pruebas reutilizables (`tests/register.integration.test.js`, `tests/hardening.test.js`).

Esto desacopla: `/register` crea **identidad** (TipoUser desde ULV); las **capabilities** se otorgan
por otros flujos controlados. Impide autoasignarse privilegios (el TipoUser no viene del cliente y no
hay capability en el alta).

Decisiones de dominio resueltas durante la implementación:
- La función del empleado se resuelve por **endpoints institucionales específicos** de ULV, no por
  texto libre (`DEPARTAMENTO`). VIGILANCIA y PRECEPTOR **sí** se auto-derivan cuando ULV confirma que la
  persona es el responsable (jefe de vigilancia / preceptor del depto). **ADMINISTRATIVO NO**: el
  endpoint `/coordinador` es el coordinador de FACULTAD de un ALUMNO (Tipo 4), el coordinador de
  dormitorio no es dato de ULV y concede ADMIN → se provisiona de forma controlada aparte.
- Se añadió `sendVerificationOtp` (proveedor `/api/v1/otp_app`) para el OTP de alta; la verificación
  reutiliza `/api/v1/email_verification/verifyOTP`.

## B.9 Auditoría (punto 10)
**Tabla nueva `AuditLog`** (migración a diseñar):
`Id, FechaHora, ActorIdLogin, ActorMatricula, Capability, Permission, Accion, Recurso, RecursoId,
Resultado('SUCCESS'|'DENIED'|'ERROR'), DatosAntes(NVARCHAR MAX json), DatosDespues(json), Ip,
Endpoint, Metodo, Contexto`. Servicio `audit.log({...})` best-effort (un fallo de auditoría no
tumba la operación, pero se loguea). **Nunca** guarda contraseñas/hashes, access/refresh tokens, OTP,
resetToken ni secretos. Se registran acciones administrativas sensibles (MANAGE, CAPABILITIES_MANAGE,
CONFIG_MANAGE, acciones de SUPERADMIN).

## B.10 Compatibilidad y migración (punto 14)
- **Capabilities existentes siguen funcionando**: CHECKER/SUPERVISOR se resuelven a permisos con el
  nuevo mapping; `requireCapability(['ADMIN','SUPERVISOR'])` de hoy sigue válido (compat) hasta migrar
  cada endpoint a `requirePermission`.
- **`getCapabilities`**: se mantiene la forma actual; **aditivamente** se puede incluir
  `permissions: [...]` resuelto, para que Flutter maneje UI por permiso sin conocer la estructura interna.
- **Puente `ADMINISTRATIVO→ADMIN`**: se **conserva** (el coordinador depende de él) pero queda marcado
  como **transitorio/legacy**. Meta: otorgar `ADMIN` explícito por `CheckerGrant` a los coordinadores y
  luego **retirar** la línea implícita. `TipoUser ADMINISTRATIVO` (identidad) y capability `ADMIN`
  (seguridad) quedarán **desacoplados**. (El uso de `findCoordinadorActivo` por `TipoUser='ADMINISTRATIVO'`
  para resolver al coordinador de dormitorios es un tema SEPARADO y no cambia aquí.)

## B.11 View As (punto 11) — solo diseño, NO se implementa
Arquitectura preparada: el contexto de autorización distingue **`actorReal`** (siempre el del token)
de **`effectiveRole`** (rol "visto como"). Un SUPERADMIN podría fijar `effectiveRole` para inspeccionar
la app como ALUMNO/PRECEPTOR/etc., pero **toda acción sigue atribuida a `actorReal`** (auditoría con el
SUPERADMIN real). No se reemplaza la identidad. **No implementar** salvo que se requiera.

---

# FASE C — IMPLEMENTADO (2026-08-30)

## Migraciones (aplicadas, idempotentes)
1. **`011_capability_grant.sql`** — tabla **`CapabilityGrant`** (`IdGrant, IdLogin, Capability
   ∈{CHECKER,SUPERVISOR,ADMIN,SUPERADMIN}, ScopeType ∈{SELF,DORMITORIO,GLOBAL}, ScopeId, Activo,
   GrantedBy, CreatedAt, RevokedAt`) + índice + **copia idempotente** de los grants CHECKER/SUPERVISOR
   activos desde `CheckerGrant`. Rollback: `DROP TABLE UNIPASS.CapabilityGrant;` (no toca CheckerGrant).
   Datos afectados: inserta 4 grants (3 CHECKER, 1 SUPERVISOR) reflejando los activos actuales.
2. **`012_audit_log.sql`** — tabla **`AuditLog`**. Rollback: `DROP TABLE UNIPASS.AuditLog;`. Sin datos afectados.
3. **`database/scripts/grant_superadmin.sql`** — otorgar SUPERADMIN a un `IdLogin` indicado.
   **NO ejecutado** (parametrizado, requiere autorización; con `@IdLogin=NULL` no hace nada).

## Código nuevo
- `src/security/permissions.js` — catálogo `PERMISSIONS`, `SCOPES`, `CAPABILITY_PERMISSIONS`, `resolvePermissions`.
- `src/repositories/capabilityGrant.repo.js` — único lugar que conoce la tabla física.
- `src/services/capability.service.js` — `getCapabilitiesForUser`, `hasCapability`, `getScopesForUser`,
  `getPermissionsForUser`, `scopeCovers`. Incluye el **puente transitorio ADMINISTRATIVO→ADMIN (GLOBAL)**.
- `src/Middleware/requirePermission.js` (403 `FORBIDDEN_PERMISSION`), `src/Middleware/validateScope.js`
  + `requireGlobalScope` (403 `FORBIDDEN_SCOPE`).
- `src/repositories/audit.repo.js` + `src/services/audit.service.js` (`logAudit`, filtra secretos).

## Código modificado
- `src/routes/admin.routes.js` — **piloto**: `/admin/*` pasa de `requireCapability(['ADMIN','SUPERVISOR'])`
  a `verifyToken → requirePermission(DASHBOARD_VIEW|REPORTS_VIEW) → requireGlobalScope()`. **Comportamiento
  equivalente** (ADMIN/SUPERVISOR/SUPERADMIN con lectura global pasan; el resto 403).
- `src/controllers/checkerGrant.controller.js` — `/getCapabilities` añade **`permissions[]`** de forma
  aditiva; `capabilities[]` **sin cambios** (Flutter no necesita cambios).

## Endpoints migrados al nuevo modelo
- ✅ `GET /admin/dashboard` → `DASHBOARD_VIEW` + scope GLOBAL.
- ✅ `GET /admin/reporte`, `GET /admin/observaciones` → `REPORTS_VIEW` + scope GLOBAL.
- Todo lo demás sigue en **autorización legacy** (`requireCapability`/`requireRole`/`requireOwnership`/abierto).

## Compatibilidad verificada (tests)
- `capabilities[]` intacto; `permissions[]` aditivo. `PUT /checks/:id` sigue usando `CheckerGrant` (sin cambios).
- Grants CHECKER/SUPERVISOR actuales siguen funcionando vía `CapabilityGrant`.

---

# Riesgos / deuda técnica
- Reusar `CheckerGrant` para ADMIN/SUPERADMIN mezcla "capability de checador" con "rol de seguridad";
  aceptable a corto plazo (misma maquinaria), a futuro podría separarse en su propia tabla `Grant`.
- El puente `ADMINISTRATIVO→ADMIN` sigue vivo (transitorio) → documentado, a retirar tras otorgar ADMIN explícito.
- `/register` depende de ULV: si ULV cae, el autoregistro falla (igual que Pueblo). Aceptable.
- Scope DORMITORIO para reviewers depende de la regla "dorm 5 = global" ya usada en dashboards.

# Cambio de contraseña — mecanismos soportados (P0 cerrado)

- **`PUT /password/:Correo` → RETIRED / REMOVED.** Se eliminó la ruta, el controlador (`putPassword`) y
  su función de repositorio (`updateUserPassword` por Correo). Ya **no existe** ningún camino
  `correo arbitrario → nueva contraseña`. Llamarlo responde **404** (ruta inexistente); **no** se
  sustituyó por `verifyToken` (el diseño correcto ya existe abajo).
- **El `Correo` (o `IdLogin`) enviado por el cliente NUNCA constituye autorización** para cambiar una
  contraseña. La identidad del cambio autenticado sale de `req.user` (token); la de la recuperación,
  del `resetToken` ligado server-side a un `IdLogin`.

Mecanismos soportados:
1. **Usuario autenticado — `PUT /me/password`** (`verifyToken`). Identidad = `req.user.id`; exige la
   contraseña actual (`VerifyHashData`) + política; escribe por `IdLogin` (`updateUserPasswordById`).
2. **Recuperación** (sin sesión): `POST /password/forgot` (matrícula → OTP, respuesta genérica) →
   `POST /password/verify-otp` (OTP server-side → `resetToken` opaco ligado al `IdLogin`) →
   `POST /password/reset` (`resetToken` válido/no usado/no expirado → cambia por `IdLogin`, atómico,
   revoca refresh tokens). El `resetToken` no admite seleccionar otra identidad.

# Cadena de autorización de permisos — Task 7.4B, Commit A (resolución segura)

Resuelve `PUT /autorizarPermission/:Id` (`:Id` = IdPermission). **Requiere `verifyToken`.**

- **Actor = token, nunca el body.** La matrícula del actor se resuelve server-side
  (`req.user.id → LoginUniPass.Matricula`). El `IdEmpleado` del body se **ignora**. Body válido:
  `{ "StatusAuthorize": "Aprobada" | "Rechazada" }`.
- **Correspondencia de fila = autorización.** El actor solo puede resolver la fila `Authorize` cuyo
  `IdEmpleado == su matrícula`. Si no existe esa fila → `403 NOT_AUTHORIZER`. **No** hay bypass por
  capability/rol (ADMIN override queda para Fase 3).
- **Máquina de estados (Authorize):** solo `Pendiente → Aprobada` y `Pendiente → Rechazada`. Cualquier
  otra (re-aprobar, `Rechazada→Aprobada`, etc.) → `409 INVALID_TRANSITION`. Si el `Permission` ya está
  finalizado/cancelado → `409 PERMISSION_NOT_PENDING`.
- **Orden estricto:** el eslabón `N` solo se resuelve si todos los previos están `Aprobada`; si no →
  `409 ORDER_NOT_READY`. El orden real es **`IdAuthorize` ascendente** (inserción Jefe→Preceptor); la
  columna `Authorize.Orden` es **no fiable** (DEFAULT 1; `createPermissionWithChainTx` no la puebla) →
  Commit B la corregirá. En Pueblo: Jefe (orden 1) → Preceptor (orden 2); el Preceptor no puede aprobar antes.
- **Estado global calculado por Backend** (nunca por el cliente): alguna requerida `Rechazada` →
  `Permission=Rechazada`; todas `Aprobada` → `Aprobada`; si queda alguna `Pendiente` → `Pendiente`.
- **Atomicidad:** cargar Permission (lock) → validar → actualizar `Authorize` → recalcular global →
  actualizar `Permission` → `AuditLog`, **todo en una transacción** (`resolveAuthorizeLinkTx`). Cualquier
  error → `ROLLBACK` (nunca `Authorize=Aprobada` con `Permission` desincronizada).
- **AuditLog** (en la misma tx): `ActorIdLogin`/`ActorMatricula` del token, acción
  `PERMISSION_AUTHORIZE_APPROVE|REJECT`, `RecursoId=IdPermission`, `DatosAntes/Despues` con estados de
  `Authorize` y `Permission`. El actor **nunca** viene del cliente.

**`PUT /permissionValorado/:Id` → RETIRED / REMOVED** (ruta + `autorizarPermiso` + repo
`updatePermissionStatus`). El cliente ya **no** puede fijar `Permission.StatusPermission`; llamarlo → 404.
Un eventual cierre administrativo se diseñará aparte (ruta + permiso explícito + AuditLog).

## Creación de la cadena — Commit B (server-side)

`POST /permission` (requiere `verifyToken`; `IdUser = req.user.id`, Task 7.2) crea Permission **y** la
cadena `Authorize` de forma **atómica y server-side**. El cliente **no** decide autorizador ni estado.

| Tipo | Autorizador(es) | Fuente | Orden |
|---|---|---|---|
| 1 Pueblo | Jefe de trabajo → Preceptor | `resolvePuebloChain` (ULV: JefeDepto + prece) | 1, 2 (dedupe → 1 fila `DualRole=1`) |
| 2 Especial | único (Coordinador **o** Preceptor) | `resolverAutorizadorSalida` (switch `AUTORIZADOR_SALIDAS`) | 1 |
| 3 A Casa | único (igual que 2) | `resolverAutorizadorSalida` | 1 |
| 4 Fin de curso | **no definido** | — | **BLOQUEADO** |

- **Toda fila nace `StatusAuthorize='Pendiente'`; `Permission.StatusPermission='Pendiente'`.** El body no
  puede fijar estado ni autorizador (`IdEmpleado`/`NoDepto`/`StatusAuthorize`/`StatusPermission`/`IdUser`
  se ignoran).
- **Atomicidad:** si no se puede resolver un autorizador requerido, o el autorizador no tiene cuenta
  UniPass activa → `409` y **no** se crea Permission (sin huérfanos). Todo en una transacción.
- **`Orden` ahora se persiste** (autoritativo). Cadenas **históricas** con `Orden=1,1` (mal pobladas por
  el código anterior) se resuelven con **fallback determinista `IdAuthorize` ascendente** en
  `resolveAuthorizeLinkTx` (clave de orden por permiso: `Orden` si es distinguible; si hay duplicados → `IdAuthorize`).
- **`POST /authorize` → RETIRED / REMOVED** (ruta + controlador + repo `createAuthorize`). La creación de
  filas `Authorize` es **operación interna** del backend; llamarlo → 404.
- **Tipo 4 bloqueado:** `POST /permission` con `IdTipoSalida=4` → `501 SALIDA_TIPO_NO_DISPONIBLE` (sin
  flujo certificable: `/api/datos/coordinador/:matricula` es el coordinador de FACULTAD del alumno, no
  está definido como autorizador ni hay regla en código/BD; existe 1 permiso Tipo 4 histórico **sin
  cadena**). No se inventó lógica; queda pendiente de definición.
- **`GET /autorizadorSalida`:** se **conserva** (solo lectura), pero su función de seguridad ya es
  redundante (el backend resuelve el autorizador internamente). Frontend debería dejar de usarlo para crear permisos.

## Estado final — Task 7.4B = CLOSED (security model)

**La cadena de autorización queda cerrada técnicamente en seguridad.** Frontend migró (commit `20921f9`).

| Componente | Estado |
|---|---|
| Backend resolución segura (`PUT /autorizarPermission/:Id`, Commit `2a8db09`) | **CLOSED** |
| Backend creación de cadena server-side (tipos 1/2/3, Commit `0efbd3e`) | **CLOSED** |
| Gate `POST /permission` solo `ALUMNO` (Commit `c7a0e4f`) | **CLOSED** |
| `POST /authorize` | **RETIRED** (404) |
| `PUT /permissionValorado/:Id` | **RETIRED** (404) |
| Flutter migrado | commit `20921f9` |
| Backend tests | **158/158** |
| Flutter tests | **124/124** |
| E2E real | **pendiente como deployment gate**, no como código pendiente |
| Tipo 4 (Fin de curso) | **bloqueado/documentado** (`501`), fuera del cierre de tipos soportados 1/2/3 |
| ADMIN override / `PERMISSIONS_APPROVE`/`REJECT` | **fuera de alcance** (Fase 3) |

### Follow-ups documentados (NO forman parte de 7.4B)
- **`FOLLOW_UP_FUNCTIONAL_AUTHORIZATION_PROGRESS_FCM`** — al aprobarse un eslabón, el backend notifica al
  siguiente autorizador **solo por socket** (no FCM). El backend **ya determina** correctamente al
  siguiente autorizador server-side (`findNextPendingEmpleado`) y emite el socket; el faltante afecta
  **entrega offline/UX, no la integridad ni la autorización** de la cadena. → follow-up funcional.
- **Deuda menor:** `findNextPendingEmpleado` ordena por `IdAuthorize ASC` en vez de `Orden`. No afecta la
  seguridad actual (las cadenas nuevas persisten `Orden` e `IdAuthorize` en la misma secuencia y
  `resolveAuthorizeLinkTx` hace el enforcement correcto). Dejar como **cleanup posterior**.
- **Checks creation hardening (tarea aparte de 7.4B):** ✅ **CLOSED** — ver sección siguiente.

# Checks creation hardening = CLOSED

La creación de `CheckPoints` es **system-owned / server-side**. Modelo final:

```text
Authorize final aprobado
        ↓  Backend
Permission → Aprobada
        ↓  (misma transacción, resolveAuthorizeLinkTx)
4 CheckPoints  (SALIDA/Dorm, SALIDA/Caseta, RETORNO/Caseta, RETORNO/Dorm; todos 'Pendiente')
        ↓
Flutter solo refresca
```

- **`POST /checks` → RETIRED / REMOVED (404).** Se eliminó la ruta, el controlador `createChecksPermission`
  y el repo `createCheckPoint`. **Ninguna API pública** puede insertar `CheckPoints`.
- **Creación autoritativa:** `ensureCheckPointsTx` dentro de `resolveAuthorizeLinkTx`, SOLO en la
  transición real `Permission: Pendiente → Aprobada` (no en reintentos ni cadenas ya resueltas). Points
  resueltos por catálogo (`Point.IdExit = IdTipoSalida`); catálogo incompleto →
  `CHECKPOINT_CONFIGURATION_INCOMPLETE` + **ROLLBACK** (nunca Permission=Aprobada sin sus 4 checks).
- **Idempotencia:** `UNIQUE(IdPermission, IdPoint, Accion)` (migración `014`) — clave natural correcta
  (cada Point aparece en SALIDA y RETORNO). Verificación histórica: 31 aprobados, todos con 4 checks, 0 duplicados.
- **Commits:** Backend C1 `b1c7190` (auto-creación + UNIQUE + puente idempotente); Frontend migración
  `4be285b` (0 consumidores de `POST /checks`); Backend C2 (este) `POST /checks → 404`.
- **E2E real:** pendiente como **deployment gate** (no como código pendiente).

Fuera de este cierre (tareas separadas, sin tocar): GET `checks*` anónimos, `GET /getPoints`, BOLA/IDOR,
`PUT /checks/:id`, CheckerGrant, scopes, FCM, ADMIN/SUPERADMIN.

# Task 7.3 — Revisión documental, D1-A (contención crítica de ESCRITURAS)

Cierra las escrituras documentales **anónimas** y la **impersonación** del revisor.

```text
ANTES:  Flutter decide identidad/scope → PUT anónimo → Backend confía (RechazadoPor = matrícula del body)
DESPUÉS: Bearer → PRECEPTOR → actor server-side → scope de dormitorio server-side → state machine →
         transacción → AuditLog → notificaciones post-commit
```

- **`PUT /statusRevision/:Id` → RETIRED / 404** (aprobación anónima, 0 consumidores Flutter; **no** hay
  operación pública de APROBAR — Flutter solo rechaza).
- **`PUT /documents/:idDoctos/reject`** (nuevo, Bearer): actor = token; **solo `TipoUser='PRECEPTOR'`**
  (403 `FORBIDDEN_DOCUMENT_REVIEWER`); **scope** = `Dormitorio` del preceptor == del alumno dueño, ambos
  server-side (403 `FORBIDDEN_DOCUMENT_SCOPE`); **máquina de estados** solo `Pendiente → Rechazado`
  (409 `INVALID_DOCUMENT_TRANSITION`, con guard en el `WHERE`); `RechazadoPor` = matrícula **del token**;
  `AuditLog` (`DOCUMENT_REJECT`) en la misma transacción; `404 DOCUMENT_NOT_FOUND`. Body: `{ motivo, comentario? }`.
- **`PUT /doctosMul/reject/:Id`** — LEGADO **CONTENIDO** (DEPRECATED — REMOVE D1-C): ahora Bearer + la
  MISMA lógica segura; el `MatriculaPreceptor` del body se **ignora**. Puente hasta migrar Flutter.
- **`PUT /Documentacion/:Matricula`** — CONTENIDO (DEPRECATED — REMOVE D1-C): Bearer; **ignora** `:Matricula`
  y `StatusDoc`; devuelve el `Documentacion` **propio** (SELF) sin escritura arbitraria de 0/1.
- **Notificaciones:** post-commit best-effort (socket `document_rejected` + FCM), destinatario y `TokenCFM`
  resueltos server-side desde `Doctos.IdLogin`; reutilizadas por el endpoint nuevo y el legado.
- **SELF (Task 7.2) intactos:** `POST /doctosMul`, `PUT /doctosMul/updateProfile`, `DELETE /doctosMul/:Id`
  (ownership por `req.user.id`). El re-upload `Rechazado → Pendiente` ya lo hace `createDocument` (upsert
  por `(IdLogin, IdDocumento)`, limpia Motivo/Comentario/RechazadoPor/FechaRechazo; sin duplicados — 0 históricos).
- **Capability:** ya existe `DOCUMENTS_VIEW/MANAGE`; **no se creó** ninguna. El revisor normal se autoriza
  por **rol PRECEPTOR + scope de dormitorio**, no por capability.
- **`Documentacion` = presencia/completitud de uploads** bajo la semántica actual — **NO** "documentos aprobados".

## Task 7.3 — D1-A.2: `Documentacion` server-computed + gate en POST /permission

Fuente de verdad server-side de la completitud documental (regla extraída del Flutter en D1-B):

```text
NivelAcademico + Sexo  (DB: Bedroom.NivelDormitorio via Dormitorio + LoginUniPass.Sexo)
      ↓ reglamento requerido
UNIVERSITARIO+M→1 · NIVEL MEDIO(=Bachiller)+M→2 · UNIVERSITARIO+F→3 · NIVEL MEDIO+F→4
      + 5 (Convenio de salidas) + 7 (INE del Tutor)     (6 Imagen Perfil NO cuenta)
      ↓
documentationComplete = todos los requeridos PRESENTES  AND  ninguno StatusRevision='Rechazado'
      (Pendiente y Aprobado cuentan como válidos; Aprobado NO es requerido)
```

- **Helpers (`doctos.repo`):** `resolveRequiredDocumentIds` (matriz, en `util/documentRequirements.js`),
  `evaluateDocumentation(idLogin)` (lectura, autoridad del gate), `recalcDocumentacionInTx(tx,idLogin)`
  (persiste `Documentacion` 0/1 en la misma tx de la mutación), `recalculateDocumentationStatus(idLogin)`.
- **`LoginUniPass.Documentacion` = proyección/cache** de `documentationComplete`. **NO es autoridad**: el
  gate y la evaluación usan la fuente real. Un valor stale (0/1) no altera la decisión.
- **Recálculo atómico** en cada mutación que pueda cambiar completitud, en la MISMA transacción:
  `POST /doctosMul` (upsert), `DELETE /doctosMul` (delete), `DOCUMENT_REJECT` (rechazo de requerido → 0).
  El re-upload `Rechazado→Pendiente` recalcula → puede volver a 1.
- **Gate obligatorio en `POST /permission`** (server-side, tras el gate ALUMNO, antes de crear nada):
  `evaluateDocumentation(req.user.id)`. Incompleta → **`409 DOCUMENTATION_INCOMPLETE`** (con `missing`/
  `rejected`); reglamento no resoluble → **`409 DOCUMENT_REQUIREMENTS_UNRESOLVED`**. **No** se crea
  Permission/Authorize/CheckPoints. El body no evade; **la columna `Documentacion` stale tampoco** (se
  evalúa la fuente real). Idempotencia de `POST /permission` intacta.
- **`FOLLOW_UP_BUSINESS_RULE_REJECTED_DOCUMENT_BLOCKS_EXIT` = RESUELTO** (evidencia Frontend `menu_student`):
  **sí, un requerido `Rechazado` bloquea la completitud** para Salidas.
- **Barrido de reads de `Documentacion` (§14):** el único read es la proyección segura (`GET /me` + login) →
  **informativo/UI, NO controla autorización**. Ningún control de seguridad depende de la columna.
- **Dry-run (21 alumnos):** completos 3, incompletos 15, no-resolubles 3 (dorm null/5/6), la columna
  contradecía la evaluación en 1. **No se hizo backfill** (el gate usa la evaluación viva; el recálculo
  forward mantiene la cache; los 3 no-resolubles son anomalías de dato a revisar antes de normalizar).

## Task 7.3 — D1-C2: retiro definitivo de bridges de ESCRITURA → `Task 7.3 D1 WRITES SECURITY = CLOSED ✅`

Frontend migró (D1-C1, `0eca9c4`, 0 consumidores de los legados). Se eliminan los puentes.

- **RETIRADOS → 404** (con o sin Bearer): `PUT /Documentacion/:Matricula`, `PUT /doctosMul/reject/:Id`,
  `PUT /statusRevision/:Id` (este ya en D1-A). Eliminados sus controladores + `updateDocumentacion` (repo).
- **Superficie WRITE documental final (0 escrituras anónimas):**
  - SELF alumno: `POST /doctosMul`, `PUT /doctosMul/updateProfile`, `DELETE /doctosMul/:Id` (Bearer + ownership token).
  - REVIEW preceptor: `PUT /documents/:idDoctos/reject` (Bearer + PRECEPTOR + scope de dormitorio + state machine + AuditLog + FCM/socket post-commit).
- **`LoginUniPass.Documentacion`** solo se escribe server-side (`recalcDocumentacionInTx`); ningún endpoint
  acepta `Documentacion`/`StatusDoc` del cliente. La columna y los helpers de evaluación se conservan.

```text
Alumno upload/delete → mutación documental → recalc Documentacion (server-side)
Preceptor reject → Bearer + PRECEPTOR + scope server-side → Pendiente→Rechazado → recalc → AuditLog → FCM/socket post-commit
```

**Estado: `Task 7.3 D1 WRITES SECURITY = CLOSED ✅`** (0 escrituras anónimas; bridges retirados;
Documentacion solo server-computed; gate server-side en `POST /permission`). **Task 7.3 = NOT CLOSED**
(pendiente **D2 — lecturas documentales** `GET /doctos`/`/doctosProfile`/`/getExpediente`/`/getArchivos`).

### Follow-ups
- **Backfill de `Documentacion`** (cache sync): opcional, **no** ejecutado (3 dorms no-resolubles: null/5/6
  — data-quality gate separado, no normalizar sin regla institucional). El gate usa la evaluación viva.
- **D2 — lecturas documentales** siguen **anónimas**.

# BOLA/IDOR R1 (usuarios/credenciales/tokens) = CLOSED

Cierra la exposición **anónima** de datos de usuario (`LoginUniPass SELECT *` con `Contraseña`/hash y
`TokenCFM`). Modelo final para lectura SELF de usuario:

```text
SELF (Flutter)
   ↓ Bearer
GET /me
   ↓ req.user.id
safe user projection (toSafeUser / findSafeUserById) — NUNCA Contraseña ni TokenCFM
```

- **`GET /me`** (verifyToken): única lectura SELF; identidad del token; proyección segura.
- **RETIRADOS → 404:** `GET /user/:Id`, `GET /userMatricula/:Matricula` (R1-C); `GET /buscarUser/:Nombre`,
  `GET /userChecks/:Email`, `GET /VerToken/:Matricula` (R1-A).
- **`GET /buscarPersona/:Nombre`** (verifyToken + `canGrant`): reemplazo seguro de búsqueda; campos
  seguros + `ExisteEnPosition`; sin `Contraseña`/`TokenCFM`/`Correo`.
- **`TokenCFM`:** solo uso interno/registro del dispositivo propio (`PUT /TokenDispositivo`, resolución
  FCM server-side vía `notificationService`/suplencia `Position`). Nunca serializado por HTTP.
- **`Contraseña`/hash:** nunca serializada en ninguna respuesta (incluido `POST /login`).
- **FCM alumno (R1-C §3):** al aprobar/rechazar un permiso, el backend envía el push al alumno
  server-side (reemplazo del `_notifyStudent` que hacía Flutter con `/VerToken`), post-commit/best-effort,
  resolviendo la matrícula desde `Permission.IdUser`. **Distinto** de
  `FOLLOW_UP_FUNCTIONAL_AUTHORIZATION_PROGRESS_FCM` (push al siguiente autorizador, aún pendiente).
- **Commits:** Backend R1-A `804ae47`, Frontend R1-B `17e9ca5`, Backend R1-C (este). E2E real = deployment gate.

**Pendiente (fases posteriores, NO 7.4B/R1):** BOLA de lecturas de **Permission/Authorize**, **documentos**
(7.3) y **checks reads (R2)** siguen abiertas — ver [[permissions-matrix]]. (`/password/:Correo` legacy y
`/permissionValorado` cliente: **ya retirados**.)

# Task 7.3 — D2-A: contención BOLA/IDOR de LECTURAS documentales → `D2-A Backend read containment = DONE` (Task 7.3 NOT CLOSED)

Cierra la exposición **anónima** de lecturas documentales. Antes: `GET /doctos/:Id`,
`GET /doctosProfile/:id`, `GET /getExpediente/:IdDormi`, `GET /getArchivos/...` eran **públicos**
(sin token, sin ownership, sin scope) — cualquiera podía enumerar expedientes y fotos por IdLogin/dorm.

## Contratos NUEVOS server-authoritative (Bearer)

```text
SELF alumno        → GET /me/documents                                  (req.user.id; allowlist, sin hash/token)
Revisión preceptor → GET /documents/review/students                     (PRECEPTOR; dorm del token; alumnos {IdLogin,Nombre,Apellidos,Matricula})
                   → GET /documents/review/students/:idLogin/documents  (PRECEPTOR; target ALUMNO de SU dorm; identificado por IdLogin, no por nombre)
Foto de perfil     → GET /users/:idLogin/profile-photo                  (IdDocumento=6 forzado server-side; política SELF/PRECEPTOR(mismo dorm)/CHECKER(grant vigente))
```

- **Dormitorio resuelto server-side** desde el token (`findUserById(req.user.id).Dormitorio`); el cliente
  no lo elige. **No existe vista global `dorm=5`** en estos contratos.
- **Revisor documental = únicamente `TipoUser='PRECEPTOR'`** (misma política que el rechazo D1-A;
  EMPLEADO/VIGILANCIA/ADMINISTRATIVO → `403 FORBIDDEN_DOCUMENT_REVIEWER`).
- **Foto de perfil (política, sin capability nueva):** SELF; o PRECEPTOR del mismo dormitorio; o **CHECKER**
  con **grant vigente** que cubra al target — `CheckerGrant` Tipo `Dormitorio` (del dorm del alumno) o
  `Caseta` (global). Se reutiliza `findActiveGrantByTipo`; **el scope nunca se toma del cliente**. Solo
  sirve `IdDocumento=6` (el cliente no puede pedir otro tipo por esta ruta).
- **Sin `SELECT *` en superficie nueva:** `findReviewStudentsByDorm` (IdLogin/Nombre/Apellidos/Matricula),
  `findProfilePhoto` (IdDoctos/Archivo), `findDocumentsByLogin` (allowlist previa) — 0 reexposición de
  `Contraseña`/`TokenCFM` (no reaparece R1).

## Bridges legacy CONTENIDOS (DEPRECATED — REMOVE en D2-C; aún **no** retirados)

Se conservan por compatibilidad Flutter, pero ahora exigen Bearer + ownership/scope:

- `GET /doctos/:Id` → **SELF-only**: `:Id` debe ser el IdLogin del token, si no `403 FORBIDDEN_OWNERSHIP`.
- `GET /doctosProfile/:id?IdDocumento=6` → bridge de **foto de perfil**: exige `IdDocumento=6`
  (cualquier otro/ausente → `403 FORBIDDEN_DOCUMENT_SCOPE`); misma política que `/users/:idLogin/profile-photo`.
  Ya **no** puede usarse como lector documental genérico.
- `GET /getExpediente/:IdDormi` y `GET /getArchivos/:Dormitorio/...` → PRECEPTOR; el dorm se **fuerza** al
  del actor; `:IdDormi`/`:Dormitorio` debe coincidir (si no `403 FORBIDDEN_DOCUMENT_SCOPE`) — un preceptor
  de dorm A que pasa `5` o el dorm de B recibe 403 (sin bypass global).
- `GET /doctos` (sin `:Id`) confirmado **muerto** → `404` (no hay ruta).

## Hallazgo abierto: `DIRECT_FILE_ACCESS_BYPASS` (bloquea `Task 7.3 CLOSED`)

- **Evidencia:** `src/app.js:31` sirve `express.static('public')`; los archivos subidos viven en
  `public/uploads/<filename>` y `Doctos.Archivo = /uploads/<filename>`. La ruta es **estática y sin
  autenticación**: conocida (o adivinada) la URL, cualquiera descarga el archivo **sin token**.
- **Impacto:** proteger los `GET` de la API **no** protege el binario. Un INE/comprobante/foto de un alumno
  de otro dormitorio es descargable directamente si se conoce el nombre de archivo (los nombres los emite
  multer; su entropía es el único obstáculo — **no** es un control de acceso).
- **Propuesta (no ejecutada; requiere decisión + coordinación Flutter):**
  1. Servir los archivos por un endpoint autenticado (`GET /files/:id` con la **misma** política documental)
     en vez de `express.static` sobre `/uploads`; **o**
  2. Migrar a almacenamiento privado (p. ej. Cloudinary con entrega firmada de corta duración) y devolver
     URLs firmadas desde los `GET` ya contenidos.
- **No se cambió la infraestructura estática** (rompería la carga de imágenes de Flutter sin migración
  coordinada). Se documenta con evidencia + impacto + propuesta; **`Task 7.3` permanece `NOT CLOSED`**
  hasta resolver este bypass y ejecutar D2-C (retiro de bridges).

**Estado: `D2-A Backend read containment = DONE`** (0 lecturas documentales anónimas por la API; contratos
server-authoritative; foto de perfil sin capability nueva; sin `SELECT *`). **`Task 7.3` = NOT CLOSED**
(pendiente `DIRECT_FILE_ACCESS_BYPASS` y **D2-C** retiro de bridges tras migración Flutter D2-B).
