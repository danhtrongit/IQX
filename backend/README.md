# IQX Backend API

FastAPI backend service for the IQX project.

## Tech Stack

- **Python** 3.12+
- **FastAPI** — modern, high-performance web framework
- **Uvicorn** — lightning-fast ASGI server
- **Pydantic Settings** — configuration management with `.env` support

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application entry point
│   ├── api/
│   │   ├── __init__.py
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── router.py    # V1 API router aggregator
│   │       └── endpoints/
│   │           ├── __init__.py
│   │           ├── health.py # Health check endpoint
│   │           └── hello.py  # Sample hello endpoint
│   └── core/
│       ├── __init__.py
│       └── config.py        # App settings via pydantic-settings
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

## Quick Start

### 1. Create & activate virtual environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Set up environment variables

```bash
cp .env.example .env
# Edit .env as needed
```

### 4. Run the development server

```bash
uvicorn app.main:app --reload
```

The server will start at **http://localhost:8000**.

## API Endpoints

| Method | Path              | Description          |
|--------|-------------------|----------------------|
| GET    | `/health`         | Health check         |
| GET    | `/api/v1/hello`   | Sample hello API     |
| GET    | `/docs`           | Swagger UI           |
| GET    | `/redoc`          | ReDoc documentation  |

## Development

### Adding New Endpoints

1. Create a new file in `app/api/v1/endpoints/`.
2. Define a router using `APIRouter()`.
3. Register the router in `app/api/v1/router.py`.

### Configuration

All settings are managed via `app/core/config.py` using `pydantic-settings`.
Environment variables are loaded from `.env` file automatically.
