# Backend

FastAPI-бэкенд с JWT-авторизацией, SQLite и хранилищем файлов через MinIO.

---

## Стек

| Слой | Библиотека |
|---|---|
| API | FastAPI 0.115 |
| БД | SQLite + SQLAlchemy 2.0 |
| Хранилище файлов | MinIO (S3-совместимый, boto3) |
| Аутентификация | JWT HS256 (python-jose) + bcrypt (passlib) |

---

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

## Архитектура

Монолитный файл `main.py`. Две модели SQLAlchemy:

- **`User`** — `username` (PK), `hashed_password`, `role` (`user` / `admin`), `full_name`, `created_at`
- **`Document`** — `id` (PK), `filename`, `title`, `s3_key` (unique), `uploaded_by`, `uploaded_at`

Файлы PDF хранятся в MinIO; метаданные документов и пользователи — в SQLite (`app.db`). Контент документов и история чатов не покидают клиент.

---

## Эндпоинты

| Метод | Путь | Роль | Описание |
|---|---|---|---|
| `POST` | `/auth/register` | — | Зарегистрировать пользователя |
| `POST` | `/auth/login` | — | Получить JWT-токен |
| `GET` | `/auth/me` | any | Информация о текущем пользователе |
| `PUT` | `/auth/profile` | any | Обновить имя пользователя |
| `POST` | `/documents` | admin | Загрузить PDF |
| `GET` | `/documents` | any | Список документов |
| `GET` | `/documents/{id}` | any | Получить presigned URL для скачивания |
| `PATCH` | `/documents/{id}` | admin | Обновить название документа |
| `DELETE` | `/documents/{id}` | admin | Удалить документ |

---

## Конфигурация

| Переменная | По умолчанию | Описание |
|---|---|---|
| `SECRET_KEY` | `change-me-in-production` | Секрет для подписи JWT |
| `S3_ENDPOINT` | `http://localhost:9000` | Адрес S3-совместимого хранилища |
| `ADMIN_USERNAME` | — | Логин администратора (создаётся один раз при запуске) |
| `ADMIN_PASSWORD` | — | Пароль администратора |

Обычная регистрация через `/auth/register` создаёт пользователей с ролью `user`. Чтобы создать администратора:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin uvicorn main:app --reload
```
