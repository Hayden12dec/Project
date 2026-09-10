import time
import pytest
from backend.ai.scoring_engine import SuspicionScoringEngine
from backend.models.entities import EventTypeEnum, RiskLevelEnum

def test_scoring_weights_and_risk_levels():
    engine = SuspicionScoringEngine(cooldown_seconds=1.0)
    
    # 0 to 29 is LOW
    assert engine.calculate_risk_level(0) == RiskLevelEnum.LOW
    assert engine.calculate_risk_level(25) == RiskLevelEnum.LOW
    
    # 30 to 59 is MEDIUM
    assert engine.calculate_risk_level(30) == RiskLevelEnum.MEDIUM
    assert engine.calculate_risk_level(55) == RiskLevelEnum.MEDIUM
    
    # 60+ is HIGH
    assert engine.calculate_risk_level(60) == RiskLevelEnum.HIGH
    assert engine.calculate_risk_level(110) == RiskLevelEnum.HIGH

def test_cooldown_debouncing():
    engine = SuspicionScoringEngine(cooldown_seconds=2.0)
    attempt_id = "test_att_1"
    
    # First phone detected
    log1, pts1 = engine.should_log_event(attempt_id, EventTypeEnum.MOBILE_PHONE_DETECTED)
    assert log1 is True
    assert pts1 == 50
    
    # Immediate duplicate detection within 2 seconds should be debounced
    log2, pts2 = engine.should_log_event(attempt_id, EventTypeEnum.MOBILE_PHONE_DETECTED)
    assert log2 is False
    assert pts2 == 0
    
    # Different event type in same time should NOT be blocked
    log3, pts3 = engine.should_log_event(attempt_id, EventTypeEnum.MULTIPLE_PERSONS_DETECTED)
    assert log3 is True
    assert pts3 == 40
