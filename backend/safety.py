"""Deterministic crisis-language detection.

This is the safety net under the model, not a clinical screen. It is
deliberately narrow: it only fires on explicit self-harm or death-wish
language. It respects negation, clause scope, third-person framing, and
historical tense, because those are the cases that make a bag-of-words
model wrong in both directions.

Limits, on purpose:
- quoted lyrics, jokes, and hypotheticals can still fire;
- implicit distress ("I am so tired of everything") is not matched here;
- a match is a signal to show support, never a diagnosis.
"""

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class CrisisMatch:
    phrase: str
    kind: str
    about_self: bool
    historical: bool

    @property
    def urgent(self):
        return not self.historical

    def to_dict(self):
        return {
            "phrase": self.phrase,
            "kind": self.kind,
            "about_self": self.about_self,
            "historical": self.historical,
        }


_PATTERNS = [
    (r"\bkill(?:ing)?\s+myself\b", "suicide"),
    (r"\bkill(?:ing)?\s+(?:him|her|them)sel(?:f|ves)\b", "suicide"),
    (r"\bend(?:ing)?\s+my\s+(?:own\s+)?life\b", "suicide"),
    (r"\bend(?:ing)?\s+(?:his|her|their)\s+(?:own\s+)?life\b", "suicide"),
    (r"\btak(?:e|ing)\s+my\s+(?:own\s+)?life\b", "suicide"),
    (r"\bwant(?:s|ed|ing)?\s+to\s+die\b", "suicide"),
    (r"\bwanna\s+die\b", "suicide"),
    (r"\bwish(?:es)?\s+(?:i|he|she|they)?\s*(?:was|were)\s+dead\b", "suicide"),
    (r"\bwish(?:es)?\s+(?:i\s+)?(?:was|were)\s+never\s+born\b", "death_wish"),
    (r"\bbetter\s+off\s+dead\b", "suicide"),
    (r"\bbetter\s+off\s+without\s+me\b", "burden"),
    (r"\bbetter\s+off\s+if\s+i\s+(?:wasn'?t|weren'?t)\s+here\b", "burden"),
    (r"\bdon'?t\s+want\s+to\s+(?:be\s+alive|live|be\s+here|exist)\b", "suicide"),
    (r"\bdo\s+not\s+want\s+to\s+(?:be\s+alive|live|be\s+here|exist)\b", "suicide"),
    (r"\bno\s+reason\s+to\s+(?:live|go\s+on)\b", "suicide"),
    (r"\bthink(?:ing)?\s+about\s+(?:suicide|killing\s+myself|ending\s+it)\b", "suicide"),
    (r"\bend\s+it\s+all\b", "suicide"),
    (r"\bsuicid(?:e|al)\b", "suicide_topic"),
    (r"\bself[-\s]?harm(?:ing)?\b", "self_harm_topic"),
    (r"\bhurt(?:ing)?\s+myself\b", "self_harm"),
    (r"\bcut(?:ting)?\s+myself\b", "self_harm"),
    (r"\bburn(?:ing)?\s+myself\b", "self_harm"),
    (r"\bhang(?:ing)?\s+myself\b", "suicide"),
    (r"\boverdos(?:e|ed|ing)\b", "self_harm"),
    (r"\bwant\s+to\s+disappear\b", "death_wish"),
    (r"\bnobody\s+would\s+(?:miss|care)\b", "burden"),
    (r"\bno\s+one\s+would\s+(?:miss|care)\b", "burden"),
    (r"\b(?:nobody|no\s+one)\s+would\s+(?:care|notice)\s+if\s+i\s+(?:died|was\s+gone)\b", "burden"),
    (r"\bwish(?:es)?\s+(?:i|he|she|they)?\s*(?:wasn'?t|weren'?t)\s+here\b", "death_wish"),
    (r"\bdon'?t\s+want\s+to\s+wake\s+up\b", "death_wish"),
]

_COMPILED_PATTERNS = [(re.compile(pattern, re.IGNORECASE), kind) for pattern, kind in _PATTERNS]

_BOUNDARY = re.compile(r"[,.;!?]|\b(?:and|but|because|then)\b", re.IGNORECASE)
_NEGATORS = re.compile(
    r"\b(?:not|never|no\s+longer|don'?t|doesn'?t|didn'?t|won'?t|wouldn'?t|"
    r"isn'?t|wasn'?t|aren'?t|weren'?t|can'?t|cannot)\b",
    re.IGNORECASE,
)
_HISTORICAL = re.compile(
    r"\b(?:used\s+to|use\s+to|in\s+the\s+past|years?\s+ago|when\s+i\s+was\s+"
    r"(?:younger|a\s+kid|a\s+teen)|last\s+year|a\s+while\s+ago|previously)\b",
    re.IGNORECASE,
)

_STRONG_THIRD = re.compile(
    r"\b(?:someone\s+(?:i\s+know|else|who)|a\s+friend|my\s+(?:friend|mom|mum|dad|"
    r"father|mother|brother|sister|partner|girlfriend|boyfriend|wife|husband|son|"
    r"daughter|cousin|roommate|neighbour|neighbor|colleague|coworker|co-worker|"
    r"boss|therapist|client|ex))\b",
    re.IGNORECASE,
)
_THIRD_PERSON = re.compile(
    r"\b(?:he|she|they|him|her|them|his|hers|their)\b",
    re.IGNORECASE,
)
_FIRST_PERSON = re.compile(r"\b(?:i|me|i'm|im|i've|ive|i'd|id|i'll|ill|myself)\b", re.IGNORECASE)


def _clause_bounds(text, start):
    left = 0
    for boundary in _BOUNDARY.finditer(text, 0, start):
        left = boundary.end()
    boundary = _BOUNDARY.search(text, start)
    right = boundary.start() if boundary else len(text)
    return left, right


def _about_self(clause, match_start):
    before = clause[:match_start]
    strong_spans = [match.span() for match in _STRONG_THIRD.finditer(before)]

    def inside_strong_phrase(position):
        return any(start <= position < end for start, end in strong_spans)

    first_positions = [
        match.start() for match in _FIRST_PERSON.finditer(before) if not inside_strong_phrase(match.start())
    ]
    third_positions = [match.start() for match in _THIRD_PERSON.finditer(before)]
    third_positions.extend(start for start, _ in strong_spans)

    if not third_positions:
        return True
    if not first_positions:
        return False
    return max(first_positions) > max(third_positions)


def find_crisis_phrases(text):
    """Return non-negated matches for explicit crisis language."""
    if not text or not text.strip():
        return []

    raw = []
    for pattern, kind in _COMPILED_PATTERNS:
        for match in pattern.finditer(text):
            raw.append((match.start(), match.end(), kind))

    # Keep the longest match when two patterns overlap, e.g. "thinking about
    # killing myself" and "killing myself".
    raw.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    kept = []
    for start, end, kind in raw:
        if any(not (end <= other_start or start >= other_end) for other_start, other_end, _ in kept):
            continue
        kept.append((start, end, kind))

    matches = []
    for start, end, kind in kept:
        left, right = _clause_bounds(text, start)
        clause = text[left:right]
        before = text[left:start]
        if _NEGATORS.search(before):
            continue
        matches.append(
            CrisisMatch(
                phrase=" ".join(text[start:end].split()),
                kind=kind,
                about_self=_about_self(clause, start - left),
                historical=bool(_HISTORICAL.search(clause)),
            )
        )
    return matches


def looks_third_person(text):
    """True when the text talks about someone else and not the user."""
    if not text:
        return False
    strong_spans = [match.span() for match in _STRONG_THIRD.finditer(text)]
    first_positions = [
        match.start()
        for match in _FIRST_PERSON.finditer(text)
        if not any(start <= match.start() < end for start, end in strong_spans)
    ]
    third_positions = [match.start() for match in _THIRD_PERSON.finditer(text)]
    third_positions.extend(start for start, _ in strong_spans)

    if not third_positions:
        return False
    if not first_positions:
        return True
    return max(third_positions) > max(first_positions)
