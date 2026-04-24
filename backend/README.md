# IQX Backend

Production-ready FastAPI backend for the IQX platform.

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.13.x | Runtime |
| FastAPI | 0.136.x | Web framework |
| SQLAlchemy | 2.0.x (async) | ORM |
| asyncpg | 0.31.x | PostgreSQL async driver |
| Alembic | 1.18.x | Database migrations |
| Pydantic | 2.x | Data validation |
| pydantic-settings | 2.x | Configuration |
| PyJWT | 2.x | JWT authentication |
| passlib + bcrypt | — | Password hashing |
| uv | 0.9.x | Package & environment management |
| pytest | 8.x | Testing |
| ruff | 0.15.x | Linting & formatting |

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py                 # Auth & DB dependencies
│   │   └── v1/
│   │       ├── router.py           # v1 router aggregator
│   │       └── endpoints/
│   │           ├── health.py       # GET /api/v1/health
│   │           ├── auth.py         # Register, Login, Refresh, Me
│   │           └── users.py        # User CRUD (admin + self)
│   ├── core/
│   │   ├── config.py               # Pydantic-settings config
│   │   ├── database.py             # Async engine & session
│   │   ├── exceptions.py           # Standardized exceptions
│   │   ├── logging.py              # Logging setup
│   │   └── security.py             # JWT & password hashing
│   ├── models/
│   │   └── user.py                 # User SQLAlchemy model
│   ├── schemas/
│   │   ├── common.py               # Shared schemas
│   │   ├── auth.py                 # Auth request/response
│   │   └── user.py                 # User request/response
│   ├── services/
│   │   ├── auth.py                 # Auth business logic
│   │   └── user.py                 # User business logic
│   ├── repositories/
│   │   └── user.py                 # User data access layer
│   └── main.py                     # FastAPI app entry point
├── alembic/
│   ├── env.py                      # Async Alembic config
│   ├── script.py.mako              # Migration template
│   └── versions/                   # Migration files
├── tests/
│   ├── conftest.py                 # Test fixtures
│   ├── test_health.py
│   ├── test_auth.py
│   └── test_users.py
├── alembic.ini
├── pyproject.toml
├── .env.example
└── .gitignore
```

## Quick Start

### Prerequisites

- Python 3.12+ (3.13 recommended)
- PostgreSQL 15+
- [uv](https://docs.astral.sh/uv/) installed

### 1. Setup Environment

```bash
cd backend

# Create virtual environment
uv venv --python 3.13

# Install all dependencies (including dev)
uv sync --all-extras
```

### 2. Configure Environment Variables

```bash
# Copy the example and edit with your values
cp .env.example .env

# Edit .env with your database credentials and JWT secrets
# Generate JWT secrets with:
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

### 3. Database Setup

Make sure PostgreSQL is running, then create the database:

```sql
CREATE USER "IQX" WITH PASSWORD 'your_password';
CREATE DATABASE "IQX" OWNER "IQX";
```

### 4. Run Migrations

```bash
# Generate initial migration
uv run alembic revision --autogenerate -m "initial_user_model"

# Apply migrations
uv run alembic upgrade head
```

### 5. Run Development Server

```bash
uv run fastapi dev app/main.py
```

The API will be available at:
- **API**: http://localhost:8000
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## API Endpoints

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | App + DB health check |

### Authentication
| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Register new user | — |
| POST | `/api/v1/auth/login` | Login (returns tokens) | — |
| POST | `/api/v1/auth/refresh` | Refresh token pair | — |
| GET | `/api/v1/auth/me` | Get current user | Bearer |

### Users
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/users/me` | Get own profile | Bearer |
| PATCH | `/api/v1/users/me` | Update own profile | Bearer |
| GET | `/api/v1/users/` | List users (paginated) | Admin |
| POST | `/api/v1/users/` | Create user | Admin |
| GET | `/api/v1/users/{id}` | Get user by ID | Admin |
| PATCH | `/api/v1/users/{id}` | Update user | Admin |
| DELETE | `/api/v1/users/{id}` | Soft-delete user | Admin |

### Query Parameters (List Users)

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number |
| `page_size` | int | 20 | Items per page (max 100) |
| `search` | string | — | Search email, name, phone |
| `role` | enum | — | Filter by role |
| `status` | enum | — | Filter by status |
| `sort_by` | string | created_at | Sort field |
| `sort_order` | asc/desc | desc | Sort direction |

## Development Commands

```bash
# Install dependencies
uv sync --all-extras

# Run dev server
uv run fastapi dev app/main.py

# Run tests
uv run pytest -v

# Run tests with coverage
uv run pytest --cov=app --cov-report=term-missing

# Lint
uv run ruff check app/ tests/

# Format
uv run ruff format app/ tests/

# Generate migration
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# Downgrade migration
uv run alembic downgrade -1
```

## Architecture

The project follows a **layered architecture**:

1. **Endpoints** (`api/`) — HTTP request handling, validation, response serialization
2. **Services** (`services/`) — Business logic, orchestration
3. **Repositories** (`repositories/`) — Data access, queries
4. **Models** (`models/`) — SQLAlchemy ORM models
5. **Schemas** (`schemas/`) — Pydantic request/response models
6. **Core** (`core/`) — Configuration, security, database, exceptions

### Key Design Decisions

- **UUID primary keys** — Safer for distributed systems, no sequential ID enumeration
- **Soft delete** — Users are marked as `deleted` rather than physically removed
- **Role-based access** — `admin` and `user` roles with dependency-based guards
- **Phone validation** — Uses `phonenumbers` library for E.164 format
- **JWT dual-token** — Short-lived access token + long-lived refresh token with rotation
- **Lazy engine init** — Database engine created on first use, not at import time
- **Password requirements** — Minimum 8 chars, uppercase, lowercase, digit, special char

## Notes

- Python version: **3.13.x** (available locally via Homebrew)
- `.env` is git-ignored and must not be committed
- Tests use an in-memory SQLite database for isolation
- Production deployments should use environment variables (not `.env` files)
