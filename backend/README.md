# Backend

FastAPI-бэкенд с JWT-авторизацией, SQLite и хранилищем файлов через MinIO.

## Быстрый старт

### 1. Запустить MinIO

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Консоль MinIO: http://localhost:9001 (minioadmin / minioadmin)

### 2. Установить зависимости

```bash
pip install -r requirements.txt
```

### 3. Запустить сервер

```bash
uvicorn main:app --reload
```

API доступно на http://127.0.0.1:8000  
Swagger-документация: http://127.0.0.1:8000/docs

---

## Создание администратора

Обычная регистрация через `/auth/register` создаёт пользователей с ролью `user`.  
Как создать администратора:

**Через env-переменные при запуске** (создаётся один раз, если пользователя ещё нет):

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=secret uvicorn main:app --reload
```

---

## Эндпоинты

| Метод    | Путь                | Роль  | Описание                        |
|----------|---------------------|-------|---------------------------------|
| `POST`   | `/auth/register`    | —     | Зарегистрировать пользователя   |
| `POST`   | `/auth/login`       | —     | Получить JWT-токен              |
| `GET`    | `/auth/me`          | any   | Информация о текущем юзере      |
| `POST`   | `/documents`        | admin | Загрузить PDF                   |
| `GET`    | `/documents`        | any   | Список документов               |
| `GET`    | `/documents/{id}`   | any   | Получить ссылку для скачивания  |
| `DELETE` | `/documents/{id}`   | admin | Удалить документ                |
