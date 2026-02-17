import os
import tempfile
import time
import logging
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional dependency during setup
    OpenAI = None

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s %(name)s: %(message)s'
)
logger = logging.getLogger('map4expo.fastapi')

CORS_ORIGINS = os.getenv(
    'CORS_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://0.0.0.0:5173,http://192.168.1.7:5173'
)
FASTAPI_API_KEY = os.getenv('FASTAPI_API_KEY', '').strip()
STT_MAX_MB = float(os.getenv('STT_MAX_MB', '10'))

app = FastAPI(title='Map4Expo API')
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS.split(',') if origin.strip()],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.middleware('http')
async def log_requests(request: Request, call_next):
    start = time.time()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception('Unhandled request error: method=%s path=%s', request.method, request.url.path)
        raise
    duration_ms = round((time.time() - start) * 1000, 2)
    if response.status_code >= 500:
        logger.error(
            'HTTP %s %s -> %s in %sms',
            request.method,
            request.url.path,
            response.status_code,
            duration_ms
        )
    elif response.status_code >= 400:
        logger.warning(
            'HTTP %s %s -> %s in %sms',
            request.method,
            request.url.path,
            response.status_code,
            duration_ms
        )
    else:
        logger.info(
            'HTTP %s %s -> %s in %sms',
            request.method,
            request.url.path,
            response.status_code,
            duration_ms
        )
    return response


class VoicePitch(BaseModel):
    text: str
    event_name: str = 'India AI Summit'


class MatchResult(BaseModel):
    profile_id: str
    score: float
    reason: Optional[str] = None


class MatchRequest(BaseModel):
    query_text: str
    candidates: List[VoicePitch]


@app.get('/health')
async def health():
    return {'status': 'ok'}


@app.post('/stt')
async def speech_to_text(audio: UploadFile = File(...), x_api_key: str | None = Header(default=None, alias='X-API-Key')):
    temp_path = None
    try:
        if FASTAPI_API_KEY:
            if not x_api_key or x_api_key != FASTAPI_API_KEY:
                return JSONResponse(status_code=401, content={'error': 'Unauthorized'})
        suffix = os.path.splitext(audio.filename or '')[1] or '.wav'
        audio_bytes = await audio.read()
        if len(audio_bytes) > STT_MAX_MB * 1024 * 1024:
            return JSONResponse(status_code=413, content={'error': f'Audio too large. Max {STT_MAX_MB}MB.'})
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as buffer:
            buffer.write(audio_bytes)
            temp_path = buffer.name

        if OpenAI is None:
            logger.error('STT failed: openai package not installed')
            return JSONResponse(
                status_code=500,
                content={
                    'error': 'OpenAI client not installed',
                    'hint': 'pip install openai and set OPENAI_API_KEY'
                }
            )

        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            logger.warning('STT failed: OPENAI_API_KEY is missing')
            return JSONResponse(
                status_code=400,
                content={
                    'error': 'OPENAI_API_KEY missing',
                    'hint': 'Set OPENAI_API_KEY in backend/.env and restart FastAPI'
                }
            )

        client = OpenAI(api_key=api_key)
        with open(temp_path, 'rb') as audio_handle:
            transcript = client.audio.transcriptions.create(
                model='whisper-1',
                file=audio_handle
            )
        logger.info('STT succeeded using OpenAI Whisper API')
        return {'text': transcript.text.strip()}
    except Exception as exc:
        logger.exception('STT processing failed')
        return JSONResponse(
            status_code=500,
            content={
                'error': 'STT processing failed',
                'detail': str(exc)
            }
        )
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post('/match', response_model=List[MatchResult])
async def match_profiles(payload: MatchRequest):
    # Placeholder scoring based on shared tokens length.
    query_tokens = set(payload.query_text.lower().split())
    results: List[MatchResult] = []
    for idx, candidate in enumerate(payload.candidates):
        candidate_tokens = set(candidate.text.lower().split())
        overlap = query_tokens.intersection(candidate_tokens)
        score = min(0.99, 0.4 + 0.6 * (len(overlap) / max(1, len(query_tokens))))
        results.append(
            MatchResult(
                profile_id=str(idx),
                score=round(score, 2),
                reason=f'Shared tokens: {", ".join(list(overlap)[:6])}'
            )
        )

    return sorted(results, key=lambda r: r.score, reverse=True)
