# Tourney FC — Backend

API REST para la gestión de torneos de fútbol, desarrollada con NestJS, Prisma y PostgreSQL.

---

## Requisitos previos

- Node.js v18 o superior
- npm v9 o superior
- Acceso a la base de datos PostgreSQL del proyecto

---

## Instalación

```bash
npm install
npx prisma generate
```

> `prisma generate` es obligatorio después de cada `npm install` porque el cliente de Prisma se genera localmente y no se incluye en el repositorio.

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto (puedes copiar `.env.example`)
con las siguientes variables:

```env
# Base de datos PostgreSQL
DATABASE_URL="postgresql://usuario:contraseña@host:puerto/nombre_db?sslmode=disable"

# Autenticación
JWT_SECRET="un_secreto_largo_y_seguro"

# Servidor
PORT=3000

# Envío de correos (invitaciones, recuperación de contraseña)
EMAIL_HOST="smtp.ejemplo.com"
EMAIL_PORT=587
EMAIL_USER="usuario@ejemplo.com"
EMAIL_PASS="contraseña_del_correo"
EMAIL_FROM="Tourney FC <no-reply@ejemplo.com>"

# Almacenamiento de imágenes / escudos
CLOUDINARY_URL="cloudinary://api_key:api_secret@cloud_name"

# Enlaces de invitación y de la app móvil
INVITE_LINK_BASE_URL="https://tu-dominio.com/invite"
APP_DEEPLINK="tourneyfcapp://"
ANDROID_STORE_URL="https://play.google.com/store/apps/details?id=com.crhistofervera.tourneyfcapp"
IOS_STORE_URL="https://apps.apple.com/app/idXXXXXXXX"
```

Solicita los valores reales al administrador del proyecto. No compartas ni subas el `.env` al repositorio.

---

## Ejecución

```bash
# Modo desarrollo con recarga automática
npm run start:dev

# Modo producción
npm run start:prod
```

---

## Prisma

### Generar el cliente

Debe ejecutarse después de cada `npm install` o cuando se modifique el `schema.prisma`:

```bash
npx prisma generate
```

### Aplicar migraciones

Aplica las migraciones pendientes sobre la base de datos:

```bash
# En desarrollo (crea la migración y la aplica)
npx prisma migrate dev --name nombre_descriptivo

# En producción (solo aplica migraciones existentes)
npx prisma migrate deploy
```

### Prisma Studio

Interfaz visual para explorar y editar los datos de la base de datos directamente desde el navegador:

```bash
npx prisma studio
```

Se abre en `http://localhost:5555` por defecto. Es útil para verificar datos durante el desarrollo, pero no debe usarse para modificar datos en producción.

### Datos de prueba (seeds)

El proyecto incluye varios scripts para poblar la base de datos con torneos de ejemplo, útiles para la demostración:

```bash
npm run seed:demo        # Liga de demostración
npm run seed:demo-copa   # Copa de demostración
npm run seed:liga8       # Liga con 8 equipos
npm run seed:copa8       # Copa con 8 equipos
npm run seed:clean       # Limpia los datos cargados
```

---

## Documentación de la API (Swagger)

Con el servidor corriendo, accede a:

```
http://localhost:3000/api
```

Desde ahí se pueden ver todos los endpoints disponibles, la estructura de los request y response, y probar los endpoints directamente. Los endpoints protegidos requieren un token JWT, que se obtiene desde `POST /auth/login`. En Swagger, usa el botón **Authorize** para ingresar el token.

---

## Pruebas

### Ejecutar todos los tests

```bash
npm run test
```

### Ejecutar en modo watch (se re-ejecutan al guardar cambios)

```bash
npm run test:watch
```

### Ver cobertura de código

```bash
npm run test:cov
```

### Generar reporte visual HTML

```bash
npm run test
```

Después de correr los tests, se genera automáticamente el archivo `test-report/index.html`. Ábrelo en cualquier navegador para ver el resultado de cada prueba de forma visual, incluyendo los que pasaron, los que fallaron y los mensajes de error correspondientes.

> La carpeta `test-report/` está incluida en el `.gitignore` y no se sube al repositorio.

---

## Estructura del proyecto

```
src/
  auth/         # Registro e inicio de sesión, guards y estrategia JWT
  users/        # Gestión del perfil de usuario
  prisma/       # Servicio y módulo de Prisma
prisma/
  schema.prisma # Definición del modelo de datos
  migrations/   # Historial de migraciones aplicadas
```

---

## Convención de commits

Se utiliza el estándar Conventional Commits:

```
feat: nueva funcionalidad
fix: corrección de error
docs: cambios en documentación
refactor: mejora interna sin cambio de funcionalidad
```