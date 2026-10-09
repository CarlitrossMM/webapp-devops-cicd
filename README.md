# WebApp RESTful API — CI/CD con Docker, GitHub Actions y AWS EC2

API RESTful desarrollada en **Node.js con Express y SQLite**, equipada con una arquitectura de contenedorización segura, cobertura de pruebas unitarias/integrales con Jest (>70%), persistencia de datos en volúmenes y un pipeline de automatización **CI/CD** completo hacia **AWS EC2** y **Docker Hub**.

---

## 1. Arquitectura del Sistema

```mermaid
flowchart TD
    subgraph Local ["Desarrollo Local"]
        Dev[Desarrollador] -->|git push origin main| GH[GitHub Repository]
    end

    subgraph Pipeline ["GitHub Actions CI/CD (.github/workflows/main.yml)"]
        direction TB
        Job1["1. Job CI: Test<br/>- Node.js 18<br/>- npm ci<br/>- npm run test:coverage (>70%)"]
        Job2["2. Job Delivery: Docker Hub<br/>- Docker Login<br/>- Build Image<br/>- Tags: latest y SHA<br/>- Push Image"]
        Job3["3. Job Deploy: AWS EC2<br/>- Conexión SSH segura<br/>- Preparar permisos UID 1000<br/>- docker pull<br/>- docker run con volumen persistente (-p 80:3000)"]
        Job1 --> Job2 --> Job3
    end

    subgraph Registries ["Registros y Nube"]
        DHub[(Docker Hub)]
        EC2[(Instancia AWS EC2<br/>Ubuntu Linux)]
    end

    subgraph Persistence ["Persistencia en EC2"]
        HostVol["/home/ubuntu/api-db<br/>(Almacenamiento Permanente en Host)"]
        ContainerApp["Contenedor: webapp-api<br/>Puerto: 80 -> 3000<br/>Usuario: node (UID 1000)<br/>Ruta: /app/data"]
        HostVol <-->|Montaje de Volumen -v| ContainerApp
    end

    GH --> Pipeline
    Job2 -->|Publica Imagen| DHub
    Job3 -->|Despliega vía SSH| EC2
    EC2 --> Persistence
```

### Principios Clave de Diseño
- **Principio de menor privilegio:** La aplicación se ejecuta bajo el usuario no root `node` (UID 1000) para mitigar vulnerabilidades de seguridad en el contenedor.
- **Persistencia de SQLite:** Se aísla la base de datos en `/app/data` y se ancla al disco duro del host en EC2 mediante un volumen montado (`-v /home/ubuntu/api-db:/app/data`), evitando la pérdida de información en despliegues efímeros.
- **Control centralizado de códigos de estado:** Respuestas homogéneas con soporte para operaciones asíncronas (`202 Accepted`), validaciones de cliente (`400`, `404`) y captura global de excepciones (`500`).

---

## 2. Catálogo de Endpoints Principales

| Método | Endpoint | Código HTTP | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | `200 OK` | Endpoint de diagnóstico de salud (status, uptime, timestamp) |
| `GET` | `/health` | `200 OK` | Diagnóstico de salud base |
| `GET` | `/` | `200 OK` | Mensaje de verificación del estado de la API |
| `ALL` | `/api/status/:code` | Dinámico | Validador y simulador de códigos HTTP (ej: 200, 202, 400, 404, 500) |
| `POST` | `/api/tasks/async` | `202 Accepted` | Aceptación de tareas asíncronas en segundo plano |
| `POST` | `/db/backup` | `202 Accepted` | Backup asíncrono de la base de datos SQLite |
| `POST` | `/db/clear` | `200 OK` | Vaciado completo de las tablas de datos |
| `GET` | `/users` | `200 OK` | Obtener listado de usuarios |
| `POST` | `/users` | `201 Created` | Crear un nuevo usuario (`name`, `email`) |
| `GET` | `/users/:id` | `200` / `404` | Obtener detalle de usuario por ID |
| `PUT` | `/users/:id` | `200` / `404` | Actualizar información de usuario |
| `DELETE` | `/users/:id` | `200` / `404` | Eliminar usuario por ID |
| `GET` | `/products` | `200 OK` | Obtener listado de productos |
| `POST` | `/products` | `201 Created` | Crear un producto (`name`, `price`) |
| `PUT` | `/products/:id` | `200` / `404` | Actualizar producto por ID |
| `DELETE` | `/products/:id` | `200` / `404` | Eliminar producto por ID |

---

## 3. Instalación y Ejecución Local

### Requisitos Previos
- **Node.js** v18 o superior.
- **npm** v9 o superior.
- **Docker Desktop** (opcional para pruebas en contenedores).

### Pasos de Instalación
1. Clona el repositorio o sitúate en el directorio de la aplicación:
   ```bash
   cd webapp-api
   ```

2. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```

3. Inicia la aplicación en modo desarrollo:
   ```bash
   npm start
   ```
   *(La API iniciará escuchando en `http://localhost:3000`)*.

---

## 4. Ejecución de Pruebas y Cobertura (Jest)

La suite de pruebas automatizadas utiliza **Jest** y **Supertest** con base de datos en memoria (`:memory:`):

- **Ejecutar pruebas unitarias:**
  ```bash
  npm test
  ```

- **Ejecutar pruebas con reporte de cobertura de código:**
  ```bash
  npm run test:coverage
  ```

> **Umbral de Calidad:** Configurado en `package.json` para requerir un mínimo estricto del **70% de cobertura de líneas**. Actualmente alcanza **>75%** en 33 pruebas integrales.

---

## 5. Contenedorización con Docker

### A. Construir la Imagen
```bash
docker build -t webapp-api:latest .
```

### B. Crear Directorio Local para el Volumen Persistente
- **PowerShell (Windows):**
  ```powershell
  New-Item -ItemType Directory -Force -Path .\data
  ```
- **Linux / macOS / Git Bash:**
  ```bash
  mkdir -p ./data
  ```

### C. Levantar el Contenedor
- **PowerShell (Windows):**
  ```powershell
  docker run -d --name webapp-api --restart unless-stopped -p 3000:3000 -v ${PWD}/data:/app/data webapp-api:latest
  ```
- **Linux / macOS / Git Bash:**
  ```bash
  docker run -d --name webapp-api --restart unless-stopped -p 3000:3000 -v $(pwd)/data:/app/data webapp-api:latest
  ```

### D. Inspección y Verificación
- Ver logs en vivo del contenedor:
  ```bash
  docker logs -f webapp-api
  ```
- Probar endpoint de salud:
  ```bash
  curl http://localhost:3000/api/health
  ```
- Probar control de código `202 Accepted`:
  ```bash
  curl http://localhost:3000/api/status/202
  ```

### E. Detener y Limpiar el Contenedor
```bash
docker stop webapp-api
docker rm webapp-api
```

---

## 6. Configuración del Pipeline CI/CD en GitHub Actions

El archivo de flujo se encuentra en [.github/workflows/main.yml](.github/workflows/main.yml) y se ejecuta automáticamente ante cada `push` o `pull_request` sobre la rama `main`.

### Variables Secretas Requeridas en GitHub
Ve a tu repositorio en GitHub: **Settings > Secrets and variables > Actions > New repository secret** y registra las siguientes variables:

| Nombre del Secret | Descripción | Ejemplo de Valor |
| :--- | :--- | :--- |
| `DOCKERHUB_USERNAME` | Tu nombre de usuario en Docker Hub | `carlosdev` |
| `DOCKERHUB_TOKEN` | Personal Access Token de Docker Hub (*Read & Write*) | `dckr_pat_xxxx` |
| `EC2_HOST` | Dirección IP pública o DNS IPv4 de la instancia EC2 | `54.210.45.12` |
| `EC2_USER` | Usuario SSH del sistema operativo en EC2 | `ubuntu` |
| `EC2_SSH_KEY` | Contenido íntegro de tu llave privada SSH (`.pem`) | `-----BEGIN RSA PRIVATE KEY-----...` |

### Requisitos Previos en la Instancia AWS EC2 (Ubuntu)
Conéctate una sola vez a tu instancia EC2 por SSH y asegura que Docker esté instalado y configurado:
```bash
sudo apt update && sudo apt install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ubuntu
```
*(Asegúrate de que en el **Security Group** de tu instancia en AWS estén habilitados los puertos de entrada **80 (HTTP)** y **22 (SSH)**)*.

---

## 7. Pasos de Despliegue con Git

Para inicializar tu repositorio local y activar el despliegue automático hacia producción:

```bash
# 1. Inicializar Git y asignar rama main
git init
git branch -M main

# 2. Vincular el repositorio remoto en GitHub
git remote add origin https://github.com/<TU_USUARIO>/<TU_REPOSITORIO>.git

# 3. Preparar archivos para commit (protegidos por .gitignore)
git add .

# 4. Crear commit descriptivo
git commit -m "feat: complete CI/CD pipeline with persistence and status code handling"

# 5. Enviar cambios y disparar pipeline
git push -u origin main
```
> *Si el repositorio en GitHub ya contenía archivos iniciales (README/License), sincroniza primero con:*
> ```bash
> git pull origin main --rebase
> git push -u origin main
> ```

---

## 8. Estructura del Proyecto

```text
webapp-api/
├── .github/
│   └── workflows/
│       └── main.yml           # Flujo de CI/CD (Test -> Delivery -> Deploy)
├── tests/
│   └── testEndpoints.js       # Suite de pruebas unitarias y cobertura Jest
├── .dockerignore              # Exclusiones del contexto de construcción Docker
├── .gitignore                 # Exclusiones del control de versiones Git
├── Dockerfile                 # Imagen Docker optimizada (node:18-slim, non-root)
├── package.json               # Dependencias y scripts de prueba con coverage
├── package-lock.json          # Árbol de dependencias bloqueado
├── server.js                  # Servidor Express, endpoints y conexión SQLite
└── README.md                  # Documentación técnica del proyecto
```
