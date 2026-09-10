// Web Audio API Ambient Volume & Speech Energy Meter
export class AudioMonitor {
  constructor(onAudioActivity) {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.javascriptNode = null;
    this.isListening = false;
    this.currentEnergy = 0.0;
    this.onAudioActivity = onAudioActivity;
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.fftSize = 512;

      this.microphone.connect(this.analyser);
      this.isListening = true;

      this._loopAnalysis();
      return true;
    } catch (err) {
      console.warn('Microphone stream error:', err);
      return false;
    }
  }

  _loopAnalysis() {
    if (!this.isListening) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length) / 255;
    this.currentEnergy = rms;

    if (this.onAudioActivity && rms > 0.04) {
      this.onAudioActivity(rms);
    }

    requestAnimationFrame(() => this._loopAnalysis());
  }

  getEnergyLevel() {
    return this.currentEnergy;
  }

  stop() {
    this.isListening = false;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}
