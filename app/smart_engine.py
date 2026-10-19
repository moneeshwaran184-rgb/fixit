import re
import math
from typing import Dict, Any, List, Tuple, Optional

# Supported Campus Categories
CATEGORIES = [
    "Electrical",
    "Plumbing",
    "Furniture",
    "Cleaning",
    "Classroom",
    "Internet/Network",
    "Security",
    "Infrastructure",
    "Other"
]

# Vocabulary mappings for Local Category Classifier
CATEGORY_KEYWORDS = {
    "Electrical": [
        "fan", "light", "bulb", "tube", "tubelight", "switch", "switchboard", "spark", "sparks",
        "wire", "wiring", "short circuit", "power", "socket", "plug", "electricity", "generator",
        "ac", "air conditioner", "hvac", "breaker", "fuse", "voltage", "blackout", "shock", "mcb"
    ],
    "Plumbing": [
        "water", "leak", "leaking", "leakage", "pipe", "tap", "faucet", "sink", "washroom", "toilet",
        "restroom", "flush", "drain", "drainage", "clog", "clogged", "overflow", "sewage", "basin",
        "geyser", "shower", "tank", "valve", "drip", "dripping"
    ],
    "Furniture": [
        "chair", "desk", "bench", "table", "podium", "cupboard", "almirah", "board", "whiteboard",
        "blackboard", "greenboard", "door", "window", "handle", "hinge", "lock", "cabinet", "shelf",
        "drawer", "cushion", "armrest", "leg", "screw", "loose screw", "broken chair", "broken table"
    ],
    "Classroom": [
        "projector", "screen", "mic", "microphone", "speaker", "audio", "podium", "smart board",
        "hdmi", "marker", "duster", "curtain", "blinds", "lectern", "av", "display", "amplifier",
        "camera", "classroom", "lecture hall", "seminar"
    ],
    "Internet/Network": [
        "wifi", "wi-fi", "internet", "lan", "ethernet", "router", "network", "signal", "connection",
        "slow internet", "no internet", "ip", "port", "switch port", "access point", "modem"
    ],
    "Cleaning": [
        "dirty", "dust", "garbage", "trash", "dustbin", "waste", "clean", "cleaning", "sweep",
        "mop", "smell", "odor", "stain", "spill", "unhygienic", "litter", "mud", "spiderweb", "cobweb"
    ],
    "Security": [
        "theft", "stolen", "cctv", "camera", "security", "guard", "id card", "gate", "lock broken",
        "trespassing", "unauthorized", "vandalism", "fight", "harassment", "emergency exit", "alarm"
    ],
    "Infrastructure": [
        "wall", "ceiling", "floor", "tile", "tiles", "crack", "roof", "stairs", "staircase", "elevator",
        "lift", "railing", "pavement", "road", "balcony", "plaster", "paint", "corridor", "ramp", "pothole"
    ]
}

# High-risk safety keywords that trigger Critical status
CRITICAL_SAFETY_KEYWORDS = [
    "spark", "sparks", "fire", "smoke", "electric shock", "exposed wire", "short circuit",
    "gas leak", "burning smell", "flame", "collapse", "falling ceiling", "chemical spill",
    "flooding near electrical", "emergency", "hazardous", "blast", "live wire"
]

# High-severity keywords
HIGH_SEVERITY_KEYWORDS = [
    "heavy water leakage", "flood", "flooding", "blackout", "elevator stuck", "lift stuck",
    "caved in", "broken glass", "ceiling falling", "sewage overflow", "total network outage",
    "no water", "water logging", "water gushing", "broken main door"
]

# Medium-severity keywords
MEDIUM_SEVERITY_KEYWORDS = [
    "not working", "broken", "damaged", "leaking", "dripping", "malfunctioning",
    "flickering", "slow", "clogged", "stuck", "loose", "dead", "unusable"
]

# High-impact campus locations (affect many students/faculty)
HIGH_IMPACT_LOCATIONS = [
    "auditorium", "lecture hall", "exam hall", "library", "cafeteria", "canteen",
    "main lab", "computer lab", "seminar hall", "server room", "boys hostel", "girls hostel"
]

def clean_tokens(text: str) -> List[str]:
    """Extract clean lowercase alphabetic words/tokens."""
    text = text.lower()
    tokens = re.findall(r'[a-z0-9]+', text)
    # Stop words
    stop_words = {
        "the", "a", "an", "is", "in", "at", "on", "of", "and", "or", "for", "to", "with",
        "from", "by", "my", "our", "there", "it", "this", "that", "was", "are", "been",
        "room", "block", "floor", "hall", "lab"
    }
    return [t for t in tokens if t not in stop_words and len(t) > 1]

def detect_category(description: str) -> Tuple[str, float, List[str]]:
    """
    Classify description into category using keyword density and scoring.
    Returns: (suggested_category, confidence_score, matched_keywords)
    """
    desc_lower = description.lower()
    scores: Dict[str, Tuple[int, List[str]]] = {cat: (0, []) for cat in CATEGORIES}

    for cat, keywords in CATEGORY_KEYWORDS.items():
        matched = []
        score = 0
        for kw in keywords:
            # Check multi-word keyword as whole phrase
            if " " in kw:
                if kw in desc_lower:
                    score += 3
                    matched.append(kw)
            else:
                # Word boundary check for single word
                pattern = r'\b' + re.escape(kw) + r'\b'
                matches = len(re.findall(pattern, desc_lower))
                if matches > 0:
                    score += matches * 2
                    matched.append(kw)
        scores[cat] = (score, matched)

    # Sort categories by score descending
    sorted_cats = sorted(scores.items(), key=lambda item: item[1][0], reverse=True)
    best_cat, (best_score, best_matches) = sorted_cats[0]

    if best_score == 0:
        return "Other", 0.30, []

    # Calculate confidence ratio
    confidence = min(0.95, 0.50 + (best_score * 0.10))
    return best_cat, round(confidence, 2), best_matches

def calculate_priority_score(description: str, location: str = "", people_affected: int = 1) -> Dict[str, Any]:
    """
    Transparent composite priority scoring:
    Safety Risk (0-40) + Severity (0-30) + Location Impact (0-20) + People Affected (0-10)
    Total: 0-100
    >= 75 -> Critical (🚨)
    50 - 74 -> High (🔴)
    30 - 49 -> Medium (🟠)
    < 30 -> Low (🟢)
    """
    desc_lower = description.lower()
    loc_lower = location.lower()

    safety_score = 0
    severity_score = 0
    location_score = 0
    people_score = 0
    rationales = []

    # 1. Safety Risk Check (0 - 40 points)
    matched_critical = [kw for kw in CRITICAL_SAFETY_KEYWORDS if kw in desc_lower]
    if matched_critical:
        safety_score = 40
        rationales.append(f"Immediate safety hazard detected ({', '.join(matched_critical[:2])})")
    else:
        # Check mild safety indicators
        if any(w in desc_lower for w in ["sharp", "hanging", "slip", "slippery", "dark"]):
            safety_score = 20
            rationales.append("Potential slip or physical hazard flagged")

    # 2. Severity Check (0 - 30 points)
    matched_high = [kw for kw in HIGH_SEVERITY_KEYWORDS if kw in desc_lower]
    if matched_high:
        severity_score = 30
        rationales.append(f"High operational disruption ({', '.join(matched_high[:2])})")
    else:
        matched_med = [kw for kw in MEDIUM_SEVERITY_KEYWORDS if kw in desc_lower]
        if matched_med:
            severity_score = 20
            rationales.append(f"Equipment non-functional or damaged ({', '.join(matched_med[:2])})")
        else:
            severity_score = 10
            rationales.append("Minor wear or cosmetic maintenance need")

    # 3. Location / Campus Impact Check (0 - 20 points)
    matched_locs = [loc for loc in HIGH_IMPACT_LOCATIONS if loc in loc_lower or loc in desc_lower]
    if matched_locs:
        location_score = 20
        rationales.append(f"High-traffic campus facility ({matched_locs[0].title()})")
    elif any(term in loc_lower for term in ["corridor", "stair", "entrance", "lobby", "washroom"]):
        location_score = 15
        rationales.append("Shared common access area")
    else:
        location_score = 10
        rationales.append("Standard classroom or departmental space")

    # 4. People Affected (0 - 10 points)
    if people_affected >= 5:
        people_score = 10
        rationales.append(f"Multiple individuals affected ({people_affected}+)")
    elif people_affected >= 2:
        people_score = 6
        rationales.append(f"Multiple users impacted ({people_affected})")
    else:
        people_score = 3

    total_score = min(100, safety_score + severity_score + location_score + people_score)

    if safety_score == 40 or total_score >= 75:
        priority_level = "Critical"
    elif total_score >= 50:
        priority_level = "High"
    elif total_score >= 30:
        priority_level = "Medium"
    else:
        priority_level = "Low"

    return {
        "priority_level": priority_level,
        "total_score": total_score,
        "safety_score": safety_score,
        "severity_score": severity_score,
        "location_score": location_score,
        "people_score": people_score,
        "is_safety_hazard": safety_score >= 30,
        "rationale": "; ".join(rationales)
    }

def normalize_location_key(location: str) -> str:
    """Extract room/block markers like 'room 204', 'lh-1', 'lab 3' for clustering."""
    loc_lower = location.lower()
    # Match room numbers: room 204, r-204, 204
    match = re.search(r'\b(room|hall|lab|block|floor|lh|auditorium)?\s*([a-z0-9\-]+)\b', loc_lower)
    if match:
        return match.group(0).strip()
    return loc_lower.strip()

def calculate_text_similarity(tokens1: List[str], tokens2: List[str]) -> float:
    """Compute Jaccard similarity index between token sets."""
    s1 = set(tokens1)
    s2 = set(tokens2)
    if not s1 or not s2:
        return 0.0
    intersection = len(s1.intersection(s2))
    union = len(s1.union(s2))
    return intersection / union

def find_potential_duplicates(
    new_description: str,
    new_location: str,
    existing_issues: List[Dict[str, Any]],
    similarity_threshold: float = 0.28
) -> List[Dict[str, Any]]:
    """
    Identify potential duplicate/related issues among open/in-progress complaints.
    Compares location overlap + description token similarity.
    Never auto-deletes, returns list of candidates for user review.
    """
    candidates = []
    new_tokens = clean_tokens(new_description)
    new_loc_key = normalize_location_key(new_location)
    new_loc_tokens = set(clean_tokens(new_location))

    for issue in existing_issues:
        # Ignore already resolved issues for active duplicates
        if issue.get("status") == "Resolved":
            continue

        existing_desc = issue.get("description", "")
        existing_loc = issue.get("location", "")
        existing_tokens = clean_tokens(existing_desc)
        existing_loc_tokens = set(clean_tokens(existing_loc))

        # Check location match
        loc_overlap = len(new_loc_tokens.intersection(existing_loc_tokens)) > 0 or (
            new_loc_key and new_loc_key in existing_loc.lower()
        )

        desc_sim = calculate_text_similarity(new_tokens, existing_tokens)

        # Shared core keyword match (e.g. "fan", "leakage", "chair")
        shared_keywords = list(set(new_tokens).intersection(set(existing_tokens)))

        is_duplicate = False
        match_score = 0
        match_reasons = []

        if loc_overlap and desc_sim >= 0.25:
            is_duplicate = True
            match_score = int(min(98, (desc_sim * 60) + 40))
            match_reasons.append(f"Same location ('{existing_loc}')")
            if shared_keywords:
                match_reasons.append(f"Common topics: {', '.join(shared_keywords[:3])}")
        elif loc_overlap and len(shared_keywords) >= 1:
            # Same room and mentions same core object
            is_duplicate = True
            match_score = 75
            match_reasons.append(f"Matching location with '{shared_keywords[0]}'")
        elif desc_sim >= 0.50:
            # Highly identical phrasing even if location differs slightly
            is_duplicate = True
            match_score = int(desc_sim * 100)
            match_reasons.append(f"High description similarity ({match_score}%)")

        if is_duplicate:
            candidates.append({
                "id": issue.get("id"),
                "issue_code": issue.get("issue_code"),
                "title": issue.get("title", ""),
                "description": existing_desc,
                "location": existing_loc,
                "category": issue.get("category"),
                "priority": issue.get("priority"),
                "status": issue.get("status"),
                "people_affected": issue.get("people_affected", 1),
                "created_at": issue.get("created_at"),
                "match_score": match_score,
                "match_reason": " · ".join(match_reasons)
            })

    # Sort highest match score first
    candidates.sort(key=lambda x: x["match_score"], reverse=True)
    return candidates
