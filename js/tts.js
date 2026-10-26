/** 浏览器语音合成封装。 */
export class TTS {
  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voices = [];
    this.current = null;
    this.generation = 0;
    this.listeners = new Set();
    if (this.supported) {
      this.refresh();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        this.refresh();
        this.emit();
      });
    }
  }

  refresh() {
    if (!this.supported) return;
    try {
      this.voices = window.speechSynthesis
        .getVoices()
        .filter((voice) => String(voice.lang || '').toLowerCase().startsWith('en'));
    } catch {
      this.voices = [];
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this.voices);
  }

  getVoices() {
    return [...this.voices].sort((a, b) => {
      const score = (voice) => {
        const lang = String(voice.lang || '').toLowerCase();
        if (lang === 'en-gb') return 0;
        if (lang === 'en-us') return 1;
        return 2;
      };
      return score(a) - score(b) || a.name.localeCompare(b.name);
    });
  }

  resolveVoice(name) {
    const voices = this.getVoices();
    if (name) {
      const exact = voices.find((voice) => voice.name === name);
      if (exact) return exact;
    }
    return voices[0] || null;
  }

  speak(text, options = {}) {
    const { rate = 1, voiceName = '', onStart, onEnd, onError } = options;
    if (!this.supported) {
      onError?.(new Error('当前浏览器不支持语音朗读'));
      return null;
    }
    if (!text || !String(text).trim()) return null;
    const generation = ++this.generation;
    this.cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(String(text));
    const voice = this.resolveVoice(voiceName);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = Math.min(1.5, Math.max(0.5, Number(rate) || 1));
    utterance.pitch = 1;
    utterance.onstart = () => {
      if (generation !== this.generation) return;
      onStart?.();
    };
    utterance.onend = () => {
      if (generation !== this.generation) return;
      if (this.current === utterance) this.current = null;
      onEnd?.();
    };
    utterance.onerror = (event) => {
      if (generation !== this.generation) return;
      if (this.current === utterance) this.current = null;
      onError?.(event.error || event);
    };
    this.current = utterance;
    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      this.current = null;
      onError?.(error);
      return null;
    }
    return utterance;
  }

  cancelSpeech() {
    const current = this.current;
    this.current = null;
    if (current) {
      // 解绑旧回调，避免 cancel() 触发的 onend/onerror 作用到新播放
      current.onstart = null;
      current.onend = null;
      current.onerror = null;
    }
    if (!this.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* 忽略 */
    }
  }

  cancel() {
    this.generation += 1;
    this.cancelSpeech();
  }

  pause() {
    if (this.supported) window.speechSynthesis.pause();
  }

  resume() {
    if (this.supported) window.speechSynthesis.resume();
  }

  isSpeaking() {
    return this.supported && window.speechSynthesis.speaking;
  }
}

export const tts = new TTS();
