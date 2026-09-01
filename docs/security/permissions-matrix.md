# UniPass — Matriz de permisos

> **Estado: FASE C (infra + piloto) implementada (2026-08-30).** Acompaña a
> [authorization-model.md](authorization-model.md). Las capabilities se guardan en **`CapabilityGrant`**
> (tabla nueva). Solo `/admin/*` está **migrado** al nuevo modelo (permiso+scope); el resto sigue legacy.
> Marcado por endpoint: **✅MIGRADO** / **⚠️legacy** / **⏳abierto**.

## 1. Capability → Permisos → Scope

| Capability | Permisos | Scope |
|---|---|---|
| **SUPERVISOR** | USERS_VIEW, PERMISSIONS_VIEW, DOCUMENTS_VIEW, CHECKS_VIEW, DASHBOARD_VIEW, REPORTS_VIEW | según asignación (hoy GLOBAL solo-lectura) |
| **CHECKER** | CHECKS_VIEW, CHECKS_MANAGE | DORMITORIO/Caseta del grant (Tipo+IdDormitorio+Scope) |
| **ADMIN** | todos los VIEW + USERS_MANAGE, PERMISSIONS_MANAGE, DOCUMENTS_MANAGE, CHECKS_MANAGE, CAPABILITIES_VIEW | según regla admin (operativo) |
| **SUPERADMIN** | **TODOS** (VIEW+MANAGE) + CAPABILITIES_MANAGE + AUDIT_VIEW + CONFIG_MANAGE | **GLOBAL** |

Notas:
- SUPERVISOR **nunca** recibe MANAGE.
- ADMIN **no** recibe CAPABILITIES_MANAGE, AUDIT_VIEW, CONFIG_MANAGE ni administración de SUPERADMIN.
- SUPERADMIN abarca administrativamente ADMIN/SUPERVISOR/CHECKER cuando corresponde.

## 2. TipoUser (identidad) → scope base (NO es capability)

| TipoUser | Scope base | Capability por defecto |
|---|---|---|
| ALUMNO | SELF | ninguna (solo lo suyo) |
| EMPLEADO | SELF (institucional) | ninguna hasta que se le otorgue |
| PRECEPTOR | DORMITORIO | ninguna extra; puede recibir CHECKER |
| VIGILANCIA | Caseta/institucional | puede recibir CHECKER |
| ADMINISTRATIVO | (coordinador dorm) | **ADMIN** por puente transitorio (a desacoplar) |

## 3. Endpoint → Permiso → Scope (objetivo)

> Estas asignaciones son el **destino** del modelo; su cableado ocurre por endpoint en fases
> (7.3/7.4B/lecturas). Marcadas ✅ = ya protegido hoy (con capability actual), ⏳ = pendiente.

### Usuarios
| M | Endpoint | Permiso | Scope | Hoy |
|---|---|---|---|---|
| GET | /user/:Id | USERS_VIEW | SELF o DORMITORIO/GLOBAL | ⏳ abierto (BOLA) |
| GET | /userMatricula/:Matricula | USERS_VIEW | idem | ⏳ abierto |
| PUT | /cambiarCargo/:Matricula | USERS_MANAGE | GLOBAL | ⏳ abierto |
| PUT | /terminarCargo/:Matricula | USERS_MANAGE | GLOBAL | ⏳ abierto |
| POST | /register | (público, TipoUser desde ULV) | — | ⏳ rediseño B.8 |

### Permisos de salida
| M | Endpoint | Permiso | Scope | Hoy |
|---|---|---|---|---|
| GET | /permission/:Id | PERMISSIONS_VIEW | SELF (dueño) / DORMITORIO / GLOBAL | ⏳ abierto (BOLA) |
| POST | /permission | PERMISSIONS_MANAGE (self-create) | SELF | ✅ token (IdUser del token) |
| PUT | /permission/:Id (cancelar) | PERMISSIONS_MANAGE | SELF (dueño) | ✅ ownership |
| DELETE | /permission/:Id | PERMISSIONS_MANAGE | GLOBAL | ✅ ADMIN |
| PUT | /permissionValorado/:Id | PERMISSIONS_APPROVE/REJECT* | DORMITORIO/cadena | ⏳ 7.4B |
| PUT | /autorizarPermission/:Id | PERMISSIONS_APPROVE/REJECT* | cadena (autorizador asignado) | ⏳ 7.4B |
| POST | /authorize | PERMISSIONS_MANAGE | — | ⏳ 7.4B (rediseño) |
| GET | bandejas, /permissionTop/*, /dashboard*, /permissions/filter | PERMISSIONS_VIEW / DASHBOARD_VIEW | DORMITORIO/GLOBAL | ⏳ abierto (BOLA) |

\* `PERMISSIONS_APPROVE`/`PERMISSIONS_REJECT`: granularidad candidata (ver authorization-model B.2), a decidir en 7.4B.

### Documentos
| M | Endpoint | Permiso | Scope | Hoy |
|---|---|---|---|---|
| POST/PUT/DELETE | /doctosMul* | DOCUMENTS_MANAGE | SELF (dueño) | ✅ token+ownership (7.2) |
| GET | /doctos/:Id, /doctosProfile/:id | DOCUMENTS_VIEW | SELF/DORMITORIO | ⏳ abierto |
| GET | /getExpediente/:IdDormi, /getArchivos/... | DOCUMENTS_VIEW | DORMITORIO | ⏳ abierto |
| PUT | /statusRevision/:Id, /doctosMul/reject/:Id | DOCUMENTS_MANAGE | DORMITORIO | ⏳ 7.3 |
| PUT | /Documentacion/:Matricula | DOCUMENTS_MANAGE | DORMITORIO | ⏳ abierto |

### Checks / Vigilancia
| M | Endpoint | Permiso | Scope | Hoy |
|---|---|---|---|---|
| PUT | /checks/:id | CHECKS_MANAGE | DORMITORIO/Caseta del grant | ✅ CHECKER+orden (7.4A) |
| GET | /checksDormitorio, /checksVigilancia, ... | CHECKS_VIEW | DORMITORIO/Caseta | ⏳ abierto |
| ~~POST~~ | ~~/checks~~ | — | — | ✅ **RETIRADO (Checks C2)** → 404; creación server-side al aprobar |

### Admin / Reportes / Capabilities / Config / Auditoría
| M | Endpoint | Permiso | Scope | Hoy |
|---|---|---|---|---|
| GET | /admin/dashboard | DASHBOARD_VIEW | GLOBAL | **✅MIGRADO** (requirePermission+scope) |
| GET | /admin/reporte, /admin/observaciones | REPORTS_VIEW | GLOBAL | **✅MIGRADO** |
| GET | /getCapabilities | (self) | SELF | ✅ token |
| POST/GET/PUT/DELETE | /checkerGrant* | CAPABILITIES_MANAGE / _VIEW | DORMITORIO/institucional | ✅ rol PRECEPTOR/VIGILANCIA |
| POST/DELETE | /supervisorGrant* | CAPABILITIES_MANAGE | GLOBAL | ✅ ADMIN |
| — | (futuro) /superadminGrant* | CAPABILITIES_MANAGE (SUPERADMIN-only) | GLOBAL | ⏳ FASE C |
| — | (futuro) /audit | AUDIT_VIEW | GLOBAL | ⏳ FASE C |
| — | (futuro) config | CONFIG_VIEW/MANAGE | GLOBAL | ⏳ FASE C |

### Catálogos / lookups
| M | Endpoint | Permiso | Scope | Hoy |
|---|---|---|---|---|
| GET | /dormitorio, /getPoints, /asignarPrece, /autorizadorSalida, /InfoCargo, /InfoDelegado | (público o VIEW mínimo) | — | ⏳ abierto (P3) |

## 4. Reglas de seguridad transversales
1. Identidad y scope **siempre** del token + BD; nunca de `role`/`capability`/`scope`/`IdEmpleado`/
   `IdDormitorio`/matrícula/`IdUser` enviados por el cliente.
2. Ocultar botones en Flutter **no es seguridad**: el backend rechaza toda operación sin permiso+scope.
3. `permiso` **y** `scope` deben cumplirse (permiso sin scope no basta).
4. Acciones sensibles (MANAGE, CAPABILITIES_MANAGE, CONFIG_MANAGE, SUPERADMIN) → **auditadas**.
5. SUPERADMIN nunca es TipoUser ni se autoasigna; se aprovisiona controladamente.

## 5. Legacy / deprecado (marcado, no borrar)
- Puente `TipoUser ADMINISTRATIVO → ADMIN` (transitorio; ver authorization-model B.10).
- `requireRole('PRECEPTOR','VIGILANCIA')` en `/checkerGrant*` → migrará a `CAPABILITIES_MANAGE` con scope.
- `CheckerGrant.IdPoint` (legado del modelo por punto).
