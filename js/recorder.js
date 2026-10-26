/** 跟读录音：MediaRecorder 录制、回放、释放。 */
export class Recorder {
  constructor() {
    this.supported = Boolean(
      typeof navigator !== 'undefined' &&
        navigator.mediaDevices?.getUserMedia &&
        typeof window !== 'undefined' &&
        window.MediaRecorder,
    );
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.url = '';
    this.audio = null;
  }

  async start() {
    if (!this.supported) throw new Error('当前浏览器不支持录音');
    this.stopPlayback();
    this.discard();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''].find((type) => {
      if (!type) return true;
      return window.MediaRecorder.isTypeSupported?.(type);
    });
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) this.chunks.push(event.data);
    });
    this.recorder.start();
    return true;
  }

  async stop() {
    if (!this.recorder || this.recorder.state === 'inactive') return '';
    return new Promise((resolve) => {
      this.recorder.addEventListener(
        'stop',
        () => {
          const blob = new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' });
          this.url = URL.createObjectURL(blob);
          this.cleanupStream();
          resolve(this.url);
        },
        { once: true },
      );
      this.recorder.stop();
    });
  }

  get isRecording() {
    return this.recorder?.state === 'recording';
  }

  play(url = this.url) {
    if (!url) return;
    this.stopPlayback();
    this.audio = new Audio(url);
    this.audio.play().catch(() => {});
  }

  stopPlayback() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
  }

  cleanupStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  discard() {
    this.stopPlayback();
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = '';
    }
  }

  destroy() {
    this.discard();
    this.cleanupStream();
    this.recorder = null;
    this.chunks = [];
  }
}

export const recorder = new Recorder();
