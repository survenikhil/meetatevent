from __future__ import annotations

import random
from typing import List

from events.match_service import create_or_update_profile_matches, ensure_profile_embedding
from events.models import Profile


ROLE_PITCHES = {
    "AI Architect": [
        "I design production AI systems for large enterprises and I am here to meet platform teams adopting retrieval and agent workflows.",
        "I build scalable AI architecture across data, model serving, and guardrails and I want to connect with teams planning real deployments.",
        "I lead architecture for enterprise copilots and I am looking for partners who need secure, reliable AI stacks in production.",
    ],
    "Head of AI": [
        "I lead AI strategy for my company and I am here to evaluate practical vendors, strong engineering partners, and high-impact use cases.",
        "I run an applied AI team and I want to meet founders and operators who can help us move from pilots to measurable business outcomes.",
        "I own AI roadmap and delivery and I am here to connect with experts in governance, data readiness, and enterprise rollout.",
    ],
    "Founder": [
        "I am building an AI startup in enterprise automation and I want to meet buyers, design partners, and investors focused on B2B adoption.",
        "I founded an AI product company and I am here to meet early customers, channel partners, and mentors who have scaled GTM.",
        "I am an early-stage founder and I want to connect with enterprise decision makers willing to run focused pilots this quarter.",
    ],
    "GTM Lead": [
        "I lead go-to-market for an AI company and I am here to meet enterprise prospects, ecosystem partners, and channel leaders.",
        "I run AI GTM programs and I want to connect with founders and product leaders who need repeatable demand generation.",
        "I focus on AI sales strategy and I am looking for teams exploring partner-led growth and high-conversion pilot motion.",
    ],
    "Investor": [
        "I invest in AI infrastructure and applied enterprise software and I am here to meet credible founders with strong customer pull.",
        "I am an investor tracking AI startups and I want to meet teams showing real distribution, retention, and fast learning cycles.",
        "I back early AI companies and I am looking for founders with domain depth, clear wedge, and practical path to scale.",
    ],
    "Government Official": [
        "I work on public sector technology programs and I am here to evaluate responsible AI adoption for citizen services and governance.",
        "I represent a government innovation team and I want to meet experts building trustworthy AI solutions for public workflows.",
        "I handle policy and implementation for digital transformation and I am here to connect with teams focused on compliant AI systems.",
    ],
}


def _pick_pitch(role: str, index: int) -> str:
    options = ROLE_PITCHES[role]
    return options[index % len(options)]


def main() -> None:
    profiles: List[Profile] = list(Profile.objects.order_by("id"))
    if not profiles:
        print("No profiles found.")
        return

    roles = list(ROLE_PITCHES.keys())
    rng = random.Random(42)
    rng.shuffle(roles)

    for idx, profile in enumerate(profiles):
        role = roles[idx % len(roles)]
        pitch = _pick_pitch(role, profile.id + idx)
        profile.tag = role
        profile.pitch_text = pitch
        profile.embedding = None
        profile.save(update_fields=["tag", "pitch_text", "embedding"])
        ensure_profile_embedding(profile)

    selected = profiles[:4]
    for profile in selected:
        create_or_update_profile_matches(profile)

    print(f"Updated pitches + embeddings for {len(profiles)} profiles.")
    print(f"Ran profile matching for profile IDs: {[p.id for p in selected]}")


if __name__ == "__main__":
    main()
