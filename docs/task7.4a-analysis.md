# Task 7.4A — Análisis BD + contrato `POST /permission` (creación transaccional)

Diseño/análisis. **Sin cambios productivos.** Objetivo: que el backend construya
`Permission + Authorize` en una transacción, resolviendo la cadena desde los datos del
alumno (token), y eliminar el bug de Pueblo (Flutter usa `idJefe/idDepto` nulos → crash →
Permission huérfana, p. ej. **7048**).

## 1. Datos reales verificados (2026-08-17)

**Identidad y ámbito del alumno (todo derivable del token + BD):**
- Alumno = `token.id` → `LoginUniPass` por `IdLogin`.
- Dormitorio = `LoginUniPass.Dormitorio`.
- **Preceptor del dormitorio** = `LoginUniPass` con `TipoUser='PRECEPTOR'`, `Dormitorio=<dorm>`,
  `StatusActividad=1`. Su `Matricula` (numérica) = el `IdEmpleado` que usa `Authorize`.
  (repo existente `findPreceptorMatriculaByDormitorio`). Mapa real: dorm1→404, dorm2→89,
  dorm3→273, dorm4→41.
- **Coordinador** = `ADMINISTRATIVO` activo de Coordinación (dorm 5); hoy `264` (Teresa),
  resuelto por el híbrido de `/autorizadorSalida` (override en `Configuracion` o por rol).
  Ver [[autorizador-salidas-switch]].

**Lo que NO existe en el esquema backend (causa raíz del bug):**
- `LoginUniPass` **no** tiene campos de trabajo/área/jefe/departamento (cols:
  IdLogin, Matricula, Contraseña, Correo, Nombre, Apellidos, TipoUser, Sexo,
  FechaNacimiento, Celular, StatusActividad, Dormitorio, IdCargoDelegado, TokenCFM, Documentacion).
- **No hay ninguna tabla** de trabajo/área/departamento. `Position` es **suplencias**
  entre empleados (IdCargo, MatriculaEncargado, ClassUser, Asignado, Activo), no cargos del alumno.
- ⇒ Para un ALUMNO, `idJefe`/`idDepto` **no son derivables**. Flutter los toma de prefs de
  datos de empleado (null en alumnos) → crash. **El backend no puede inventar esa cadena.**

## 2. Cadenas reales por tipo (histórico de `Authorize`)

| Tipo | Descripción | Cadena observada | Regla derivable |
|---|---|---|---|
| 2 | ESPECIAL | 1 eslabón: `264`(ADMIN,d5) o `41`(PRECEPTOR,d4) | Autorizador único vía switch (`/autorizadorSalida`): coordinador o preceptor del dorm |
| 3 | A CASA | 1 eslabón: `264`(ADMIN,d5) | Igual que tipo 2 |
| 1 | PUEBLO | 6036: `41`(PRECEPTOR,d4)→ `89`(PRECEPTOR,d2); 7044: `41`(PRECEPTOR,d4) | **1er eslabón = preceptor del dorm del alumno** (confirmado). **2º eslabón = ambiguo** (jefe/depto), NO derivable del backend |

Ejemplos: alumnos de 6036/7044/7048 son dorm 4 → 1er eslabón `41` (preceptor dorm 4) ✓.

## 3. 🚩 Pregunta abierta (necesita decisión de dominio Frontend/negocio)

Para **Tipo 1 (Pueblo)** el backend puede resolver el **preceptor del dormitorio** (1er
eslabón), pero **NO** puede determinar el 2º eslabón ("jefe de trabajo"/"departamento")
porque no existe ese modelo de datos para alumnos. Opciones a decidir:

- **(A)** Pueblo es en realidad de **un solo eslabón** (preceptor del dorm) y `idJefe/idDepto`
  es legado a eliminar. (El 2º eslabón de 6036 sería un caso histórico manual.)
- **(B)** Pueblo requiere un 2º autorizador (jefe/depto) que hoy **no está modelado** →
  hay que crear el modelo (tabla de asignación alumno→trabajo/jefe) antes de automatizar.

Sin esta decisión, 7.4A puede cerrarse para **tipo 2 y 3** (totalmente derivables) y para el
**1er eslabón de tipo 1**, dejando el 2º eslabón de Pueblo pendiente del modelo de datos.

## 4. Contrato propuesto `POST /permission` (transaccional)

### Request (lo que Flutter envía)
```json
{ "FechaSolicitada": "...", "FechaSalida": "...", "FechaRegreso": "...",
  "Motivo": "...", "IdTipoSalida": 1|2|3, "MedioSalida": "opcional" }
```
Auth: ✅ Bearer.

### Identidad (solo del token)
`IdUser = token.id`. Dormitorio, preceptor, coordinador → derivados en BD.

### Campos NO confiables (aceptados por compat, IGNORADOS como autoridad)
`IdUser`, `IdEmpleado`, `idJefe`, `idDepto`, `NoDepto`. (Ya se ignora `IdUser` desde 7.2.)

### Resolución de cadena (backend)
- **Tipo 2 / 3**: 1 autorizador = resultado del híbrido `/autorizadorSalida`
  (coordinador si `AUTORIZADOR_SALIDAS='COORDINADOR'`, si no preceptor del dorm).
- **Tipo 1**: `[ preceptor del dorm ]` (+ 2º eslabón **según decisión §3**).

### Errores (códigos internos controlados)
| Situación | HTTP | code |
|---|---|---|
| IdTipoSalida no válido | 400 | `INVALID_TIPO` |
| Sin preceptor activo para el dorm | 409 | `PRECEPTOR_NOT_FOUND` |
| Coordinador no resoluble (modo COORDINADOR) | 409 | `COORDINADOR_NOT_RESOLVABLE` |
| Cadena no construible (ningún autorizador) | 409 | `CHAIN_NOT_BUILDABLE` |
| Datos inconsistentes (alumno sin dorm, etc.) | 409 | `INCONSISTENT_DATA` |

### Response (éxito)
```json
{ "Id": <IdPermission>, "IdTipoSalida": 1, "StatusPermission": "Pendiente",
  "cadena": [ { "IdEmpleado": 41, "NoDepto": 318, "rol": "PRECEPTOR", "orden": 1 } ] }
```

### Transacción (obligatoria)
```
BEGIN TRAN
  alumno = LoginUniPass[token.id]         (409 INCONSISTENT_DATA si falta dorm)
  cadena = resolver(IdTipoSalida, alumno) (409 si no construible)
  INSERT Permission
  INSERT Authorize[]  (uno por eslabón)
COMMIT   -- ante cualquier error: ROLLBACK
```
Regla: **Permission + Authorize completos, o ninguno.** Nunca Permission sin Authorize
(elimina el caso 7048).

### Idempotencia (propuesta)
- Header opcional `Idempotency-Key` (uuid del cliente): si llega repetido dentro de una
  ventana, devolver la misma `Permission` sin duplicar.
- Alternativa sin header: dedupe por `(IdUser, IdTipoSalida, FechaSalida, FechaRegreso)`
  con estado no cancelado dentro de ~1 min → devolver la existente (200) en vez de crear otra.
- Cubre doble submit / timeout / reintento del cliente.

## 5. Limpieza pendiente
- Permission **7048** (huérfana, Pueblo, sin Authorize): cancelar o eliminar como dato de
  prueba una vez acordado el flujo (no tocar aún).

## 6. Alcance de este pase
Solo **análisis + contrato**. No se implementa 7.4A ni se toca 7.4B
(`/authorize`, `/autorizarPermission`, `/permissionValorado`, `/checks`).
