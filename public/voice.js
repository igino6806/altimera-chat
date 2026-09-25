/**
 * ALTIMERA VOICE RECORDER MODULE
 * Zabezpečený záznam hlasu cez MediaRecorder API
 */

const AltimeraVoice = (function () {
  let mediaRecorder = null;
  let audioChunks = [];
  let stream = null;
  let startTime = null;
  let timerInterval = null;
  let isRecording = false;

  function getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus'
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  }

  async function startRecording(onTick) {
    if (isRecording) return;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : {};

      mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.start(100); // chunk každých 100ms
      isRecording = true;
      startTime = Date.now();

      if (onTick) {
        onTick(0);
        timerInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          onTick(elapsed);
        }, 1000);
      }

      return true;
    } catch (err) {
      console.error("Chyba prístupu k mikrofónu:", err);
      throw err;
    }
  }

  function stopRecording() {
    return new Promise((resolve, reject) => {
      if (!isRecording || !mediaRecorder) {
        reject(new Error("Nenahráva sa."));
        return;
      }

      clearInterval(timerInterval);
      const durationSeconds = Math.max(1, Math.floor((Date.now() - startTime) / 1000));

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        cleanup();
        resolve({ blob: audioBlob, duration: durationSeconds, mimeType });
      };

      mediaRecorder.stop();
      isRecording = false;
    });
  }

  function cancelRecording() {
    if (!isRecording) return;
    clearInterval(timerInterval);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    cleanup();
    isRecording = false;
  }

  function cleanup() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    audioChunks = [];
    startTime = null;
  }

  function isCurrentlyRecording() {
    return isRecording;
  }

  return {
    startRecording,
    stopRecording,
    cancelRecording,
    isCurrentlyRecording
  };
})();
