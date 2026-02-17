# Map4Expo

Mobile-first networking webapp for expo events, starting with **India AI Summit**.

## Stack
- Frontend: React + TypeScript + TailwindCSS
- Backend: Django (CRUD + admin) and FastAPI (voice + matching)
- DB: PostgreSQL
- STT: OpenAI Whisper (local model)

## Local setup (suggested)

### 1) Start Postgres
```
docker compose up -d db
```

### 2) Backend
```
cd backend
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Django
cd django_app
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000

# FastAPI (in a separate shell)
cd ../fastapi_app
uvicorn main:app --reload --port 8001
```

### OpenAI key for STT
```
cd backend
cp .env.example .env
# edit backend/.env and set OPENAI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
```

### Google login
- Login URL: `http://127.0.0.1:8000/accounts/google/login/`
- API auth status: `http://127.0.0.1:8000/api/auth/me/`

### 3) Frontend
```
cd frontend
npm install
npm run dev
```

## Notes
- Django REST endpoints live at `/api/profiles/` and `/api/meetups/`.
- FastAPI has `/stt` for Whisper transcription and `/match` for matching.
- Update `POSTGRES_*` env vars if you customize DB credentials.
