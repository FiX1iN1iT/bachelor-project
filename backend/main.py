"""
Simple FastAPI backend for diploma project.
Handles JWT auth, document upload/download via S3 (LocalStack), SQLite storage.
"""

import os
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SECRET_KEY = "change-me-in-production"
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60

S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://localhost:9000")
S3_BUCKET = "documents"
AWS_REGION = "us-east-1"

DATABASE_URL = "sqlite:///./app.db"

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


class DocumentModel(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    s3_key = Column(String, nullable=False, unique=True)
    uploaded_by = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


# Hardcoded users — no user table, just a dict for simplicity
USERS_DB = {
    "admin": {
        "username": "admin",
        "hashed_password": "",  # filled after pwd_context is ready
        "role": "admin",
    },
    "user": {
        "username": "user",
        "hashed_password": "",
        "role": "user",
    },
}

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def seed_users():
    """Hash passwords for the hardcoded accounts at startup."""
    USERS_DB["admin"]["hashed_password"] = pwd_context.hash("admin123")
    USERS_DB["user"]["hashed_password"] = pwd_context.hash("user123")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Decode JWT and return the user dict, or raise 401."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if username is None or username not in USERS_DB:
            raise credentials_exc
    except JWTError:
        raise credentials_exc
    return USERS_DB[username]


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency that blocks non-admin users with 403."""
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")
    return user


# ---------------------------------------------------------------------------
# S3 / LocalStack helpers
# ---------------------------------------------------------------------------

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        region_name=AWS_REGION,
        aws_access_key_id="minioadmin",
        aws_secret_access_key="minioadmin",
    )


def ensure_bucket(s3):
    """Create the S3 bucket if it doesn't exist yet. Logs a warning if MinIO is unreachable."""
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            s3.create_bucket(Bucket=S3_BUCKET)
        else:
            # Any other ClientError (e.g. auth) is still a real problem
            raise
    except Exception as e:
        # MinIO not running — warn but let the server start so auth endpoints work
        import logging
        logging.warning(f"Could not connect to MinIO at {S3_ENDPOINT}: {e}")
        logging.warning("Document endpoints will fail until MinIO is available.")


# ---------------------------------------------------------------------------
# DB dependency
# ---------------------------------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class DocumentOut(BaseModel):
    id: str
    filename: str
    uploaded_by: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


class PresignedUrlOut(BaseModel):
    url: str


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Diploma Document Service")


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)  # create tables if they don't exist
    seed_users()
    s3 = get_s3_client()
    ensure_bucket(s3)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/auth/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends()):
    """Authenticate with username + password, return a JWT."""
    user = USERS_DB.get(form.username)
    if not user or not verify_password(form.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_token({"sub": user["username"], "role": user["role"]})
    return TokenResponse(access_token=token)


@app.post("/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),  # only admins can upload
):
    """Upload a PDF to S3 and record its metadata in the DB."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    s3_key = f"{uuid.uuid4()}/{file.filename}"
    s3 = get_s3_client()

    try:
        s3.upload_fileobj(file.file, S3_BUCKET, s3_key)
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {e}")

    doc = DocumentModel(
        filename=file.filename,
        s3_key=s3_key,
        uploaded_by=admin["username"],
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@app.get("/documents", response_model=List[DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),  # any authenticated user
):
    """Return all documents stored in the DB."""
    return db.query(DocumentModel).all()


@app.get("/documents/{doc_id}", response_model=PresignedUrlOut)
def get_document(
    doc_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    """Return a presigned S3 URL valid for 1 hour so the client can download the file."""
    doc = db.get(DocumentModel, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    s3 = get_s3_client()
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": doc.s3_key},
            ExpiresIn=3600,
        )
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Could not generate URL: {e}")

    return PresignedUrlOut(url=url)


@app.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),  # only admins can delete
):
    """Delete a document from S3 and remove its DB record."""
    doc = db.get(DocumentModel, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    s3 = get_s3_client()
    try:
        s3.delete_object(Bucket=S3_BUCKET, Key=doc.s3_key)
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"S3 delete failed: {e}")

    db.delete(doc)
    db.commit()
