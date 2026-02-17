import json
import os
import threading
from dataclasses import dataclass

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional in local setup
    OpenAI = None

from .models import Profile, ProfileMatch
from pgvector.django import CosineDistance


OPENAI_MATCH_MODEL = os.environ.get('OPENAI_MATCH_MODEL', 'gpt-5-nano')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
OPENAI_EMBEDDING_MODEL = os.environ.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small')
OPENAI_EMBEDDING_DIM = int(os.environ.get('OPENAI_EMBEDDING_DIM', '1536'))
MATCH_CANDIDATE_LIMIT = int(os.environ.get('MATCH_CANDIDATE_LIMIT', '20'))
MESSAGE_MATCH_THRESHOLD = int(os.environ.get('MESSAGE_MATCH_THRESHOLD', '60'))
DEFAULT_OPENAI_MATCH_PROMPT = (
    'You are an intent-matching engine for expo networking.\n'
    'Given two short voice-pitch transcripts, score how useful a 1:1 meeting would be.\n\n'
    'Evaluate ONLY these parameters:\n'
    '1) Why each person is at the event (goal/intention)\n'
    '2) Their specialty/expertise/role\n'
    '3) Who they explicitly want to meet\n'
    '4) Whether one person can satisfy the other person\'s stated need\n\n'
    'Hard rules:\n'
    '- If there is an explicit mismatch in who they want to meet, lower score strongly.\n'
    '- If goals are complementary (buyer<->seller, founder<->investor, vendor<->prospect, recruiter<->candidate), score higher.\n'
    '- If either pitch is too vague to assess fit, keep score in the middle range.\n'
    '- Do not reward generic buzzwords.\n\n'
    'Scoring guide:\n'
    '- 0-29: poor fit / conflicting intent\n'
    '- 30-59: weak or unclear fit\n'
    '- 60-79: clear fit on at least one core parameter\n'
    '- 80-100: strong mutual intent alignment and practical value\n\n'
    'Return ONLY valid JSON with this exact schema:\n'
    '{"match_score": <integer 0-100>, "reasoning": "<max 24 words>"}\n\n'
    'Profile A pitch: {profile_a_pitch}\n'
    'Profile B pitch: {profile_b_pitch}\n'
)
OPENAI_MATCH_PROMPT_TEMPLATE = os.environ.get(
    'OPENAI_MATCH_PROMPT',
    os.environ.get('GEMINI_MATCH_PROMPT', DEFAULT_OPENAI_MATCH_PROMPT)
).replace('\\n', '\n')


@dataclass
class MatchResult:
    score: int
    reason: str


def _fallback_score(profile_a: Profile, profile_b: Profile) -> MatchResult:
    tokens_a = set((profile_a.pitch_text or '').lower().split())
    tokens_b = set((profile_b.pitch_text or '').lower().split())
    if not tokens_a:
        return MatchResult(score=0, reason='Insufficient pitch data')
    overlap = len(tokens_a.intersection(tokens_b))
    score = int(min(95, 35 + (overlap / max(1, len(tokens_a))) * 65))
    return MatchResult(score=score, reason='Token-overlap fallback score')


def _render_prompt(template: str, profile_a: Profile, profile_b: Profile) -> str:
    prompt = template
    replacements = {
        '{profile_a_pitch}': profile_a.pitch_text or '',
        '{profile_b_pitch}': profile_b.pitch_text or '',
        '{profile_a_name}': profile_a.display_name or '',
        '{profile_b_name}': profile_b.display_name or '',
        '{event_name}': profile_a.event_name or profile_b.event_name or 'India AI Summit',
    }
    for key, value in replacements.items():
        prompt = prompt.replace(key, value)
    return prompt


def _parse_match_json(text: str) -> MatchResult:
    parsed = json.loads(text)
    score = int(parsed.get('match_score', 0))
    reason = str(parsed.get('reasoning', 'No reason provided')).strip()[:240]
    score = max(0, min(100, score))
    return MatchResult(score=score, reason=reason or 'No reason provided')


def _get_embedding(text: str) -> list | None:
    if not OPENAI_API_KEY or OpenAI is None:
        return None
    if not text.strip():
        return None
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.embeddings.create(
            model=OPENAI_EMBEDDING_MODEL,
            input=text,
            dimensions=OPENAI_EMBEDDING_DIM,
        )
        return response.data[0].embedding
    except Exception:
        return None


def ensure_profile_embedding(profile: Profile) -> None:
    if profile.embedding is not None:
        return
    embedding = _get_embedding(profile.pitch_text or '')
    if embedding is None:
        return
    profile.embedding = embedding
    profile.save(update_fields=['embedding'])


def _candidate_profiles(profile: Profile):
    if profile.embedding is None:
        return Profile.objects.exclude(id=profile.id).order_by('-created_at')[:MATCH_CANDIDATE_LIMIT]
    return (
        Profile.objects.exclude(id=profile.id)
        .exclude(embedding__isnull=True)
        .annotate(distance=CosineDistance('embedding', profile.embedding))
        .order_by('distance')[:MATCH_CANDIDATE_LIMIT]
    )


def _openai_score(profile_a: Profile, profile_b: Profile) -> MatchResult:
    if not OPENAI_API_KEY or OpenAI is None:
        return _fallback_score(profile_a, profile_b)

    try:
        prompt = _render_prompt(OPENAI_MATCH_PROMPT_TEMPLATE, profile_a, profile_b)
    except Exception:
        prompt = _render_prompt(DEFAULT_OPENAI_MATCH_PROMPT, profile_a, profile_b)

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=OPENAI_MATCH_MODEL,
            messages=[
                {'role': 'system', 'content': 'Return only valid JSON.'},
                {'role': 'user', 'content': prompt},
            ],
        )
        content = (response.choices[0].message.content or '').strip()
        if not content:
            return _fallback_score(profile_a, profile_b)

        try:
            return _parse_match_json(content)
        except Exception:
            start = content.find('{')
            end = content.rfind('}')
            if start != -1 and end != -1 and end > start:
                return _parse_match_json(content[start:end + 1])
            return _fallback_score(profile_a, profile_b)
    except Exception:
        return _fallback_score(profile_a, profile_b)


def get_stored_match_score(profile_a: Profile, profile_b: Profile) -> int:
    match = ProfileMatch.objects.filter(source_profile=profile_a, target_profile=profile_b).first()
    if match:
        return match.match_score
    return _fallback_score(profile_a, profile_b).score


def can_message_profiles(profile_a: Profile, profile_b: Profile) -> bool:
    return get_stored_match_score(profile_a, profile_b) >= MESSAGE_MATCH_THRESHOLD


def create_or_update_profile_matches(new_profile: Profile) -> None:
    ensure_profile_embedding(new_profile)
    others = _candidate_profiles(new_profile)
    for other in others:
        ensure_profile_embedding(other)
        result_ab = _openai_score(new_profile, other)
        result_ba = _openai_score(other, new_profile)

        ProfileMatch.objects.update_or_create(
            source_profile=new_profile,
            target_profile=other,
            defaults={'match_score': result_ab.score, 'reasoning': result_ab.reason},
        )
        ProfileMatch.objects.update_or_create(
            source_profile=other,
            target_profile=new_profile,
            defaults={'match_score': result_ba.score, 'reasoning': result_ba.reason},
        )


def schedule_profile_match(new_profile: Profile) -> None:
    if os.environ.get('MATCH_ASYNC', '1') != '1':
        create_or_update_profile_matches(new_profile)
        return

    def _worker(profile_id: int) -> None:
        try:
            profile = Profile.objects.get(id=profile_id)
            create_or_update_profile_matches(profile)
        except Exception:
            pass

    thread = threading.Thread(target=_worker, args=(new_profile.id,), daemon=True)
    thread.start()
