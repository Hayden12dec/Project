import time
from typing import Dict, Tuple, Optional
from datetime import datetime
from backend.config.settings import settings
from backend.models.entities import RiskLevelEnum, EventTypeEnum
import logging

logger = logging.getLogger(__name__)

EVENT_WEIGHTS = {
    EventTypeEnum.FACE_NOT_DETECTED: settings.WEIGHT_FACE_NOT_DETECTED,
    EventTypeEnum.MULTIPLE_PERSONS_DETECTED: settings.WEIGHT_MULTIPLE_PERSONS,
    EventTypeEnum.MOBILE_PHONE_DETECTED: settings.WEIGHT_MOBILE_PHONE,
    EventTypeEnum.SUSPICIOUS_HEAD_MOVEMENT: settings.WEIGHT_SUSPICIOUS_HEAD_MOVEMENT,
    EventTypeEnum.LOOKING_LEFT: settings.WEIGHT_SUSPICIOUS_HEAD_MOVEMENT,
    EventTypeEnum.LOOKING_RIGHT: settings.WEIGHT_SUSPICIOUS_HEAD_MOVEMENT,
    EventTypeEnum.LOOKING_UP: settings.WEIGHT_SUSPICIOUS_HEAD_MOVEMENT,
    EventTypeEnum.LOOKING_DOWN: settings.WEIGHT_SUSPICIOUS_HEAD_MOVEMENT,
    EventTypeEnum.AUDIO_ACTIVITY_DETECTED: settings.WEIGHT_AUDIO_ACTIVITY,
    EventTypeEnum.STUDENT_ABSENT: settings.WEIGHT_STUDENT_ABSENT,
    EventTypeEnum.TAB_SWITCH_DETECTED: 15,
    EventTypeEnum.IMPERSONATION_DETECTED: 40,
}

class SuspicionScoringEngine:
    """
    Explainable Suspicion Scoring Engine with cooldown debouncing,
    cumulative score evaluation, and risk level categorization.
    """
    def __init__(self, cooldown_seconds=settings.EVIDENCE_COOLDOWN_SECONDS):
        self.cooldown_seconds = cooldown_seconds
        # attempt_id -> { event_type: last_event_timestamp }
        self._last_event_times: Dict[str, Dict[str, float]] = {}

    def get_event_points(self, event_type: str) -> int:
        return EVENT_WEIGHTS.get(event_type, 10)

    def calculate_risk_level(self, score: int) -> str:
        if score >= 60:
            return RiskLevelEnum.HIGH
        elif score >= 30:
            return RiskLevelEnum.MEDIUM
        return RiskLevelEnum.LOW

    def calculate_final_status(self, score: int, high_risk_events_count: int = 0) -> str:
        if score >= 60 or high_risk_events_count >= 2:
            return "HIGH_RISK"
        elif score >= 30 or high_risk_events_count >= 1:
            return "REVIEW_REQUIRED"
        return "NORMAL"

    def should_log_event(self, attempt_id: str, event_type: str, force_log: bool = False) -> Tuple[bool, int]:
        """
        Determines if event should be recorded and points awarded based on cooldown.
        Returns: (should_log: bool, points_to_add: int)
        """
        if force_log:
            points = self.get_event_points(event_type)
            return True, points

        now = time.time()
        if attempt_id not in self._last_event_times:
            self._last_event_times[attempt_id] = {}

        last_time = self._last_event_times[attempt_id].get(event_type, 0.0)
        
        # Check cooldown window
        if (now - last_time) < self.cooldown_seconds:
            # Event occurred too soon after previous same event -> ignore to prevent spam
            return False, 0

        # Update last logged time
        self._last_event_times[attempt_id][event_type] = now
        points = self.get_event_points(event_type)
        return True, points

    def reset_attempt(self, attempt_id: str):
        if attempt_id in self._last_event_times:
            del self._last_event_times[attempt_id]

scoring_engine = SuspicionScoringEngine()
