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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
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


class UserModel(Base):
    __tablename__ = "users"

    username = Column(String, primary_key=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")
    full_name = Column(String, nullable=False, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class DocumentModel(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    s3_key = Column(String, nullable=False, unique=True)
    uploaded_by = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(lambda: next(get_db())),
) -> UserModel:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if not username:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    user = db.get(UserModel, username)
    if not user:
        raise credentials_exc
    return user


def require_admin(user: UserModel = Depends(get_current_user)) -> UserModel:
    if user.role != "admin":
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
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            s3.create_bucket(Bucket=S3_BUCKET)
        else:
            raise
    except Exception as e:
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

class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str = ""


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    username: str
    role: str
    full_name: str
    created_at: datetime

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    full_name: str


class DocumentOut(BaseModel):
    id: str
    filename: str
    uploaded_by: str
    uploaded_by_full_name: str = ""
    uploaded_at: datetime

    class Config:
        from_attributes = True


class PresignedUrlOut(BaseModel):
    url: str


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Diploma Document Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _seed_admin_from_env()
    s3 = get_s3_client()
    ensure_bucket(s3)


def _seed_admin_from_env():
    """Create an admin user from env vars ADMIN_USERNAME / ADMIN_PASSWORD if not exists."""
    username = os.getenv("ADMIN_USERNAME")
    password = os.getenv("ADMIN_PASSWORD")
    if not username or not password:
        return
    db = SessionLocal()
    try:
        if not db.get(UserModel, username):
            db.add(UserModel(
                username=username,
                hashed_password=pwd_context.hash(password),
                role="admin",
            ))
            db.commit()
            import logging
            logging.info(f"Admin user '{username}' created from env.")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/auth/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user with role 'user'."""
    if db.get(UserModel, body.username):
        raise HTTPException(status_code=400, detail="Username already taken")
    user = UserModel(
        username=body.username,
        hashed_password=pwd_context.hash(body.password),
        role="user",
        full_name=body.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate with username + password, return a JWT."""
    user = db.get(UserModel, form.username)
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_token({"sub": user.username, "role": user.role, "full_name": user.full_name})
    return TokenResponse(access_token=token)


@app.get("/auth/me", response_model=UserOut)
def me(user: UserModel = Depends(get_current_user)):
    """Return info about the currently authenticated user."""
    return user


@app.post("/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(require_admin),
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
        uploaded_by=admin.username,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@app.get("/documents", response_model=List[DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    """Return all documents stored in the DB."""
    docs = db.query(DocumentModel).all()
    result = []
    for doc in docs:
        uploader = db.get(UserModel, doc.uploaded_by)
        full_name = uploader.full_name if uploader else ""
        result.append(DocumentOut(
            id=doc.id,
            filename=doc.filename,
            uploaded_by=doc.uploaded_by,
            uploaded_by_full_name=full_name,
            uploaded_at=doc.uploaded_at,
        ))
    return result


@app.put("/auth/profile", response_model=UserOut)
def update_profile(
    body: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Update the current user's full name."""
    user = db.get(UserModel, current_user.username)
    user.full_name = body.full_name
    db.commit()
    db.refresh(user)
    return user


@app.get("/documents/{doc_id}", response_model=PresignedUrlOut)
def get_document(
    doc_id: str,
    db: Session = Depends(get_db),
    _: UserModel = Depends(get_current_user),
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
    _: UserModel = Depends(require_admin),
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
