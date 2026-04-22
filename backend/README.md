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

## Учётные записи (seeded)

| Логин | Пароль   | Роль  |
|-------|----------|-------|
| admin | admin123 | admin |
| user  | user123  | user  |

---

## Эндпоинты

| Метод    | Путь                | Роль  | Описание                        |
|----------|---------------------|-------|---------------------------------|
| `POST`   | `/auth/login`       | —     | Получить JWT-токен              |
| `POST`   | `/documents`        | admin | Загрузить PDF                   |
| `GET`    | `/documents`        | any   | Список документов               |
| `GET`    | `/documents/{id}`   | any   | Получить ссылку для скачивания  |
| `DELETE` | `/documents/{id}`   | admin | Удалить документ                |

---

## Пример использования (curl)

```bash
# Получить токен
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -d "username=admin&password=admin123" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Загрузить PDF
curl -X POST http://localhost:8000/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/file.pdf"

# Список документов
curl http://localhost:8000/documents \
  -H "Authorization: Bearer $TOKEN"

# Скачать документ
curl http://localhost:8000/documents/{id} \
  -H "Authorization: Bearer $TOKEN"

# Удалить документ
curl -X DELETE http://localhost:8000/documents/{id} \
  -H "Authorization: Bearer $TOKEN"
```
