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

> **Pendiente:** migración de Flutter (Bearer en `/autorizarPermission`, dejar de mandar `IdEmpleado`,
> no llamar `/permissionValorado` ni `/authorize`, adaptar creación 2/3). Tipo 4 sin definir. ADMIN
> override / `PERMISSIONS_APPROVE`/`REJECT` administrativos → Fase 3. **7.4B no se declara cerrada** hasta migrar Frontend.

# Fuera de alcance de esta tarea (no mezclar)
Revisión documental (7.3), BOLA de lecturas — solo se referencian en la matriz endpoint→permiso
([[permissions-matrix]]). (`/password/:Correo` legacy y `/permissionValorado` cliente: **ya retirados**.)
