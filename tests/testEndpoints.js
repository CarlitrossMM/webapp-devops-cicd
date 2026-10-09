const request = require('supertest');
process.env.SQLITE_DB_FILE = ':memory:';
const app = require('../server.js');

afterAll(async () => {
    await app.locals.closeDatabase();
});

const crearUsuario = async (datos = { name: 'Ada Lovelace', email: 'ada@example.com' }) =>
    request(app).post('/users').send(datos);

const crearProducto = async (datos = { name: 'Teclado', price: 89.99 }) =>
    request(app).post('/products').send(datos);

const obtenerIdCreado = (response) => response.body.data?.[0]?.id;

describe('API HTTP - pruebas de endpoints', () => {
    describe('GET /health', () => {
        it('responde 200 con estado correcto', async () => {
            const response = await request(app).get('/health');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('ok');
        });

        it('devuelve una respuesta JSON', async () => {
            const response = await request(app).get('/health');

            expect(response.headers['content-type']).toMatch(/application\/json/);
            expect(response.body).toEqual({ status: 'ok' });
        });
    });

    describe('GET /api/health', () => {
        it('responde 200 con estado UPy, uptime y timestamp', async () => {
            const response = await request(app).get('/api/health');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('UPy');
            expect(typeof response.body.uptime).toBe('number');
            expect(typeof response.body.timestamp).toBe('string');
        });

        it('devuelve una respuesta en formato JSON', async () => {
            const response = await request(app).get('/api/health');

            expect(response.headers['content-type']).toMatch(/application\/json/);
        });
    });

    describe('GET /', () => {
        it('responde con mensaje de API funcionando', async () => {
            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            expect(response.body.data[0].message).toBe("API funcionando correctamente");
        });
    });

    describe('GET /users', () => {
        it('devuelve una lista de usuarios', async () => {
            const response = await request(app).get('/users');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('incluye los usuarios creados en la lista', async () => {
            const created = await crearUsuario({ name: 'Grace Hopper', email: 'grace@example.com' });
            const response = await request(app).get('/users');

            expect(created.status).toBe(201);
            expect(response.body.data).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: obtenerIdCreado(created), name: 'Grace Hopper' })
            ]));
        });
    });

    describe('POST /users', () => {
        it('crea un usuario con datos válidos', async () => {
            const response = await crearUsuario();

            expect(response.status).toBe(201);
            expect(response.body.data[0]).toEqual(expect.objectContaining({
                name: 'Ada Lovelace',
                email: 'ada@example.com'
            }));
        });

        it('falla si falta el correo electrónico', async () => {
            const response = await crearUsuario({ name: 'Grace Hopper' });

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/email.*obligatorio/i);
        });
    });

    describe('GET /users/:id', () => {
        it('obtiene un usuario existente', async () => {
            const created = await crearUsuario();
            const response = await request(app).get(`/users/${obtenerIdCreado(created)}`);

            expect(response.status).toBe(200);
            expect(response.body.data[0].email).toBe('ada@example.com');
        });

        it('devuelve 404 si el id no existe', async () => {
            const response = await request(app).get('/users/2147483647');

            expect(response.status).toBe(404);
        });
    });

    describe('PUT /users/:id', () => {
        it('actualiza un usuario existente', async () => {
            const created = await crearUsuario();
            const response = await request(app)
                .put(`/users/${obtenerIdCreado(created)}`)
                .send({ name: 'Ada Byron', email: 'ada.byron@example.com' });

            expect(response.status).toBe(200);
            expect(response.body.data[0]).toEqual(expect.objectContaining({
                name: 'Ada Byron',
                email: 'ada.byron@example.com'
            }));
        });

        it('devuelve 404 al actualizar un usuario inexistente', async () => {
            const response = await request(app)
                .put('/users/2147483647')
                .send({ name: 'Usuario ausente', email: 'ausente@example.com' });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /users/:id', () => {
        it('elimina un usuario existente', async () => {
            const created = await crearUsuario();
            const response = await request(app).delete(`/users/${obtenerIdCreado(created)}`);

            expect(response.status).toBe(200);
            expect(response.body.data[0].deletedId).toBe(String(obtenerIdCreado(created)));
        });

        it('devuelve 404 al eliminar un usuario inexistente', async () => {
            const response = await request(app).delete('/users/2147483647');

            expect(response.status).toBe(404);
        });
    });

    describe('GET /products', () => {
        it('devuelve una lista de productos', async () => {
            const response = await request(app).get('/products');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('incluye los productos creados en la lista', async () => {
            const created = await crearProducto({ name: 'Lámpara', price: 35 });
            const response = await request(app).get('/products');

            expect(response.body.data).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: obtenerIdCreado(created), name: 'Lámpara', price: 35 })
            ]));
        });
    });

    describe('POST /products', () => {
        it('crea un producto con nombre y precio válidos', async () => {
            const response = await crearProducto();

            expect(response.status).toBe(201);
            expect(response.body.data[0]).toEqual(expect.objectContaining({ name: 'Teclado', price: 89.99 }));
        });

        it('rechaza un precio que no es numérico', async () => {
            const response = await crearProducto({ name: 'Monitor', price: 'caro' });

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /products/:id', () => {
        it('actualiza un producto existente', async () => {
            const created = await crearProducto();
            const response = await request(app)
                .put(`/products/${obtenerIdCreado(created)}`)
                .send({ name: 'Teclado mecánico', price: 99.99 });

            expect(response.status).toBe(200);
            expect(response.body.data[0]).toEqual(expect.objectContaining({ name: 'Teclado mecánico', price: 99.99 }));
        });

        it('devuelve 404 al actualizar un producto inexistente', async () => {
            const response = await request(app)
                .put('/products/2147483647')
                .send({ name: 'Producto ausente', price: 10 });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /products/:id', () => {
        it('elimina un producto existente', async () => {
            const created = await crearProducto();
            const response = await request(app).delete(`/products/${obtenerIdCreado(created)}`);

            expect(response.status).toBe(200);
            expect(response.body.data[0].deletedId).toBe(String(obtenerIdCreado(created)));
        });

        it('devuelve 404 al eliminar un producto inexistente', async () => {
            const response = await request(app).delete('/products/2147483647');

            expect(response.status).toBe(404);
        });
    });

    describe('POST /db/clear', () => {
        it('limpia los registros de la base de datos', async () => {
            await crearUsuario({ name: 'User Test', email: 'test@example.com' });
            const response = await request(app).post('/db/clear');

            expect(response.status).toBe(200);
            expect(response.body.data[0].message).toMatch(/vaciada exitosamente/i);
        });
    });

    describe('Validaciones adicionales de rutas', () => {
        it('falla al actualizar usuario con datos incompletos', async () => {
            const created = await crearUsuario();
            const response = await request(app)
                .put(`/users/${obtenerIdCreado(created)}`)
                .send({ name: '' });

            expect(response.status).toBe(400);
        });

        it('falla con id no numérico en usuario', async () => {
            const response = await request(app).get('/users/invalido');
            expect(response.status).toBe(400);
        });
    });

    describe('Control de Códigos de Estado y Fallos (Status Codes & 202 Accepted)', () => {
        it('POST /db/backup responde 202 Accepted', async () => {
            const response = await request(app).post('/db/backup');

            expect(response.status).toBe(202);
            expect(response.body.status).toBe('ACCEPTED');
            expect(response.body.data[0].message).toMatch(/backup/i);
        });

        it('POST /api/tasks/async responde 202 Accepted para tareas en segundo plano', async () => {
            const response = await request(app)
                .post('/api/tasks/async')
                .send({ taskName: 'sincronizacion-productos' });

            expect(response.status).toBe(202);
            expect(response.body.status).toBe('ACCEPTED');
            expect(response.body.data[0].taskName).toBe('sincronizacion-productos');
        });

        it('POST /api/tasks/async responde 400 Bad Request si falta el nombre de tarea', async () => {
            const response = await request(app)
                .post('/api/tasks/async')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.status).toBe('ERROR');
        });

        it('GET /api/status/202 responde 202 con mensaje de Accepted', async () => {
            const response = await request(app).get('/api/status/202');

            expect(response.status).toBe(202);
            expect(response.body.status).toBe('ACCEPTED');
            expect(response.body.data[0].requestedCode).toBe(202);
        });

        it('GET /api/status/400 responde 400 con mensaje de Bad Request', async () => {
            const response = await request(app).get('/api/status/400');

            expect(response.status).toBe(400);
            expect(response.body.status).toBe('ERROR');
        });

        it('GET /api/status/999 falla con 400 por código inválido', async () => {
            const response = await request(app).get('/api/status/999');

            expect(response.status).toBe(400);
        });

        it('devuelve 404 estructurado ante rutas no encontradas', async () => {
            const response = await request(app).get('/api/ruta-que-no-existe-xyz');

            expect(response.status).toBe(404);
            expect(response.body.status).toBe('ERROR');
            expect(response.body.error).toMatch(/no encontrada/i);
        });
    });
});