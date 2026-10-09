const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const net = require('net'); // <-- NUEVO: Importar módulo net para TCP

const app = express();
app.use(express.json());

// Control de fallos: captura de errores de formato JSON en el body (400 Bad Request)
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return badRequest(res, 'Sintaxis JSON inválida en el cuerpo de la petición');
    }
    next(err);
});

// Inicializar Base de Datos SQLite
const dbFile = process.env.SQLITE_DB_FILE || path.join(__dirname, 'data', 'database.sqlite');
if (dbFile !== ':memory:') {
    const dbDir = path.dirname(dbFile);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
}
const db = new sqlite3.Database(dbFile);
app.locals.closeDatabase = () => new Promise((resolve, reject) => {
    db.close((err) => err ? reject(err) : resolve());
});

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT, name TEXT, price REAL)");
    db.run("ALTER TABLE users ADD COLUMN email TEXT", () => {});
    db.run("ALTER TABLE products ADD COLUMN name TEXT", () => {});
    db.run("ALTER TABLE products ADD COLUMN price REAL", () => {});
});

// ================= CONTROL DE RESPUESTAS Y STATUS CODES =================

const STATUS_MESSAGES = {
    200: 'Operación completada exitosamente',
    201: 'Recurso creado exitosamente',
    202: 'Solicitud aceptada para procesamiento diferido (Accepted)',
    204: 'Sin contenido',
    400: 'Petición incorrecta o parámetros inválidos',
    404: 'Recurso no encontrado',
    409: 'Conflicto con el estado actual del recurso',
    422: 'Entidad no procesable',
    500: 'Error interno en el servidor o base de datos',
    503: 'Servicio no disponible temporalmente'
};

const formatResponse = (res, statusCode, data = [], message = null) => {
    const isError = statusCode >= 400;
    const defaultMsg = STATUS_MESSAGES[statusCode] || (isError ? 'Error en la solicitud' : 'Operación exitosa');
    const msg = message || defaultMsg;

    const payload = {
        statusCode,
        status: isError ? 'ERROR' : (statusCode === 202 ? 'ACCEPTED' : 'SUCCESS'),
        message: msg,
        data: Array.isArray(data) ? data : [data]
    };

    if (isError) {
        payload.error = msg;
    }

    return res.status(statusCode).json(payload);
};

const badRequest = (res, message) => formatResponse(res, 400, [], message);
const notFound = (res, message = 'Recurso no encontrado') => formatResponse(res, 404, [], message);
const internalError = (res, message = 'Error interno del servidor') => formatResponse(res, 500, [], message);
const accepted = (res, data = [], message = 'Solicitud aceptada para procesamiento') => formatResponse(res, 202, data, message);

// ================= ENDPOINTS HTTP =================

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
app.get('/', (req, res) => formatResponse(res, 200, [{ message: "API funcionando correctamente" }]));
app.get('/users', (req, res) => {
    db.all("SELECT * FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        formatResponse(res, 200, rows);
    });
});
app.post('/users', (req, res) => {
    const { name, email } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) return badRequest(res, 'El nombre es obligatorio');
    if (typeof email !== 'string' || !email.trim()) return badRequest(res, 'El email es obligatorio');

    db.run("INSERT INTO users (name, email) VALUES (?, ?)", [name.trim(), email.trim()], function(err) {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        formatResponse(res, 201, [{ id: this.lastID, name: name.trim(), email: email.trim() }]);
    });
});
app.get('/users/:id', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return badRequest(res, 'El id del usuario debe ser numérico');
    db.get("SELECT * FROM users WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        if (!row) return res.status(404).json({ statusCode: 404, error: 'Usuario no encontrado' });
        formatResponse(res, 200, [row]);
    });
});
app.put('/users/:id', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return badRequest(res, 'El id del usuario debe ser numérico');
    const { name, email } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim()) {
        return badRequest(res, 'El nombre y el email son obligatorios');
    }

    db.run("UPDATE users SET name = ?, email = ? WHERE id = ?", [name.trim(), email.trim(), req.params.id], function(err) {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        if (!this.changes) return res.status(404).json({ statusCode: 404, error: 'Usuario no encontrado' });
        formatResponse(res, 200, [{ id: Number(req.params.id), name: name.trim(), email: email.trim() }]);
    });
});
app.delete('/users/:id', (req, res) => {
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        if (!this.changes) return res.status(404).json({ statusCode: 404, error: 'Usuario no encontrado' });
        formatResponse(res, 200, [{ deletedId: req.params.id }]);
    });
});
app.get('/products', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        formatResponse(res, 200, rows);
    });
});
app.post('/products', (req, res) => {
    const { name, item, price } = req.body || {};
    const productName = name ?? item;
    if (typeof productName !== 'string' || !productName.trim()) return badRequest(res, 'El nombre del producto es obligatorio');
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return badRequest(res, 'El precio debe ser un número no negativo');

    db.run("INSERT INTO products (item, name, price) VALUES (?, ?, ?)", [productName.trim(), productName.trim(), price], function(err) {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        formatResponse(res, 201, [{ id: this.lastID, item: productName.trim(), name: productName.trim(), price }]);
    });
});
app.put('/products/:id', (req, res) => {
    const { name, item, price } = req.body || {};
    const productName = name ?? item;
    if (typeof productName !== 'string' || !productName.trim()) return badRequest(res, 'El nombre del producto es obligatorio');
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return badRequest(res, 'El precio debe ser un número no negativo');

    db.run("UPDATE products SET item = ?, name = ?, price = ? WHERE id = ?", [productName.trim(), productName.trim(), price, req.params.id], function(err) {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        if (!this.changes) return res.status(404).json({ statusCode: 404, error: 'Producto no encontrado' });
        formatResponse(res, 200, [{ id: Number(req.params.id), item: productName.trim(), name: productName.trim(), price }]);
    });
});
app.delete('/products/:id', (req, res) => {
    db.run("DELETE FROM products WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        if (!this.changes) return res.status(404).json({ statusCode: 404, error: 'Producto no encontrado' });
        formatResponse(res, 200, [{ deletedId: req.params.id }]);
    });
});
app.post('/db/clear', (req, res) => {
    db.run("DELETE FROM users", (err) => {
        if (err) return res.status(500).json({ statusCode: 500, error: err.message });
        db.run("DELETE FROM products", (productErr) => {
            if (productErr) return res.status(500).json({ statusCode: 500, error: productErr.message });
            formatResponse(res, 200, [{ message: "Base de datos vaciada exitosamente" }]);
        });
    });
});
app.post('/db/backup', (req, res) => {
    if (dbFile === ':memory:') {
        return accepted(res, [{ message: "Backup en memoria simulado y aceptado", file: ":memory:" }], "Solicitud de backup aceptada para procesamiento diferido");
    }
    const backupTarget = path.join(path.dirname(dbFile), 'backup.sqlite');
    fs.copyFile(dbFile, backupTarget, (err) => {
        if (err) return internalError(res, "Error al crear backup: " + err.message);
        // Operación diferida/asíncrona devuelve 202 Accepted
        accepted(res, [{ message: "Backup en proceso y aceptado", file: "backup.sqlite" }], "Solicitud de backup aceptada para procesamiento diferido");
    });
});

// Endpoint demostrativo de procesamiento diferido / asíncrono (202 Accepted)
app.post('/api/tasks/async', (req, res) => {
    const { taskName } = req.body || {};
    if (!taskName || typeof taskName !== 'string' || !taskName.trim()) {
        return badRequest(res, 'El nombre de la tarea (taskName) es obligatorio');
    }

    accepted(res, [{
        taskId: `job_${Date.now()}`,
        taskName: taskName.trim(),
        state: 'ACCEPTED',
        createdAt: new Date().toISOString()
    }], 'Solicitud de tarea aceptada para procesamiento en segundo plano');
});

// Endpoint de control y prueba de códigos de estado HTTP (ej: 200, 202, 400, 404, 500)
app.all('/api/status/:code', (req, res) => {
    const code = parseInt(req.params.code, 10);
    if (isNaN(code) || code < 100 || code > 599) {
        return badRequest(res, 'Código de estado HTTP inválido');
    }
    const customMessage = req.query.message || req.body?.message;
    return formatResponse(res, code, [{ requestedCode: code }], customMessage);
});

// ================= MIDDLEWARES DE CONTROL DE FALLOS =================

// Control de fallos para rutas no encontradas (404 Not Found)
app.use((req, res) => {
    notFound(res, `Ruta no encontrada: ${req.method} ${req.originalUrl}`);
});

// Control de fallos global para excepciones no capturadas (500 Internal Server Error)
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    const statusCode = err.statusCode || (err.status >= 400 && err.status < 600 ? err.status : 500);
    return formatResponse(res, statusCode, [], err.message || 'Error interno del servidor');
});

// ================= SERVIDOR SOCKET TCP (Puerto 6061) =================

const tcpServer = net.createServer((socket) => {
    console.log('Cliente TCP conectado');

    socket.on('data', (data) => {
        const message = data.toString().trim();
        console.log(`Mensaje TCP recibido: ${message}`);

        // 1. Comando INSERT: {insert:<element>}
        const insertMatch = message.match(/^\{insert:(.+)\}$/);
        if (insertMatch) {
            const element = insertMatch[1];
            db.run("INSERT INTO products (item) VALUES (?)", [element], function(err) {
                if (err) {
                    socket.write(JSON.stringify({ statusCode: 500, error: err.message }) + "\n");
                } else {
                    socket.write(JSON.stringify({ statusCode: 200, data: [{ id: this.lastID, item: element }] }) + "\n");
                }
            });
            return;
        }

        // 2. Comando GET: {get:<element>}
        const getMatch = message.match(/^\{get:(.+)\}$/);
        if (getMatch) {
            const element = getMatch[1];
            db.all("SELECT * FROM products WHERE item = ?", [element], (err, rows) => {
                if (err) {
                    socket.write(JSON.stringify({ statusCode: 500, error: err.message }) + "\n");
                } else {
                    socket.write(JSON.stringify({ statusCode: 200, data: rows }) + "\n");
                }
            });
            return;
        }

        socket.write(JSON.stringify({ statusCode: 400, error: "Formato inválido. Usa {insert:elemento} o {get:elemento}" }) + "\n");
    });

    socket.on('error', (err) => {
        console.error('Error en socket TCP:', err.message);
    });
});

const PORT = process.env.PORT || 3000;
const TCP_PORT = process.env.TCP_PORT || 6061;

if (require.main === module) {
    app.listen(PORT, () => console.log(`Servidor HTTP corriendo en el puerto ${PORT}`));
    tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
        console.log(`Servidor TCP Socket corriendo en el puerto ${TCP_PORT}`);
    });
}

module.exports = app;