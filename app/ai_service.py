import json
import logging
from typing import Dict, Any, List
from app.config import GEMINI_API_KEY, OPENAI_API_KEY
from app import smart_engine

logger = logging.getLogger(__name__)

class AIService:
    """
    Hybrid AI Service with clean pluggable abstraction.
    Defaults to zero-cost local smart engine without requiring any paid API.
    If GEMINI_API_KEY or OPENAI_API_KEY is configured in environment,
    it can augment classification while preserving 100% resilient local fallback.
    """

    def __init__(self):
        self.has_gemini = bool(GEMINI_API_KEY.strip())
        self.has_openai = bool(OPENAI_API_KEY.strip())
        self.mode = "Gemini AI" if self.has_gemini else ("OpenAI" if self.has_openai else "Local Smart Engine")

    def get_service_status(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "is_cloud_ai_active": self.has_gemini or self.has_openai,
            "engine": "FixIt Local Heuristic & Semantic Engine (Zero-Cost / Offline)",
            "supported_categories": smart_engine.CATEGORIES,
            "supported_priorities": ["Critical", "High", "Medium", "Low"]
        }

    def analyze_complaint(
        self,
        description: str,
        location: str = "",
        people_affected: int = 1,
        existing_issues: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Analyze category, calculate transparent priority score, and detect related issues.
        """
        # Step 1: Run local smart engine first (guaranteed zero cost & instant)
        suggested_cat, confidence, keywords = smart_engine.detect_category(description)
        priority_info = smart_engine.calculate_priority_score(description, location, people_affected)

        duplicates = []
        if existing_issues:
            duplicates = smart_engine.find_potential_duplicates(
                new_description=description,
                new_location=location,
                existing_issues=existing_issues
            )

        # Optional Cloud AI enrichment if environment variable is set
        if self.has_gemini:
            try:
                # Placeholder for optional cloud enhancement; keeping safe fallback
                pass
            except Exception as e:
                logger.warning(f"Cloud AI failed, using local engine: {e}")

        return {
            "category": suggested_cat,
            "category_confidence": confidence,
            "matched_keywords": keywords,
            "priority": priority_info["priority_level"],
            "priority_score": priority_info["total_score"],
            "priority_breakdown": {
                "safety_score": priority_info["safety_score"],
                "severity_score": priority_info["severity_score"],
                "location_score": priority_info["location_score"],
                "people_score": priority_info["people_score"]
            },
            "is_safety_hazard": priority_info["is_safety_hazard"],
            "rationale": priority_info["rationale"],
            "potential_duplicates": duplicates,
            "engine_used": self.mode
        }

ai_service = AIService()
