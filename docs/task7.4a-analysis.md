# Task 7.4A — Creación server-side de Permission + Authorize (Tipo 1) — ✅ IMPLEMENTADO

Implementado 2026-08-18 (solo Tipo 1). Tipos 2/3 **sin cambios** (coordinador intacto,
`PENDING_DOMAIN_DECISION_COORDINATOR_TYPE_2_3`). 7.4B intacto. Verificado en vivo contra
`https://ulv-api.apps.isdapps.uk` y con tests (unit + integración con BD).

## 0. Regla de negocio aprobada — Tipo 1 (Pueblo)
```
Alumno → Jefe de trabajo (orden 1) → Preceptor (orden 2)
Excepción: si jefeMatricula == preceptorMatricula → UN solo eslabón (dedupe).
```
Comparación por **matrícula institucional** normalizada (no nombre/rol/IdLogin). El orden
Jefe→Preceptor es obligatorio (la restricción de que el Preceptor no apruebe antes que el
Jefe corresponde a 7.4B).

## Archivos (implementación)
- `src/services/ulvApiService.js` — capa API-ULV (env `ULV_API_URL`/`ULV_API_TIMEOUT_MS`).
- `src/util/puebloChain.js` — `resolvePuebloChain` (puro, deps inyectadas).
- `src/repositories/permission.repo.js` — `createPermissionWithChainTx` (transacción),
  `findPermissionByIdempotencyKey`.
- `src/repositories/bedroom.repo.js` — `findBedroomIdentificador`.
- `src/controllers/permission.controller.js` — `createPermission` ramifica: Tipo 1 →
  `createPermissionPueblo`; Tipos 2/3/4 → `createPermissionLegacy` (comportamiento actual).
- `database/migrations/009_idempotency.sql` — tabla `IdempotencyRequest` (aplicada).
- Tests: `tests/pueblo-chain.test.js` (unit), `tests/pueblo-permission.integration.test.js`.

## Notificación al Jefe (orden 1) — ✅ implementada
Tras el COMMIT, `POST /permission` Tipo 1 notifica **solo al primer eslabón (Jefe, orden 1)**
reutilizando el evento del flujo legacy `new_authorization_assigned` (vía `emitToEmpleado`,
que resuelve cobertura/suplencia). El **Preceptor (orden 2) NO** se notifica aún (será en 7.4B).
Best-effort **después** del COMMIT: un fallo de socket/FCM se loguea y **no** revierte la
Permission. En **replay** idempotente (200) **no** se re-notifica (solo en la creación real, 201).
Nota: el flujo de asignación legacy solo usa socket (no hay push FCM aparte que reutilizar).

## Indicaciones para Flutter (Tipo 1 Pueblo)
- `POST /permission` con `IdTipoSalida:1` + Bearer ahora **crea Permission + Authorize** en el
  backend. Flutter debe **dejar de** ejecutar `POST /authorize` para Pueblo y **dejar de**
  calcular `idJefe`/`idDepto` desde prefs (origen del crash y de la Permission huérfana 7048).
- Enviar (recomendado) header **`Idempotency-Key`** (uuid por intento) para evitar duplicados
  por reintento/timeout. Body: solo datos de la solicitud (fechas, Motivo, IdTipoSalida).
- Respuesta 201: `{ Id, IdTipoSalida:1, StatusPermission:'Pendiente', cadena:[{orden,IdEmpleado,matricula,rol}] }`.
  Reintento con el mismo `Idempotency-Key` → 200 `{ ..., replayed:true }`.
- Manejar los nuevos códigos (409/502/504) mostrando mensaje (no reintentar en 409).
- **Tipos 2/3 NO cambian** en este pase: siguen con el flujo actual (Flutter orquesta /authorize).
- `POST /authorize` legado se mantiene por compatibilidad de Tipos 2/3; no eliminar aún.

## 1. Fuente de cada dato — API-ULV

Base URL única (env `ULV_API_URL`): `https://ulv-api.apps.isdapps.uk` (sirve todas las
rutas `/api/datos/*`; el Postman lista hosts internos `172.16.30.10:3002` / `ulvdb.isdapps.uk`
que son alternos — **no hardcodear hosts**). "Jefe de Vigilancia" queda FUERA DE ALCANCE.

| Dato requerido | Endpoint API-ULV | Parámetro | Campo recibido | Mapping UniPass |
|---|---|---|---|---|
| Datos del alumno + trabajo | `GET /api/datos/:matricula` | `:matricula` = `LoginUniPass.Matricula` (del token) | `Data.work[0]."ID DEPTO"`, `"ID JEFE"` (cross-check), `Data.type` | matrícula del alumno = `LoginUniPass[token.id].Matricula` |
| Preceptor del dormitorio | `GET /api/datos/prece/:id` | `:id` = **`Bedroom.Identificador`** (NO `IdDormitorio`) | `"ID JEFE"` = matrícula del preceptor | `LoginUniPass.Dormitorio → Bedroom.IdBedroom → Bedroom.Identificador` |
| Jefe de depto (vigente) | `GET /api/datos/JefeDepto/:IdDepto` | `:IdDepto` = `work[0]."ID DEPTO"` | `EmpMatricula` = matrícula del jefe | — |
| Validar que X es jefe depto | `GET /api/datos/getjefe/:IdEmpleado` | `:IdEmpleado` = matrícula | `EmpMatricula` o `null` | cross-check opcional |
| Coordinador del alumno | `GET /api/datos/coordinador/:Matricula` | `:Matricula` = matrícula del alumno | `empMatricula`, `IdDepartamento` | — |

Conversión **matrícula institucional → usuario UniPass**: `LoginUniPass.Matricula = <matricula> AND StatusActividad=1`
→ `IdLogin` (= `IdEmpleado` en `Authorize`). Si no existe cuenta → `AUTHORIZER_NOT_REGISTERED`.

## 2. Resolución exacta del PRECEPTOR (entregable §4)
`:id` de `prece/:id` **NO** es `LoginUniPass.Dormitorio` directo. **Requiere conversión**:
```
LoginUniPass.Dormitorio (1..5) == Bedroom.IdBedroom → Bedroom.Identificador (315/316/317/318/351)
GET /api/datos/prece/<Identificador> → "ID JEFE" = matrícula del preceptor
```
Verificado en vivo: alumno dorm 4 → `Bedroom.Identificador=318` → `prece/318` →
`{"ID DEPTO":318,"DEPARTAMENTO":"H.V.N.U","ID JEFE":41,...}` → preceptor matrícula **41**
(Melytzin). Coincide con el mapeo local (`LoginUniPass PRECEPTOR` por `Dormitorio`), que
sirve de cross-check/fallback. Mapa: dorm1→Id315→404, dorm2→Id316→89, dorm3→Id317→273,
dorm4→Id318→41.

## 3. Resolución exacta del JEFE DE TRABAJO (entregables §4/§5)
```
matrícula alumno → GET /api/datos/:matricula → work[0]."ID DEPTO"
                → GET /api/datos/JefeDepto/<ID DEPTO> → EmpMatricula = jefeMatricula (VIGENTE)
```
**Cross-check `work.ID JEFE` vs `JefeDepto.EmpMatricula` (entregable §5): NO siempre
coinciden.** Verificado: para depto 302 el ejemplo Postman traía `work.ID JEFE=2`, pero en
vivo `JefeDepto/302.EmpMatricula=213`. **Decisión: el jefe vigente es
`JefeDepto.EmpMatricula`** (refleja el estado actual); `work.ID JEFE` es un snapshot en el
registro del alumno que puede estar desactualizado. **Regla:** usar `JefeDepto.EmpMatricula`;
si difiere de `work.ID JEFE`, **loguear la discrepancia** (no elegir en silencio) y continuar
con `JefeDepto`. 🚩 A confirmar por negocio si en algún caso `work.ID JEFE` debe prevalecer.

**🚩 Alumno sin trabajo (`work: []`) — real y frecuente.** Verificado: el alumno 221068
tiene `work: []` en vivo. Sin `work` no hay `ID DEPTO` → **no hay jefe derivable**. Pregunta
de negocio a cerrar: ¿Pueblo con alumno sin `work` es (a) **error controlado**
(`STUDENT_WORK_NOT_FOUND`, no se crea Permission) o (b) **cadena de un solo eslabón**
(solo preceptor)? La regla §0 asume que siempre hay jefe → por defecto se propone (a) error,
pero requiere confirmación.

## 4. Resolución del COORDINADOR (entregable §6)
```
GET /api/datos/coordinador/<matricula alumno> → { empMatricula, IdDepartamento }
```
Verificado: `coordinador/221068 → {empMatricula:"366", IdDepartamento:214}` → coordinador
matrícula **366** (Iván, EMPLEADO, IdLogin 9 en UniPass). **🚩 Discrepancia con el diseño
actual de tipo 2/3:** hoy el switch `AUTORIZADOR_SALIDAS='COORDINADOR'` usa un coordinador
**global** (264 Teresa, `ADMINISTRATIVO` dorm 5), pero API-ULV da un coordinador **por
alumno** (366). A reconciliar antes de mover tipo 2/3 a API-ULV (decisión de dominio).

## 5. Cadenas por tipo (entregables §7/§8/§9)

**Tipo 1 — Pueblo (aprobado):**
```
1. alumno = LoginUniPass[token.id]; matricula = alumno.Matricula
2. preceptorMatricula = prece(Bedroom.Identificador(alumno.Dormitorio))."ID JEFE"
3. work = getStudentData(matricula).work
   - si work vacío → STUDENT_WORK_NOT_FOUND (ver §3, pendiente decisión)
   idDepto = work[0]."ID DEPTO"
   jefeMatricula = JefeDepto(idDepto).EmpMatricula   (VIGENTE; cross-check work."ID JEFE")
4. dedupe: preceptorMatricula == jefeMatricula ? [preceptor] : [preceptor, jefe]
5. cada matrícula → LoginUniPass → IdLogin (si falta → AUTHORIZER_NOT_REGISTERED)
6. Authorize orden 1 = preceptor; orden 2 = jefe (si aplica)
```

**Tipo 2 — Especial / Tipo 3 — A casa (comportamiento ACTUAL documentado):**
- Hoy resueltos por el híbrido `GET /autorizadorSalida` + switch `AUTORIZADOR_SALIDAS`
  (`Configuracion`): modo `COORDINADOR` → coordinador local (264), modo `PRECEPTOR` →
  preceptor del dorm. 1 solo eslabón. Ver [[autorizador-salidas-switch]].
- **Server-side futuro (propuesto):** el coordinador debería salir de
  `coordinador/:matricula` (API-ULV, por alumno) en modo COORDINADOR — **pero** eso choca
  con el coordinador global actual (§4). **No se cambia en este pase**; se documenta y se
  decide antes de tocar tipo 2/3.

## 6. Capa `UlvApiService` (entregable §7)
Abstracción única (no dispersar HTTP en controladores). Base URL desde `ULV_API_URL`
(+ `ULV_API_TIMEOUT_MS`). Métodos:
`getStudentData(matricula)`, `getPreceptor(identificador)`, `getDepartmentHead(idDepto)`,
`validateDepartmentHead(matricula)`, `getStudentCoordinator(matricula)`.

## 7. Normalización de errores externos (entregable §10)
API-ULV responde `200+objeto`, `200+null` (no encontrado) y `500` (param inválido). UniPass
**no** propaga eso a Flutter; mapea a códigos internos:

| Situación | code interno | HTTP UniPass |
|---|---|---|
| API-ULV inalcanzable / conexión | `ULV_API_UNAVAILABLE` | 502 |
| Timeout | `ULV_API_TIMEOUT` | 504 |
| Alumno no encontrado en API-ULV | `STUDENT_NOT_FOUND` | 409 |
| Alumno sin `work` | `STUDENT_WORK_NOT_FOUND` | 409 |
| Preceptor no resuelto (prece null/500) | `PRECEPTOR_NOT_FOUND` | 409 |
| Jefe de depto no resuelto (JefeDepto null) | `DEPARTMENT_HEAD_NOT_FOUND` | 409 |
| Coordinador no resuelto (coordinador null) | `COORDINATOR_NOT_FOUND` | 409 |
| Matrícula institucional sin cuenta UniPass | `AUTHORIZER_NOT_REGISTERED` | 409 |
| Cadena incompleta tras dedupe | `AUTHORIZATION_CHAIN_INCOMPLETE` | 409 |

En todos: **NO crear Permission**. No generar usuarios ni usar fallback de autorizador.

## 8. Contrato `POST /permission` (entregable §11)

**Request (solo datos de la solicitud):**
```json
{ "FechaSolicitada":"...", "FechaSalida":"...", "FechaRegreso":"...",
  "Motivo":"...", "IdTipoSalida":1|2|3, "MedioSalida":"opcional" }
```
Auth ✅ Bearer. **Identidad = token** (`IdUser = token.id`). Flutter **no** es autoridad de:
`IdUser, IdEmpleado, idJefe, idDepto, NoDepto, coordinador, cadena` (se aceptan por compat y
se **ignoran**).

**Flujo (API-ULV FUERA de la transacción, entregable §9):**
```
1. verifyToken → token.id
2. matricula = LoginUniPass[token.id].Matricula   (409 STUDENT/INCONSISTENT_DATA si falta)
3-7. consultar API-ULV: preceptor / work→jefe / coordinador (según tipo)
8. convertir matrículas institucionales → IdLogin UniPass (409 AUTHORIZER_NOT_REGISTERED)
9. deduplicar autorizadores (por matrícula)
10. validar cadena completa (409 AUTHORIZATION_CHAIN_INCOMPLETE)
--- solo si la cadena está completa ---
BEGIN TRAN
  INSERT Permission (IdUser=token.id, ...)
  INSERT Authorize[] (orden 1..n)
COMMIT            (ROLLBACK ante cualquier error SQL)
```
Regla: **Permission + Authorize completos, o ninguno.** Nunca Permission sin Authorize
(elimina el caso 7048). Si API-ULV falla o falta un autorizador obligatorio → **no** se abre
la transacción.

**Response (éxito):**
```json
{ "Id": <IdPermission>, "IdTipoSalida": 1, "StatusPermission": "Pendiente",
  "cadena": [ { "orden":1, "IdEmpleado":41, "matricula":"41", "rol":"Preceptor" },
              { "orden":2, "IdEmpleado":9,  "matricula":"366","rol":"Jefe de trabajo" } ] }
```

## 9. Idempotencia (entregable §12)
Evitar duplicados por doble tap / timeout / reintento / respuesta perdida tras COMMIT:
- **Header `Idempotency-Key`** (uuid del cliente por intento de solicitud). Persistir
  `(IdempotencyKey → IdPermission)` en una tabla `IdempotencyRequest` (migración propuesta,
  sin aplicar). Si llega repetido: devolver la **misma** Permission (200) sin recrear.
- **Fallback sin header:** dedupe por `(IdUser, IdTipoSalida, FechaSalida, FechaRegreso)` con
  estado no cancelado dentro de una ventana corta (~2 min) → devolver la existente.
- El `Idempotency-Key` se registra **dentro** de la transacción para atomicidad.

## 10. Casos de prueba propuestos (entregable §13)
Con `UlvApiService` **mockeado** (sin llamar API-ULV real ni cuentas reales destructivas):

| Caso | Escenario | Esperado |
|---|---|---|
| A | Pueblo, preceptor(41) != jefe(9/366) | 1 Permission + 2 Authorize (orden 1,2) |
| B | Pueblo, preceptor == jefe (misma matrícula) | 1 Permission + 1 Authorize (dedupe) |
| C | `prece` → null/500 | `PRECEPTOR_NOT_FOUND`, 0 Permission |
| D | alumno con `work: []` | `STUDENT_WORK_NOT_FOUND`, 0 Permission |
| E | `JefeDepto` → null | `DEPARTMENT_HEAD_NOT_FOUND`, 0 Permission |
| F | jefe institucional (213) sin cuenta UniPass | `AUTHORIZER_NOT_REGISTERED`, 0 Permission |
| G | API-ULV caída/timeout | `ULV_API_UNAVAILABLE`/`ULV_API_TIMEOUT`, 0 Permission |
| H | error SQL creando Authorize | ROLLBACK: 0 Permission, 0 Authorize |
| I | doble request / mismo Idempotency-Key | 1 sola Permission (sin duplicar) |

## 11. Limpieza / pendientes
- Permission **7048** (huérfana Pueblo, 0 Authorize): cancelar/eliminar como dato de prueba
  al implementar (no tocar aún).
- Config env a definir: `ULV_API_URL`, `ULV_API_TIMEOUT_MS` (y secreto si API-ULV lo exige,
  **solo por env**).

## 12. Confirmación (entregable §14)
**No se realizaron cambios productivos** en 7.4A ni 7.4B. Este pase es únicamente
análisis/diseño. `POST /authorize`, `PUT /autorizarPermission/:Id`,
`PUT /permissionValorado/:Id`, `POST /checks` sin tocar.

## 13. Decisiones de dominio a cerrar antes de implementar
1. Pueblo con alumno **sin `work`** → ¿error o preceptor-solo? (§3)
2. `work.ID JEFE` vs `JefeDepto.EmpMatricula` en caso de discrepancia → ¿siempre JefeDepto? (§3)
3. Tipo 2/3: coordinador **por alumno** (API-ULV, 366) vs **global** actual (264) → ¿cuál rige? (§4)
