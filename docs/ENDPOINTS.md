# UniPass API — Índice completo de endpoints

Referencia plana de **todos** los endpoints (58), al estado actual del código (`c492ca6`).
Para detalle de request/response ver [API.md](API.md) y [API-REFERENCE.md](API-REFERENCE.md).
Contrato OTP externo en [otp-service-contract.md](otp-service-contract.md).

- **Base URL:** `http://<host>:<PORT>` (rutas montadas en la raíz, sin prefijo `/api`).
- **Auth:** `🔒` = requiere `Authorization: Bearer <accessToken>`. `🔒ADMIN`/`🔒SUP` = además capability. `—` = abierto (ver deuda técnica en API.md §14).
- **Documentación interactiva (Swagger UI):** con el servidor arriba, `http://<host>:<PORT>/api-docs`
  (spec cruda en `/api-docs.json`). Prueba los endpoints desde el navegador: corre `login`, pulsa
  **Authorize** y pega el `accessToken`. Fuente: `src/docs/openapi.js`.
- Colección Postman lista para importar: `postman/UniPass-API.postman_collection.json`.

## Sesión y usuarios (`user.routes.js`, `resgister.routes.js`)
| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| POST | `/login` | — | Login. Body `{ Matricula, Contraseña }` (Matricula acepta matrícula o correo). Devuelve accessToken, refreshToken, user, capabilities. |
| POST | `/refresh-token` | — | Rota tokens. Body `{ refreshToken }`. |
| POST | `/logout` | 🔒 | Revoca el refresh. Body `{ refreshToken }`. |
| GET | `/verifyToken` | 🔒 | Valida sesión; devuelve `{ user, capabilities }`. |
| POST | `/register` | — | Alta de usuario. Rechaza `TipoUser:'DEPARTAMENTO'` (400). |
| GET | `/me` | 🔒 | **BOLA/IDOR R1**: perfil del usuario autenticado; proyección segura (sin hash/TokenCFM). Única lectura SELF. |
| ~~GET~~ | ~~`/user/:Id`~~ · ~~`/userMatricula/:Matricula`~~ | — | **RETIRADOS (BOLA/IDOR R1-C)** → 404. Usar `/me`. |
| ~~GET~~ | ~~`/buscarUser/:Nombre`~~ · ~~`/userChecks/:EmailAsignador`~~ · ~~`/VerToken/:Matricula`~~ | — | **RETIRADOS (BOLA/IDOR R1-A)** → 404. `/buscarPersona` reemplaza la búsqueda; FCM resuelto interno. |
| PUT | `/cambiarCargo/:Matricula` | — | Asigna cargo delegado. Body `{ IdCargoDelegado }`. |
| PUT | `/terminarCargo/:Matricula` | — | Termina cargo + borra Position. |
| PUT | `/TokenDispositivo/:Matricula` | 🔒 | **Task 7.2**: matrícula del token (path ignorado). Body `{ TokenCFM }`. |
| ~~PUT~~ | ~~`/Documentacion/:Matricula`~~ | — | **RETIRADO (7.3 D1-C2)** → 404. `Documentacion` es cache server-computed. |

## Contraseña (`user.routes.js`, `password.routes.js`)
| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| PUT | `/me/password` | 🔒 | **Task 7.1.A**: cambio autenticado. Body `{ actual, nueva }` (min 8, 1 letra, 1 número). |
| POST | `/password/forgot` | — | **Task 7.1.B**: inicia recuperación por **matrícula**. Body `{ matricula }`. 200 genérico (anti-enumeración). |
| POST | `/password/verify-otp` | — | Valida OTP server-side. Body `{ matricula, otp }` → `{ resetToken }` o 400 `INVALID_OTP`. |
| POST | `/password/reset` | — | Aplica nueva contraseña. Body `{ resetToken, nueva }`. |
| PUT | `/password/:Correo` | — | **LEGADO** (deprecándose). Body `{ NewPassword }`. |

## Permisos de salida (`permission.routes.js`)
| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| POST | `/permission` | 🔒 | Crea permiso; `IdUser` del token. **Tipo 1 (Pueblo)**: crea Permission+Authorize server-side (cadena Jefe→Preceptor) + notifica al Jefe. Header opcional `Idempotency-Key`. Tipos 2/3/4: flujo actual. |
| GET | `/permission/:Id?page&limit` | — | Historial paginado del alumno. |
| PUT | `/permission/:Id` | 🔒 | Cancela (solo dueño; 403 `FORBIDDEN_OWNERSHIP`, 404 `PERMISSION_NOT_FOUND`). |
| DELETE | `/permission/:Id` | 🔒ADMIN | Elimina (cerrado a ADMIN). |
| ~~PUT~~ | ~~`/permissionValorado/:Id`~~ | — | **RETIRADO (7.4B Commit A)** → 404. El estado global lo calcula el backend. |
| GET | `/PermissionsPreceptor/:Id` | — | Bandeja del preceptor. |
| GET | `/permissionsEmployee/:Id` | — | Bandeja del empleado/autorizador. `200 []` si vacío. |
| GET | `/permissionTop/Student/:Id` | — | Últimos 10 del alumno. `200 []`. |
| GET | `/permissionTop/Employee/:Id` | — | Últimos 10 del empleado. `200 []`. |
| GET | `/permissionTop/Preceptor/:Id` | — | Últimos 10 del preceptor. `200 []`. |
| GET | `/dashboardPermission/:IdPreceptor` | — | Conteos de permisos. |
| GET | `/dashboardDocumentos/:IdPreceptor` | — | Conteos de documentos. |
| GET | `/permissions/filter/:IdPreceptor?fechaInicio&fechaFin&status&nombre&matricula` | — | Filtro (ADMINISTRATIVO/PRECEPTOR). |

## Autorización y autorizador (`authorize.routes.js`)
| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| GET | `/autorizadorSalida?tipo=2\|3&nivelAcademico&sexo` | — | Resuelve quién autoriza salidas 2/3 (switch). **Solo lectura; ya NO requerido para crear permiso (7.4B Commit B).** |
| ~~POST~~ | ~~`/authorize`~~ | — | **RETIRADO (7.4B Commit B)** → 404. La cadena se crea server-side en `POST /permission`. |
| PUT | `/autorizarPermission/:Id` | 🔒 | **7.4B Commit A:** resuelve eslabón. Actor = token; body `{ StatusAuthorize: 'Aprobada'\|'Rechazada' }` (IdEmpleado ignorado). Orden estricto; global recalculado; atómico + AuditLog. `401/403 NOT_AUTHORIZER/404/409`. |
| GET | `/validarAuthorize/:Id?IdPermiso` | — | ¿El empleado participa en la cadena? |
| GET | `/progresAuthorize/:Id` | — | Avance de la cadena. |
| GET | `/asignarPrece/:Nivel?Sexo` | — | Dormitorio/preceptor por nivel+sexo. |

## Checks / checador (`checks.routes.js`)
| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| ~~POST~~ | ~~`/checks`~~ | — | **RETIRADO (Checks Hardening C2)** → 404. Los 4 CheckPoints se crean server-side al aprobar el permiso. |
| GET | `/checksDormitorio/:Id` | — | Pendientes paso 1 (salida dormitorio); `:Id`=IdDormitorio. |
| GET | `/checksVigilancia` | — | Pendientes paso 2 (salida caseta). |
| GET | `/checksVigilanciaRegreso` | — | Pendientes paso 3 (regreso caseta). |
| GET | `/checksDormitorioFin/:Id` | — | Pendientes paso 4 (regreso dormitorio). |
| PUT | `/checks/:id` | 🔒 | Confirma un check (grant CHECKER + orden 1→4; 403/409). Body `{ FechaCheck, Estatus, Observaciones }`. |

## Capabilities: checador y supervisor (`checkerGrant.routes.js`)
| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| GET | `/getCapabilities` | 🔒 | Capabilities del usuario (CHECKER/SUPERVISOR). |
| POST | `/checkerGrant` | 🔒 PRECEPTOR/VIGILANCIA | Otorga CHECKER. Body `{ IdLogin, Scope, Vigencia, FechaExpira? }`. |
| GET | `/checkerGrants` | 🔒 PRECEPTOR/VIGILANCIA | Grants activos scopeados por rol. |
| GET | `/checkerGrantsByUser/:idLogin` | 🔒 PRECEPTOR/VIGILANCIA | Grants de un usuario. |
| PUT | `/checkerGrant/:idGrant` | 🔒 PRECEPTOR/VIGILANCIA | Activa/desactiva. Body `{ Activo: 0\|1 }`. |
| DELETE | `/checkerGrant/:idGrant` | 🔒 PRECEPTOR/VIGILANCIA | Revoca. |
| GET | `/buscarPersona/:Nombre` | 🔒 PRECEPTOR/VIGILANCIA | Personas asignables (LIKE, campos seguros). |
| POST | `/supervisorGrant` | 🔒ADMIN | Otorga SUPERVISOR (solo lectura). Body `{ IdLogin }`. |
| DELETE | `/supervisorGrant/:idLogin` | 🔒ADMIN | Revoca SUPERVISOR. |

## Panel del coordinador (`admin.routes.js`)
| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| GET | `/admin/dashboard?desde&hasta` | 🔒ADMIN\|SUP | Conteos agregados. |
| GET | `/admin/reporte?desde&hasta` | 🔒ADMIN\|SUP | Salidas valoradas 2/3. |
| GET | `/admin/observaciones?desde&hasta` | 🔒ADMIN\|SUP | Observaciones de checadores. |

## Documentos / expediente (`doctos.routes.js`)
| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| POST | `/doctosMul` | 🔒 | Sube doc (multipart, campo `Archivo` + `IdDocumento`); dueño = token. |
| PUT | `/doctosMul/updateProfile` | 🔒 | Reemplaza doc propio. |
| DELETE | `/doctosMul/:Id` | 🔒 | Borra doc propio. Body `{ IdDoctos }` (ownership) o `{ IdDocumento }` (legacy). |
| GET | `/me/documents` | 🔒 | **7.3 D2-A**: documentos del actor (SELF). Allowlist, sin hash/token. |
| GET | `/documents/review/students` | 🔒 | **7.3 D2-A**: alumnos del dorm del PRECEPTOR (dorm server-side). |
| GET | `/documents/review/students/:idLogin/documents` | 🔒 | **7.3 D2-A**: docs de un alumno de SU dorm (PRECEPTOR). |
| GET | `/users/:idLogin/profile-photo` | 🔒 | **7.3 D2-A**: foto de perfil (IdDocumento=6). SELF / PRECEPTOR(mismo dorm) / CHECKER(grant). |
| GET | `/files/:idDoctos` | 🔒 | **7.3 D2-B2**: descarga/stream del **binario** por PK. Política por IdDocumento (foto=6 admite CHECKER; privados 1-5/7 solo SELF/PRECEPTOR mismo dorm). Anti path-traversal; `inline`; `Cache-Control: private, no-store`; sin redirect a `/uploads`. |
| GET | `/doctosProfile/:id?IdDocumento=6` | 🔒 | **7.3 D2-A (bridge, DEPRECATED D2-C)**: solo foto (IdDocumento=6); misma política que `/users/:idLogin/profile-photo`. |
| GET | `/doctos/:Id` | 🔒 | **7.3 D2-A (bridge, DEPRECATED D2-C)**: SELF-only (`:Id`=token → si no 403). |
| GET | `/getExpediente/:IdDormi` | 🔒 | **7.3 D2-A (bridge, DEPRECATED D2-C)**: PRECEPTOR; dorm forzado al del token (sin `dorm=5`). |
| GET | `/getArchivos/:Dormitorio/:Nombre?/:Apellidos?/:Matricula?` | 🔒 | **7.3 D2-A (bridge, DEPRECATED D2-C)**: PRECEPTOR; dorm forzado al del token. |
| ~~PUT~~ | ~~`/statusRevision/:Id`~~ | — | **RETIRADO (7.3 D1-A)** → 404. |
| PUT | `/documents/:idDoctos/reject` | 🔒 | **7.3 D1-A (ÚNICO rechazo)**: seguro (PRECEPTOR del dorm; state machine; AuditLog). Body `{ motivo, comentario? }`. |
| ~~PUT~~ | ~~`/doctosMul/reject/:Id`~~ | — | **RETIRADO (7.3 D1-C2)** → 404. |

## Dormitorios, puntos, cargos (`bedroom/point/position.routes.js`)
| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| GET | `/dormitorio/:Sexo/:NivelAcademico` | — | Bedroom por sexo/nivel. |
| GET | `/getPoints/:Id` | — | Puntos de un tipo de salida (`:Id`=IdExit). |
| GET | `/InfoCargo/:Id` | — | Cargo por matrícula del suplente. |
| GET | `/InfoDelegado/:Id` | — | Delegaciones del encargado. |
| POST | `/createPosition` | — | Alta de suplencia. Body `{ MatriculaEncargado, ClassUser, Asignado }`. |
| PUT | `/activarCargo/:Id` | — | Activa/desactiva. Body `{ Activo }`. |

## Tiempo real (Socket.IO)
Conexión con `?matricula=<matricula>` → sala `user_<matricula>`. Eventos: `new_permission_request`,
`new_authorization_assigned`, `permission_status_changed`, `permission_finalized`,
`permission_cancelled`, `check_updated`, `document_rejected`. Detalle en API.md §12.
