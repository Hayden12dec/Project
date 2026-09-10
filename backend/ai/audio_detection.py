import logging
from backend.config.settings import settings

logger = logging.getLogger(__name__)

class AudioActivityDetector:
    """
    Evaluates ambient microphone energy levels against configurable thresholds
    to detect talking, whispering, or unusual background noise without storing audio content.
    Uses exponential moving average smoothing to filter mic noise spikes.
    """
    def __init__(self, energy_threshold=settings.WEIGHT_AUDIO_ACTIVITY):
        self.energy_threshold = settings.AUDIO_ENERGY_THRESHOLD
        self.consecutive_loud_samples = 0
        # Exponential moving average for energy smoothing
        self._smoothed_energy = 0.0
        self._alpha = 0.4  # Smoothing factor (0.0=slow response, 1.0=no smoothing)

    def analyze_energy(self, audio_energy: float) -> dict:
        """
        Analyzes audio RMS energy (range 0.0 to 1.0).
        Returns:
            {
                "is_talking": bool,
                "energy_level": float,
                "threshold": float,
                "status": "NORMAL" | "AUDIO_ACTIVITY_DETECTED"
            }
        """
        if audio_energy is None:
            audio_energy = 0.0

        # Exponential moving average to smooth out mic noise spikes
        self._smoothed_energy = (self._alpha * audio_energy) + ((1.0 - self._alpha) * self._smoothed_energy)

        is_active = self._smoothed_energy >= self.energy_threshold
        
        if is_active:
            self.consecutive_loud_samples += 1
        else:
            self.consecutive_loud_samples = max(0, self.consecutive_loud_samples - 1)

        # Flag only if activity persists for at least 2 consecutive checks
        flagged = self.consecutive_loud_samples >= 2

        return {
            "is_talking": flagged,
            "energy_level": round(float(self._smoothed_energy), 4),
            "raw_energy": round(float(audio_energy), 4),
            "threshold": self.energy_threshold,
            "status": "AUDIO_ACTIVITY_DETECTED" if flagged else "NORMAL"
        }

audio_detector = AudioActivityDetector()
