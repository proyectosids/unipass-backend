# UniPass — Modelo de autorización (DISEÑO · FASE A+B)

> **Estado: DISEÑO para revisión.** Contiene el análisis del modelo actual (FASE A) y el
> diseño propuesto (FASE B). **NO implementado en producción todavía** — pendiente de tu
> aprobación para FASE C (implementación). No mezcla password legacy, 7.4B, revisión
> documental ni BOLA de lecturas (solo se referencian para la matriz endpoint→permiso).

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
| `ADMIN` | derivado de `TipoUser='ADMINISTRATIVO'` | pasa `requireCapability(['ADMIN'])`: `/admin/*`, `/supervisorGrant*`, `DELETE /permission/:Id`, `POST /register` (temporal) |
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

## A.6 Estado de `POST /register` (a rediseñar, punto 12)
Commit reciente lo dejó `verifyToken + requireCapability(['ADMIN'])` + allowlist de TipoUser. **Eso
NO corresponde**: `/register` es **autoregistro público**. Se conserva de ese cambio: respuesta sin
hash, sin TokenCFM/tokens, sin log de contraseña, y las pruebas reutilizables. El gating cambia (ver B.8).

## A.7 Impacto en Flutter (resumen)
- Consume `capabilities[]` (no debe romperse).
- `/register` es su flujo de autoregistro (gating ADMIN lo rompería → se rediseña).
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

## B.6 SUPERADMIN
- **Se implementa como capability** en `CheckerGrant.Capability` (extender el CHECK a incluir
  `'ADMIN'` y `'SUPERADMIN'`). Una fila SUPERADMIN: `Capability='SUPERADMIN', Tipo=NULL, IdDormitorio=NULL,
  Scope='AMBOS'(relleno), Activo=1, Vigencia='PERMANENTE'`. Reusa toda la maquinaria de grants.
- Scope **GLOBAL**, resuelve a **todos** los permisos.
- **Nunca** es un `TipoUser`; `POST /register` jamás lo acepta ni lo produce.
- Puede realizar acciones administrativas globales; sus operaciones sensibles se **auditan** (B.9).

## B.7 Aprovisionamiento inicial de SUPERADMIN (punto 9)
- **Migración `012` (a diseñar):** solo **extiende el CHECK** de `Capability` para permitir
  `ADMIN`/`SUPERADMIN`. **NO** otorga SUPERADMIN a nadie.
- **Otorgamiento de la 1ª cuenta:** script/migración **parametrizado y comentado** que inserta un
  grant SUPERADMIN para un `IdLogin` **que tú indiques** (no automático, requiere tu autorización).
- Regla futura (a confirmar): **solo SUPERADMIN** puede otorgar/revocar SUPERADMIN (un ADMIN normal no).

## B.8 Rediseño de `POST /register` (autoregistro público SEGURO)
Contrato objetivo (a detallar con Frontend antes de implementar):
```
Flutter → POST /register { matricula, (correo verificado por OTP?), Contraseña, ... }
Backend:
  1. Verifica identidad contra ULV: getStudentData(matricula) / /api/datos/:matricula (debe existir).
  2. Deriva TipoUser SERVER-SIDE del tipo institucional de ULV (Data.type: ALUMNO/EMPLEADO).
     -> NUNCA del body. Un TipoUser arbitrario del cliente se IGNORA.
  3. (Recomendado) exige verificación de identidad por OTP de alta de cuenta (flujo /otp_app/verifyOTP
     ya existe en el proveedor) para evitar registrar una identidad ajena.
  4. NUNCA otorga capabilities (ADMIN/SUPERADMIN/SUPERVISOR/CHECKER) en el registro.
Se CONSERVA del hardening previo: sin hash en respuesta, sin TokenCFM/tokens, sin log de contraseña, pruebas.
```
Esto desacopla: `/register` crea **identidad** (TipoUser desde ULV); las **capabilities** se otorgan
por otros flujos controlados. Impide autoasignarse privilegios (el TipoUser no viene del cliente y no
hay capability en el alta).

> ⚠️ Pregunta abierta para ti/Frontend antes de FASE C (punto 12): ¿qué manda hoy Flutter en
> `new_account`?, ¿ya pasa por OTP de alta?, ¿la fuente autoritativa del TipoUser es `Data.type` de ULV
> o hay reglas adicionales (p. ej. EMPLEADO vs PRECEPTOR/VIGILANCIA que ULV no distingue)?

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

# Cambios de BD propuestos (para FASE C, NO aplicados)
1. **Migración 012** — `ALTER` del CHECK de `CheckerGrant.Capability` para permitir `'ADMIN'`,`'SUPERADMIN'`
   (idempotente; drop+recreate del constraint). Rollback: recrear el CHECK anterior. Datos afectados: ninguno
   (solo amplía valores válidos).
2. **Migración 013** — tabla `AuditLog` (idempotente `IF OBJECT_ID IS NULL`). Rollback: `DROP TABLE`.
3. **Script parametrizado** — otorgar SUPERADMIN a un `IdLogin` indicado (no automático).

# Archivos nuevos/modificados propuestos (para FASE C)
- Nuevo: `src/security/permissions.js` (catálogo + mapping + resolvePermissions).
- Nuevo: `src/Middleware/requirePermission.js`, `src/Middleware/validateScope.js`.
- Nuevo: `src/services/audit.service.js` + `src/repositories/audit.repo.js`.
- Modificar (compat): `requireCapability.js` (expresarlo sobre permisos), `checkerGrant.repo.js`
  (soportar ADMIN/SUPERADMIN en grants/capabilities), `getCapabilities` (añadir `permissions[]`).
- Rediseñar: `register.controller.js` + `resgister.routes.js` (autoregistro con TipoUser desde ULV).
- Migraciones `012`, `013` + script SUPERADMIN.

# Riesgos / deuda técnica
- Reusar `CheckerGrant` para ADMIN/SUPERADMIN mezcla "capability de checador" con "rol de seguridad";
  aceptable a corto plazo (misma maquinaria), a futuro podría separarse en su propia tabla `Grant`.
- El puente `ADMINISTRATIVO→ADMIN` sigue vivo (transitorio) → documentado, a retirar tras otorgar ADMIN explícito.
- `/register` depende de ULV: si ULV cae, el autoregistro falla (igual que Pueblo). Aceptable.
- Scope DORMITORIO para reviewers depende de la regla "dorm 5 = global" ya usada en dashboards.

# Fuera de alcance de esta tarea (no mezclar)
password legacy `/password/:Correo`, Task 7.4B (cadena de autorización), revisión documental (7.3),
BOLA de lecturas — solo se referencian en la matriz endpoint→permiso ([[permissions-matrix]]).
