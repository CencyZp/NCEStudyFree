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
    this.starting = false;
    this.cancelled = false;
  }

  async start() {
    if (!this.supported) throw new Error('当前浏览器不支持录音');
    if (this.starting) throw new Error('录音正在启动');
    this.starting = true;
    this.cancelled = false;
    this.stopPlayback();
    this.discard();
    this.cleanupStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 权限弹窗期间用户可能已离开页面
      if (this.cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('录音已取消');
      }
      this.stream = stream;
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
    } finally {
      this.starting = false;
    }
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
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        /* 忽略 */
      }
    }
    this.recorder = null;
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = '';
    }
  }

  destroy() {
    this.cancelled = true;
    this.discard();
    this.cleanupStream();
    this.recorder = null;
    this.chunks = [];
  }
}

export const recorder = new Recorder();
