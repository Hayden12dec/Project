import os
import time
import pytest
import numpy as np
import cv2
from backend.ai.phone_detection import PhoneDetector, PHONE_KEYWORDS
from backend.config.settings import settings
from backend.models.entities import EventTypeEnum

def create_synthetic_scene(has_phone=True, orientation="vertical", position="hand", occlusion=0.0):
    """
    Synthesizes a realistic webcam frame (640x480) with a student and optionally a mobile phone.
    - orientation: "vertical" (portrait) or "horizontal" (landscape)
    - position: "hand", "face", "lower"
    - occlusion: fraction of phone covered (0.0 to 0.5)
    """
    img = np.full((480, 640, 3), 40, dtype=np.uint8) # Dark room background
    
    # 1. Draw student torso & head
    cv2.ellipse(img, (320, 440), (160, 100), 0, 0, 360, (70, 50, 40), -1) # torso
    cv2.ellipse(img, (320, 220), (75, 100), 0, 0, 360, (180, 190, 230), -1) # face
    # eyes
    cv2.circle(img, (290, 205), 8, (60, 60, 60), -1)
    cv2.circle(img, (350, 205), 8, (60, 60, 60), -1)

    if not has_phone:
        return img

    # 2. Determine phone coordinates
    if orientation == "vertical":
        pw, ph = 48, 96
    else:
        pw, ph = 96, 48

    if position == "face":
        px, py = 390, 180
    elif position == "lower":
        px, py = 320, 370
    else: # hand / near center-right
        px, py = 410, 290

    # Draw Phone Body (Black/Dark bezel with metallic border)
    cv2.rectangle(img, (px, py), (px + pw, py + ph), (25, 25, 25), -1)
    cv2.rectangle(img, (px, py), (px + pw, py + ph), (180, 180, 180), 2)
    # Phone glowing screen
    screen_margin = 4
    cv2.rectangle(
        img,
        (px + screen_margin, py + screen_margin),
        (px + pw - screen_margin, py + ph - screen_margin),
        (220, 210, 200),
        -1
    )
    # Camera notch/lens
    cv2.circle(img, (px + pw // 2, py + 8), 3, (10, 10, 10), -1)

    # 3. Apply Hand / Occlusion if specified
    if occlusion > 0:
        hand_h = int(ph * occlusion)
        cv2.ellipse(
            img,
            (px + pw // 2, py + ph - hand_h // 2),
            (pw // 2 + 6, hand_h // 2 + 4),
            0, 0, 360,
            (180, 190, 230), # Skin color covering bottom of phone
            -1
        )

    return img


def test_phone_detector_initialization():
    """Verify that YOLO model loads and dynamically inspects class names."""
    detector = PhoneDetector()
    assert detector.yolo_model is not None, "YOLO model should be loaded"
    assert len(detector.model_names_map) > 0, "Model class names must be mapped"
    assert len(detector.phone_class_ids) > 0, "Must have identified at least one phone class ID"
    
    # Check that discovered names match expected keywords
    phone_names = [detector.model_names_map[cid].lower() for cid in detector.phone_class_ids]
    assert any("phone" in name or "cell" in name for name in phone_names)
    print(f"\n[PASS] Model classes count: {len(detector.model_names_map)}, Phone classes: {phone_names}")


def test_avoid_hardcoded_class_indices():
    """Verify detector matches class names dynamically regardless of ID."""
    detector = PhoneDetector()
    # Test helper functions
    assert detector.is_phone_class(999, class_name="Cell Phone") is True
    assert detector.is_phone_class(999, class_name="Mobile Phone") is True
    assert detector.is_phone_class(999, class_name="smartphone") is True
    assert detector.is_phone_class(999, class_name="person") is False
    assert detector.is_phone_class(999, class_name="coffee mug") is False


def test_negative_control_person_without_phone():
    """Verify that a frame without a phone does NOT trigger false positive phone detections."""
    detector = PhoneDetector()
    frame_no_phone = create_synthetic_scene(has_phone=False)
    res = detector.detect_and_analyze(frame_no_phone, conf_threshold=0.40)
    
    assert res["phone_detected"] is False
    assert res["phone_confirmed"] is False
    assert res["should_trigger_event"] is False
    assert len(res["detections"]) == 0
    print("\n[PASS] Negative control: No phone detected in blank/person frame.")


def test_configurable_confidence_threshold():
    """Verify that confidence threshold can be adjusted dynamically."""
    detector = PhoneDetector(confidence_threshold=0.40)
    assert detector.confidence_threshold == 0.40
    
    detector_strict = PhoneDetector(confidence_threshold=0.85)
    assert detector_strict.confidence_threshold == 0.85


def test_temporal_confirmation_and_debounce():
    """
    Verify requirement 9 & 11:
    - Single frame detection does NOT immediately trigger event when temporal_frames=2.
    - Second consecutive frame confirms detection and triggers event once.
    - Continued presence stays confirmed but does NOT re-trigger event (prevents score spamming).
    - Disappearance resets incident state after missed frames.
    """
    detector = PhoneDetector(temporal_frames=2, temporal_window_sec=2.0)
    attempt_id = "test_candidate_attempt_101"
    detector.reset_attempt(attempt_id)

    # Frame 1: Phone present (1st detection)
    res1 = detector.detect_and_analyze(
        image=np.ones((100, 100, 3), dtype=np.uint8),
        track_attempt_id=attempt_id
    )
    # Manually simulate phone detection in temporal state for precision testing
    state = detector._temporal_state[attempt_id]
    
    # Simulate single raw detection
    conf, trig = detector._update_temporal_state(attempt_id, phone_detected=True, confidence=0.88)
    assert conf is False, "Frame 1 should be pending temporal confirmation (not confirmed yet)"
    assert trig is False, "Frame 1 should NOT trigger violation event yet"

    # Frame 2: Phone still present (2nd detection -> meets temporal_frames=2)
    conf2, trig2 = detector._update_temporal_state(attempt_id, phone_detected=True, confidence=0.91)
    assert conf2 is True, "Frame 2 MUST confirm phone detection"
    assert trig2 is True, "Frame 2 MUST trigger the violation event (+50 pts)"

    # Frame 3: Phone still present (3rd detection -> sustained ongoing violation)
    conf3, trig3 = detector._update_temporal_state(attempt_id, phone_detected=True, confidence=0.90)
    assert conf3 is True, "Frame 3 remains confirmed"
    assert trig3 is False, "Frame 3 must NOT re-trigger violation event (prevents point spamming)"

    # Frame 4: Phone disappears
    conf4, trig4 = detector._update_temporal_state(attempt_id, phone_detected=False, confidence=0.0)
    assert conf4 is False

    # Frame 5: Phone still absent (2 consecutive misses -> resets active incident)
    conf5, trig5 = detector._update_temporal_state(attempt_id, phone_detected=False, confidence=0.0)
    assert detector._temporal_state[attempt_id]["incident_active"] is False, "Incident should be reset after absence"

    print("\n[PASS] Temporal confirmation & debounce successfully verified.")


def test_debug_telemetry_structure():
    """Verify requirement 6: Debug mode output contains all diagnostic metrics."""
    detector = PhoneDetector(debug_mode=True)
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    res = detector.detect_and_analyze(blank, include_debug=True)
    
    dbg = res.get("debug_telemetry")
    assert dbg is not None, "Debug telemetry must be present when debug_mode=True"
    assert "model_name" in dbg
    assert "model_classes_count" in dbg
    assert "total_detections" in dbg
    assert "detected_classes" in dbg
    assert "phone_detected" in dbg
    assert "phone_confidence" in dbg
    assert "phone_boxes" in dbg
    assert "threshold" in dbg
    assert "fps" in dbg
    assert "inference_time_ms" in dbg
    print(f"\n[PASS] Debug telemetry verified: {dbg}")


def test_all_phone_scenarios():
    """
    Requirement 12: Test and record detection results across specific scenarios:
    1. Person holding a smartphone (vertical)
    2. Person holding phone horizontally
    3. Phone partially hidden by hand
    4. Phone close to face
    5. Phone near the lower part of the webcam frame
    6. Person without phone
    """
    detector = PhoneDetector(confidence_threshold=0.35)
    
    scenarios = [
        ("1. Person holding smartphone vertically", {"has_phone": True, "orientation": "vertical", "position": "hand", "occlusion": 0.0}),
        ("2. Person holding smartphone horizontally", {"has_phone": True, "orientation": "horizontal", "position": "hand", "occlusion": 0.0}),
        ("3. Phone partially hidden by hand", {"has_phone": True, "orientation": "vertical", "position": "hand", "occlusion": 0.35}),
        ("4. Phone close to face", {"has_phone": True, "orientation": "vertical", "position": "face", "occlusion": 0.0}),
        ("5. Phone near lower part of frame", {"has_phone": True, "orientation": "horizontal", "position": "lower", "occlusion": 0.0}),
        ("6. Person without phone (negative control)", {"has_phone": False, "orientation": "vertical", "position": "hand", "occlusion": 0.0}),
    ]

    print("\n" + "="*70)
    print("AI PROCTORING CV PHONE DETECTION TEST BENCHMARK RESULTS")
    print("="*70)

    for title, params in scenarios:
        frame = create_synthetic_scene(**params)
        res = detector.detect_and_analyze(frame, conf_threshold=0.35, include_debug=True)
        phone_dets = res["detections"]
        dbg = res["debug_telemetry"]
        
        print(f"\nScenario: {title}")
        print(f"  Frame Size: {frame.shape[1]}x{frame.shape[0]}")
        print(f"  Phone Detected Flag: {res['phone_detected']}")
        print(f"  Max Confidence: {res['max_confidence']}")
        print(f"  Detections Count: {len(phone_dets)}")
        if phone_dets:
            for d in phone_dets:
                print(f"    -> Label: {d['label']}, Conf: {d['confidence']}, BBox: {d['bbox']}")
        print(f"  Inference Time: {dbg['inference_time_ms']} ms | Model: {dbg['model_name']}")

    print("\n" + "="*70)

