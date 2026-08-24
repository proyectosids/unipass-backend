# UniPass API — Diagrama de base de datos

Modelo de datos real de la BD **`UNIPASS`** (SQL Server): **15 tablas, 15 foreign keys**.
Las tablas viven en el **esquema `UNIPASS`** → se referencian como **`UNIPASS.<Tabla>`**
(ej. `UNIPASS.LoginUniPass`). La tabla de usuarios es **`LoginUniPass`** (fuente de verdad).
Ver también [03-arquitectura.md](03-arquitectura.md) y [ENDPOINTS.md](ENDPOINTS.md).

**Scripts SQL** (`database/schema/`):
- `UNIPASS_full_schema.sql` — creación desde cero: BD + esquema `UNIPASS` + 15 tablas con
  constraints, índices, descripciones (MS_Description) y **datos semilla** (catálogos).
- `UNIPASS_migrate_dbo_to_schema.sql` — para una BD existente en `dbo`: mueve las tablas al
  esquema `UNIPASS` con `ALTER SCHEMA TRANSFER` **sin perder datos**.

## Diagrama entidad-relación (Mermaid)

> Se renderiza en GitHub, VS Code (Markdown Preview Mermaid) y mermaid.live.

```mermaid
erDiagram
    LoginUniPass ||--o{ Permission          : "solicita (IdUser)"
    LoginUniPass ||--o{ CheckerGrant         : "recibe (IdLogin)"
    LoginUniPass ||--o{ Doctos              : "posee (IdLogin)"
    LoginUniPass ||--o{ RefreshToken        : "tiene (IdLogin)"
    LoginUniPass ||--o{ CheckPoints         : "confirma (ConfirmadoPor)"
    LoginUniPass }o--|| Bedroom             : "vive en (Dormitorio)"
    LoginUniPass }o--o| Position            : "suplencia (IdCargoDelegado)"
    LoginUniPass ||..o{ PasswordReset       : "reset (IdLogin, sin FK)"
    LoginUniPass ||..o{ IdempotencyRequest  : "idempotencia (IdLogin, sin FK)"

    Permission   ||--o{ Authorize           : "cadena (IdPermission)"
    Permission   ||--o{ CheckPoints         : "genera (IdPermission)"
    Permission   }o--|| TypeExit            : "tipo (IdTipoSalida)"

    TypeExit     ||--o{ Point               : "puntos (IdExit)"
    Point        ||--o{ CheckPoints         : "en (IdPoint)"
    Point        ||--o{ CheckerGrant        : "legado (IdPoint)"

    DocumentCatalog ||--o{ Doctos           : "catalogo (IdDocumento)"

    LoginUniPass {
        int      IdLogin PK
        varchar  Matricula
        varchar  Contraseña "bcrypt"
        varchar  Correo
        varchar  Nombre
        varchar  Apellidos
        varchar  TipoUser "ALUMNO|EMPLEADO|PRECEPTOR|VIGILANCIA|ADMINISTRATIVO"
        varchar  Sexo
        datetime FechaNacimiento
        varchar  Celular
        int      StatusActividad
        int      Dormitorio FK
        int      IdCargoDelegado FK
        varchar  TokenCFM
        int      Documentacion
    }
    Permission {
        int      IdPermission PK
        datetime FechaSolicitada
        varchar  StatusPermission "Pendiente|Aprobada|Rechazada|Cancelado"
        datetime FechaSalida
        datetime FechaRegreso
        varchar  Motivo
        int      IdUser FK
        int      IdTipoSalida FK
        varchar  Observaciones
        varchar  Aprobo "en desuso"
    }
    Authorize {
        int      IdAuthorize PK
        int      IdEmpleado "= Matricula institucional"
        int      NoDepto
        int      IdPermission FK
        varchar  StatusAuthorize "Pendiente|Aprobada|Rechazada"
        bit      DualRole
        datetime FechaAprobacion
        int      Orden
    }
    CheckPoints {
        int      IdCheck PK
        datetime FechaCheck
        varchar  Estatus "Pendiente|Confirmada"
        varchar  Accion "SALIDA|RETORNO"
        int      IdPoint FK
        int      IdPermission FK
        varchar  Observaciones
        int      ConfirmadoPor FK
    }
    Point {
        int      IdPoint PK
        varchar  NombrePunto "Dormitorio|Caseta"
        int      IdExit FK
    }
    TypeExit {
        int      IdTypeExit PK
        varchar  Descripcion "PUEBLO|ESPECIAL|A CASA|FIN DE CURSO"
    }
    Bedroom {
        int      IdBedroom PK
        varchar  Identificador "id institucional (315..351)"
        varchar  Nombre
        varchar  NivelDormitorio
        varchar  Sexo
    }
    Position {
        int      IdCargo PK
        varchar  MatriculaEncargado
        varchar  ClassUser
        varchar  Asignado
        int      Activo
    }
    CheckerGrant {
        int      IdGrant PK
        int      IdLogin FK
        int      IdPoint FK "legado (nullable)"
        nvarchar Scope "SALIDA|RETORNO|AMBOS"
        int      AsignadoPor FK
        bit      Activo
        nvarchar Vigencia "TEMPORAL|PERMANENTE"
        datetime FechaExpira
        datetime FechaCreacion
        nvarchar Tipo "Dormitorio|Caseta"
        int      IdDormitorio
        nvarchar Capability "CHECKER|SUPERVISOR"
    }
    Doctos {
        int      IdDoctos PK
        int      IdDocumento FK
        varchar  Archivo
        varchar  StatusDoctos
        int      IdLogin FK
        varchar  StatusRevision "Pendiente|Aprobado|Rechazado"
        varchar  MotivoRechazo
        nvarchar ComentarioRechazo
        varchar  RechazadoPor
        datetime FechaRechazo
    }
    DocumentCatalog {
        int      IdDocument PK
        varchar  TipoDocumento
        varchar  Estado
    }
    RefreshToken {
        int      RefreshTokenId PK
        int      IdLogin FK
        varchar  TokenHash "SHA-256"
        datetime ExpiresAt
        datetime CreatedAt
        datetime RevokedAt
        varchar  ReplacedByTokenHash
        varchar  DeviceInfo
    }
    PasswordReset {
        int      Id PK
        int      IdLogin
        nvarchar ResetTokenHash "SHA-256"
        datetime ExpiraEn
        datetime UsadoEn
        datetime FechaCreacion
    }
    IdempotencyRequest {
        nvarchar IdempotencyKey PK
        int      IdLogin
        int      IdPermission
        datetime FechaCreacion
    }
    Configuracion {
        nvarchar Clave PK
        nvarchar Valor
        nvarchar Descripcion
    }
```

## Foreign keys (15, reales)

| Tabla.columna | → Referencia | Relación |
|---|---|---|
| `Authorize.IdPermission` | `Permission.IdPermission` | eslabones de la cadena |
| `CheckerGrant.IdLogin` | `LoginUniPass.IdLogin` | beneficiario del grant |
| `CheckerGrant.AsignadoPor` | `LoginUniPass.IdLogin` | quién otorgó |
| `CheckerGrant.IdPoint` | `Point.IdPoint` | legado (modelo por punto) |
| `CheckPoints.IdPoint` | `Point.IdPoint` | punto del check |
| `CheckPoints.IdPermission` | `Permission.IdPermission` | los 4 checks del permiso |
| `CheckPoints.ConfirmadoPor` | `LoginUniPass.IdLogin` | checador que confirmó |
| `Doctos.IdDocumento` | `DocumentCatalog.IdDocument` | tipo de documento |
| `Doctos.IdLogin` | `LoginUniPass.IdLogin` | dueño del documento |
| `LoginUniPass.Dormitorio` | `Bedroom.IdBedroom` | dormitorio del usuario |
| `LoginUniPass.IdCargoDelegado` | `Position.IdCargo` | suplencia activa |
| `Permission.IdUser` | `LoginUniPass.IdLogin` | alumno solicitante |
| `Permission.IdTipoSalida` | `TypeExit.IdTypeExit` | tipo de salida |
| `Point.IdExit` | `TypeExit.IdTypeExit` | puntos por tipo de salida |
| `RefreshToken.IdLogin` | `LoginUniPass.IdLogin` | sesiones del usuario |

> **Relaciones lógicas SIN FK declarada:** `PasswordReset.IdLogin` e `IdempotencyRequest.IdLogin`
> apuntan a `LoginUniPass.IdLogin` por convención de aplicación (no hay constraint en BD; en el
> diagrama van con línea punteada `..`).

## Catálogo de tablas por dominio

**Identidad / sesión**
- **`LoginUniPass`** — usuarios (alumnos y empleados). `TipoUser`: ALUMNO, EMPLEADO, PRECEPTOR,
  VIGILANCIA, ADMINISTRATIVO (DEPARTAMENTO retirado). `Contraseña` = hash bcrypt.
- **`RefreshToken`** — sesiones: hash SHA-256, rotación (`ReplacedByTokenHash`), revocación (`RevokedAt`).
- **`PasswordReset`** — recuperación (Task 7.1.B): solo hash del reset token, expiración, single-use.

**Permisos y autorización**
- **`Permission`** — solicitud de salida. `IdTipoSalida` → `TypeExit`.
- **`TypeExit`** — catálogo de tipos: 1 PUEBLO, 2 ESPECIAL, 3 A CASA, 4 FIN DE CURSO.
- **`Authorize`** — cadena de aprobadores por permiso (`Orden`, `DualRole`). `IdEmpleado` = matrícula institucional.
- **`IdempotencyRequest`** — dedupe de `POST /permission` por `Idempotency-Key` (Task 7.4A).

**Checado**
- **`Point`** — puntos de control (`NombrePunto`: Dormitorio/Caseta) por tipo de salida (`IdExit`).
- **`CheckPoints`** — los 4 checks por permiso (`Accion` × punto); `ConfirmadoPor` = checador.
- **`CheckerGrant`** — capability asignable: `Capability` (CHECKER/SUPERVISOR), `Tipo`
  (Dormitorio/Caseta), `IdDormitorio`, `Scope`, `Vigencia`. `IdPoint` es legado. Unicidad
  `(IdLogin, Tipo, IdDormitorio)`.

**Dormitorios / cargos**
- **`Bedroom`** — dormitorios; `Identificador` es el id institucional usado por API-ULV (`prece/:id`).
- **`Position`** — suplencias entre empleados (mecanismo aparte de CheckerGrant).

**Documentos**
- **`DocumentCatalog`** — catálogo de tipos de documento.
- **`Doctos`** — documentos del expediente (`IdDocumento` = TIPO, compartido entre usuarios; el id
  único por documento es `IdDoctos`). Estados de revisión y datos de rechazo.

**Configuración**
- **`Configuracion`** — clave/valor operable con UPDATE (sin redeploy): `AUTORIZADOR_SALIDAS`,
  `COORDINADOR_IDEMPLEADO`, `COORDINADOR_NODEPTO`.

## Notas de integridad y convenciones

- **Fuente de verdad de usuarios:** `LoginUniPass` (no `db.sql`).
- **`Authorize.IdEmpleado` no es `IdLogin`**: es la **matrícula institucional**; se resuelve a
  `LoginUniPass.Matricula` cuando se necesita la cuenta local.
- **`CheckerGrant.IdPoint`** quedó como columna legado (el modelo vigente es por `Tipo`+`IdDormitorio`).
- **`Doctos.IdDocumento`** identifica el *tipo* de documento (se repite entre usuarios); para ownership
  por documento único usar `IdDoctos`.
- **Datos sensibles** en `LoginUniPass` (`Contraseña`, `TokenCFM`, `Correo`): saneados en los listados
  (checks/permisos/buscarPersona); pendientes en `GET /user/:Id`, `/userMatricula` y el `user` de `/login`.
