from __future__ import annotations

import re
from typing import List


def clean_text(text: str) -> str:
    """Normalize whitespace and remove unusual characters."""
    if not text:
        return ""
    # Replace multiple whitespace/newlines with single space
    text = re.sub(r"\s+", " ", text)
    # Remove non-printable characters except newlines and tabs
    text = re.sub(r"[^\x20-\x7E\n\t]", " ", text)
    # Normalize quotes
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    # Remove excessive punctuation repetition
    text = re.sub(r"([!?.]){3,}", r"\1\1", text)
    return text.strip()


def split_into_sentences(text: str) -> List[str]:
    """Split text into sentences using basic heuristics."""
    if not text:
        return []

    # Split on sentence-ending punctuation followed by whitespace and capital
    pattern = r"(?<=[.!?])\s+(?=[A-Z])"
    sentences = re.split(pattern, text)

    # Further split very long sentences at semicolons or conjunctions
    result = []
    for sentence in sentences:
        sentence = sentence.strip()
        if sentence:
            result.append(sentence)

    return result


def extract_key_concepts(text: str) -> List[str]:
    """
    Extract key concepts using basic noun phrase heuristics.
    No NLP dependency — uses regex patterns for capitalized phrases
    and domain-specific patterns.
    """
    if not text:
        return []

    concepts = set()

    # Pattern 1: Capitalized multi-word phrases (proper nouns / named concepts)
    cap_phrases = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b", text)
    concepts.update(cap_phrases)

    # Pattern 2: Words in quotes (often key terms)
    quoted = re.findall(r'"([^"]{3,30})"', text)
    concepts.update(quoted)

    # Pattern 3: Words followed by "is", "are", "refers to", "means" (definitions)
    definition_patterns = re.findall(
        r"\b([A-Za-z][a-z]{2,20})\s+(?:is|are|refers to|means|describes)\b",
        text,
    )
    concepts.update(definition_patterns)

    # Pattern 4: Hyphenated technical terms
    hyphenated = re.findall(r"\b([a-z]{2,}-[a-z]{2,}(?:-[a-z]{2,})?)\b", text)
    concepts.update(hyphenated)

    # Pattern 5: Acronyms (2-5 uppercase letters)
    acronyms = re.findall(r"\b([A-Z]{2,5})\b", text)
    concepts.update(acronyms)

    # Filter out common English words that might be falsely captured
    stopwords = {
        "I", "A", "The", "In", "Of", "To", "And", "Or", "But", "For",
        "Is", "It", "As", "Be", "By", "On", "At", "An", "We", "He",
        "She", "They", "This", "That", "With", "From", "Are", "Was",
    }
    concepts = {c for c in concepts if c not in stopwords and len(c) > 2}

    return sorted(list(concepts))[:20]  # Return top 20


def estimate_read_time_minutes(text: str, wpm: int = 200) -> float:
    """Estimate reading time based on word count."""
    if not text:
        return 0.0
    word_count = len(text.split())
    return round(word_count / wpm, 1)


def truncate_for_context(text: str, max_chars: int = 4000) -> str:
    """Truncate text to fit within a context window, preserving sentence boundaries."""
    if not text or len(text) <= max_chars:
        return text

    truncated = text[:max_chars]

    # Try to cut at the last sentence boundary
    last_period = truncated.rfind(".")
    last_newline = truncated.rfind("\n")
    cut_point = max(last_period, last_newline)

    if cut_point > max_chars * 0.8:
        # Good cut point found
        return truncated[:cut_point + 1].strip()

    return truncated.rstrip() + "..."
