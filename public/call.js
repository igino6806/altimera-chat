/**
 * ALTIMERA SECURE CHAT - WEBRTC ENCRYPTED VOICE CALLING
 * Zero-Knowledge peer-to-peer real-time audio with DTLS-SRTP encryption
 */

class AltimeraCallManager {
  constructor() {
    this.socket = null;
    this.localStream = null;
    this.peerConnection = null;
    this.callState = 'idle'; // 'idle' | 'calling' | 'incoming' | 'connected'
    this.activePartnerId = null;
    this.activePartnerName = null;
    this.currentRoomId = 'main';
    this.myNickname = '';
    this.callStartTime = null;
    this.callTimerInterval = null;
    this.isMuted = false;
    this.audioCtx = null;
    this.ringtoneOscillator = null;
    this.ringtoneInterval = null;

    // ICE STUN servery (štandardné pre peer-to-peer spojenie cez NAT / mobilné siete)
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    this.initDOM();
  }

  initDOM() {
    // Hidden audio element for remote voice
    let remoteAudio = document.getElementById('remoteAudio');
    if (!remoteAudio) {
      remoteAudio = document.createElement('audio');
      remoteAudio.id = 'remoteAudio';
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      document.body.appendChild(remoteAudio);
    }
    this.remoteAudio = remoteAudio;

    // Call Floating Banner
    this.callBanner = document.getElementById('activeCallBanner');
    this.callPartnerText = document.getElementById('callPartnerText');
    this.callTimerText = document.getElementById('callTimerText');
    this.btnMuteMic = document.getElementById('btnMuteMic');
    this.btnEndCall = document.getElementById('btnEndCall');

    // Incoming Call Modal
    this.incomingModal = document.getElementById('incomingCallModal');
    this.incomingCallerText = document.getElementById('incomingCallerText');
    this.btnAcceptCall = document.getElementById('btnAcceptCall');
    this.btnRejectCall = document.getElementById('btnRejectCall');

    // Bind UI actions
    if (this.btnMuteMic) {
      this.btnMuteMic.addEventListener('click', () => this.toggleMute());
    }
    if (this.btnEndCall) {
      this.btnEndCall.addEventListener('click', () => this.hangup(true));
    }
    if (this.btnAcceptCall) {
      this.btnAcceptCall.addEventListener('click', () => this.acceptIncomingCall());
    }
    if (this.btnRejectCall) {
      this.btnRejectCall.addEventListener('click', () => this.rejectIncomingCall());
    }
  }

  initSocket(socket, nickname, roomId) {
    this.socket = socket;
    this.myNickname = nickname;
    this.currentRoomId = roomId;

    // Listeners from server
    this.socket.on('incoming_call', (data) => this.handleIncomingCall(data));
    this.socket.on('call_accepted', (data) => this.handleCallAccepted(data));
    this.socket.on('call_rejected', (data) => this.handleCallRejected(data));
    this.socket.on('call_signal', (data) => this.handleCallSignal(data));
    this.socket.on('call_ended', (data) => this.handleCallEnded(data));
  }

  setRoom(roomId) {
    this.currentRoomId = roomId;
  }

  setNickname(name) {
    this.myNickname = name;
  }

  // --- AUDIO SYNTHESIZER PRE ZVONENIE (bez potreby sťahovania mp3 súborov) ---
  playTone(freq, durationMs) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + durationMs / 1000);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + durationMs / 1000);
    } catch (e) {
      console.warn('Tone synth warning:', e);
    }
  }

  startOutgoingRing() {
    this.stopRingtone();
    this.playTone(425, 800);
    this.ringtoneInterval = setInterval(() => {
      this.playTone(425, 800);
    }, 2500);
  }

  startIncomingRing() {
    this.stopRingtone();
    const doubleBeep = () => {
      this.playTone(550, 200);
      setTimeout(() => this.playTone(660, 300), 220);
    };
    doubleBeep();
    this.ringtoneInterval = setInterval(doubleBeep, 2000);
  }

  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  // --- VYTOČENIE HOVORU ---
  async startCall() {
    if (this.callState !== 'idle') {
      alert('Hovor už prebieha alebo sa práve vytáča.');
      return;
    }

    try {
      // 1. Žiadosť o prístup k mikrofónu
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Pre volanie je potrebné povoliť prístup k mikrofónu.');
      return;
    }

    this.callState = 'calling';
    this.activePartnerName = 'Skupina';
    this.startOutgoingRing();

    this.showCallBanner('Vytáčam hovor...');
    if (this.callTimerText) this.callTimerText.textContent = 'Zvoní...';

    // Odošleme signál celej skupine
    this.socket.emit('call_start', { roomId: this.currentRoomId });
  }

  // --- PRICHÁDZAJÚCI HOVOR ---
  handleIncomingCall(data) {
    if (this.callState !== 'idle') {
      // Už hovoríme - automaticky zamietnuť obsadené
      this.socket.emit('call_reject', { callerId: data.callerId });
      return;
    }

    this.callState = 'incoming';
    this.activePartnerId = data.callerId;
    this.activePartnerName = data.caller;

    if (this.incomingCallerText) {
      this.incomingCallerText.textContent = `${data.caller} ti volá...`;
    }
    if (this.incomingModal) {
      this.incomingModal.classList.remove('hidden');
    }

    this.startIncomingRing();
  }

  async acceptIncomingCall() {
    this.stopRingtone();
    if (this.incomingModal) this.incomingModal.classList.add('hidden');

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Pre prijatie hovoru je potrebné povoliť prístup k mikrofónu.');
      this.rejectIncomingCall();
      return;
    }

    this.callState = 'connected';
    this.initPeerConnection(this.activePartnerId);

    // Pridáme náš audio track
    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    this.socket.emit('call_accept', { callerId: this.activePartnerId });
    this.showCallBanner(`Hovor: ${this.activePartnerName}`);
    this.startCallTimer();
  }

  rejectIncomingCall() {
    this.stopRingtone();
    if (this.incomingModal) this.incomingModal.classList.add('hidden');
    if (this.activePartnerId) {
      this.socket.emit('call_reject', { callerId: this.activePartnerId });
    }
    this.resetCallState();
  }

  // --- SPOJENIE A SIGNALIZÁCIA ---
  async handleCallAccepted(data) {
    if (this.callState !== 'calling') return;
    this.stopRingtone();

    this.callState = 'connected';
    this.activePartnerId = data.calleeId;
    this.activePartnerName = data.callee;

    this.showCallBanner(`Hovor: ${data.callee}`);
    this.startCallTimer();

    this.initPeerConnection(data.calleeId);

    // Pridáme náš audio track
    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    // Vytvoríme ponuku (SDP Offer)
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.socket.emit('call_signal', {
        targetId: data.calleeId,
        signal: { type: 'offer', sdp: offer }
      });
    } catch (err) {
      console.error('Error creating offer:', err);
      this.hangup(true);
    }
  }

  handleCallRejected(data) {
    this.stopRingtone();
    alert(`${data.callee || 'Účastník'} odmietol hovor.`);
    this.hangup(false);
  }

  async handleCallSignal(data) {
    if (!this.peerConnection && this.callState === 'connected') {
      this.initPeerConnection(data.senderId);
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }
    }

    if (!this.peerConnection) return;

    const { signal } = data;

    try {
      if (signal.type === 'offer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.socket.emit('call_signal', {
          targetId: data.senderId,
          signal: { type: 'answer', sdp: answer }
        });
      } else if (signal.type === 'answer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === 'candidate') {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.error('Error handling WebRTC signal:', err);
    }
  }

  initPeerConnection(targetId) {
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch(e){}
    }

    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    // Posielanie ICE kandidátov druhému zariadeniu
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && targetId) {
        this.socket.emit('call_signal', {
          targetId: targetId,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    // Prijatý vzdialený zvuk
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote audio track!');
      if (this.remoteAudio) {
        this.remoteAudio.srcObject = event.streams[0];
        this.remoteAudio.play().catch(e => console.log('Audio autoplay prevented:', e));
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('WebRTC state:', this.peerConnection.connectionState);
      if (['disconnected', 'failed', 'closed'].includes(this.peerConnection.connectionState)) {
        this.hangup(false);
      }
    };
  }

  // --- UKONČENIE HOVORU ---
  hangup(emitToServer = true) {
    this.stopRingtone();
    if (emitToServer && this.socket && this.activePartnerId) {
      this.socket.emit('call_end', {
        targetId: this.activePartnerId,
        roomId: this.currentRoomId
      });
    }

    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (e) {}
      this.peerConnection = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
    }

    this.resetCallState();
  }

  handleCallEnded(data) {
    this.stopRingtone();
    if (this.callState !== 'idle') {
      alert(`${data.by || 'Partner'} ukončil hovor.`);
      this.hangup(false);
    }
  }

  // --- UI OVLÁDANIE ---
  showCallBanner(text) {
    if (this.callBanner) this.callBanner.classList.remove('hidden');
    if (this.callPartnerText) this.callPartnerText.textContent = text;
  }

  hideCallBanner() {
    if (this.callBanner) this.callBanner.classList.add('hidden');
  }

  startCallTimer() {
    this.callStartTime = Date.now();
    if (this.callTimerInterval) clearInterval(this.callTimerInterval);

    this.callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      if (this.callTimerText) {
        this.callTimerText.textContent = `${mins}:${secs}`;
      }
    }, 1000);
  }

  stopCallTimer() {
    if (this.callTimerInterval) {
      clearInterval(this.callTimerInterval);
      this.callTimerInterval = null;
    }
    if (this.callTimerText) this.callTimerText.textContent = '00:00';
  }

  toggleMute() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.isMuted = !this.isMuted;
      audioTrack.enabled = !this.isMuted;
      if (this.btnMuteMic) {
        this.btnMuteMic.innerHTML = this.isMuted ? '<span>🔇 Zrušiť stlmenie</span>' : '<span>🎙️ Stlmiť</span>';
        this.btnMuteMic.classList.toggle('btn-muted', this.isMuted);
      }
    }
  }

  resetCallState() {
    this.callState = 'idle';
    this.activePartnerId = null;
    this.activePartnerName = null;
    this.isMuted = false;
    this.stopCallTimer();
    this.hideCallBanner();
    if (this.btnMuteMic) {
      this.btnMuteMic.innerHTML = '<span>🎙️ Stlmiť</span>';
      this.btnMuteMic.classList.remove('btn-muted');
    }
    if (this.incomingModal) {
      this.incomingModal.classList.add('hidden');
    }
  }
}

// Export singleton instance
window.AltimeraCallManager = new AltimeraCallManager();
