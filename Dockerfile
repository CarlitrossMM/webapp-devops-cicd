# 1. Imagen base oficial ligera de Node.js (Debian-based glibc compatible con sqlite3)
FROM node:18-slim

# 2. Variables de entorno de producción
ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_DB_FILE=/app/data/database.sqlite

# 3. Directorio de trabajo
WORKDIR /app

# 4. Crear carpeta de persistencia para SQLite y asignar permisos completos al usuario node
RUN mkdir -p /app/data && chown -R node:node /app

# 5. Copiar manifiestos de dependencias con propiedad del usuario node
COPY --chown=node:node package*.json ./

# 6. Instalar dependencias limpias de producción y limpiar caché de npm
RUN npm ci --omit=dev && npm cache clean --force

# 7. Copiar el código de la aplicación con propiedad asignada a node
COPY --chown=node:node . .

# 8. Declarar volumen para la base de datos persistente
VOLUME ["/app/data"]

# 9. Asegurar permisos finales y cambiar al usuario sin privilegios
RUN chown -R node:node /app/data
USER node

# 10. Exponer el puerto de la aplicación
EXPOSE 3000

# 11. Ejecución directa del servidor Node.js
CMD ["node", "server.js"]