/**
 * ALTIMERA SECURE CHAT - CLIENT APPLICATION
 * Hlasové správy, PWA Service Worker, Notifikácie a Persistent Login
 */

(function () {
  let socket = null;
  let encryptionKey = null;
  let currentNickname = "";
  let activePin = "Altimera2026!";
  let currentRoomId = "main";
  let currentRoomName = "Altimera Hlavný Chat";
  let isTypingActive = false;
  let typingTimer = null;
  let deferredInstallPrompt = null;

  // Cache pre dešifrované audio nahrávky (msgId -> objectUrl)
  const audioBlobUrlCache = new Map();

  // 1. REGISTRÁCIA SERVICE WORKERA (PWA)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.log("Service Worker info:", err);
    });
  }

  // DOM Elements - Auth
  const authScreen = document.getElementById("authScreen");
  const chatScreen = document.getElementById("chatScreen");
  const authForm = document.getElementById("authForm");
  const nicknameInput = document.getElementById("nicknameInput");
  const pinInput = document.getElementById("pinInput");
  const togglePinBtn = document.getElementById("togglePinVisibility");
  const authErrorMessage = document.getElementById("authErrorMessage");
  const btnEnter = document.getElementById("btnEnter");
  const targetRoomBanner = document.getElementById("targetRoomBanner");
  const targetRoomNameText = document.getElementById("targetRoomNameText");

  // DOM Elements - Header & Rooms
  const btnRoomSelector = document.getElementById("btnRoomSelector");
  const currentRoomDisplay = document.getElementById("currentRoomDisplay");
  const roomsDropdown = document.getElementById("roomsDropdown");
  const roomsListElement = document.getElementById("roomsListElement");
  const btnOpenCreateRoomModal = document.getElementById("btnOpenCreateRoomModal");
  const btnShareInvite = document.getElementById("btnShareInvite");
  const btnStartCall = document.getElementById("btnStartCall");
  const btnInstallApp = document.getElementById("btnInstallApp");
  const btnEnableNotifications = document.getElementById("btnEnableNotifications");

  const btnOnlineMembers = document.getElementById("btnOnlineMembers");
  const onlineCountBadge = document.getElementById("onlineCountBadge");
  const onlinePanel = document.getElementById("onlinePanel");
  const btnCloseOnlinePanel = document.getElementById("btnCloseOnlinePanel");
  const onlineList = document.getElementById("onlineList");
  const btnPanicWipe = document.getElementById("btnPanicWipe");
  const btnLogout = document.getElementById("btnLogout");

  // DOM Elements - Modal
  const createRoomModal = document.getElementById("createRoomModal");
  const createRoomForm = document.getElementById("createRoomForm");
  const newRoomNameInput = document.getElementById("newRoomNameInput");
  const btnCloseCreateRoomModal = document.getElementById("btnCloseCreateRoomModal");
  const btnCancelCreateRoom = document.getElementById("btnCancelCreateRoom");

  // DOM Elements - Chat & Input
  const chatMain = document.getElementById("chatMain");
  const messagesContainer = document.getElementById("messagesContainer");
  const typingIndicator = document.getElementById("typingIndicator");
  const typingUserText = document.getElementById("typingUserText");
  const messageForm = document.getElementById("messageForm");
  const messageInput = document.getElementById("messageInput");
  const fileInput = document.getElementById("fileInput");
  const btnAttachFile = document.getElementById("btnAttachFile");

  // DOM Elements - Voice Recording
  const btnRecordVoice = document.getElementById("btnRecordVoice");
  const voiceRecordingBar = document.getElementById("voiceRecordingBar");
  const recordingTimer = document.getElementById("recordingTimer");
  const btnCancelVoice = document.getElementById("btnCancelVoice");
  const btnSendVoice = document.getElementById("btnSendVoice");

  // 2. SPRACOVANIE URL PARAMETROV & PERSISTENT SESSION
  const urlParams = new URLSearchParams(window.location.search);
  const paramRoom = urlParams.get("room");
  const paramPin = urlParams.get("pin");
  const isExplicitLogout = urlParams.get("logout") === "1";

  if (paramRoom) {
    currentRoomId = paramRoom;
    targetRoomBanner.classList.remove("hidden");
    targetRoomNameText.textContent = paramRoom;
  }

  if (paramPin) {
    pinInput.value = paramPin;
  }

  // PWA Inštalácia
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstallApp) {
      btnInstallApp.classList.remove("hidden");
    }
  });

  if (btnInstallApp) {
    btnInstallApp.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === "accepted") {
          btnInstallApp.classList.add("hidden");
        }
        deferredInstallPrompt = null;
      } else {
        alert("Inštalácia aplikácie:\n\n• Na iPhone: ťuknite dole na ikonu Zdieľať (štvorec so šípkou) a zvoľte 'Pridať na plochu'.\n• Na Android / PC: zvoľte v menu prehliadača 'Inštalovať aplikáciu'.");
      }
    });
  }

  // Detekcia iOS Safari pre zobrazenie vizuálneho banneru
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const iosInstallPrompt = document.getElementById("iosInstallPrompt");
  const btnCloseIosPrompt = document.getElementById("btnCloseIosPrompt");

  if (isIos && !isStandalone && iosInstallPrompt) {
    setTimeout(() => {
      iosInstallPrompt.classList.remove("hidden");
    }, 1200);

    if (btnCloseIosPrompt) {
      btnCloseIosPrompt.addEventListener("click", () => {
        iosInstallPrompt.classList.add("hidden");
      });
    }
  }

  // Notifikácie
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      btnEnableNotifications.classList.add("hidden");
    } else {
      btnEnableNotifications.addEventListener("click", async () => {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          btnEnableNotifications.classList.add("hidden");
          new Notification("Altimera Secure Chat", {
            body: "Systémové notifikácie sú aktívne!",
            icon: "/icon.svg"
          });
        }
      });
    }
  } else {
    btnEnableNotifications.classList.add("hidden");
  }

  function triggerSystemNotification(sender, text, type) {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      let bodyText = text;
      if (type === "voice") bodyText = "🎙️ Hlasová správa";
      else if (type === "file") bodyText = "📎 Odoslaný súbor";

      try {
        new Notification(`${sender} (#${currentRoomName})`, {
          body: bodyText,
          icon: "/icon.svg"
        });
      } catch (e) {}
    }
  }

  // Zvukový tón
  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  // Prepnúť viditeľnosť PINu
  togglePinBtn.addEventListener("click", () => {
    const isPassword = pinInput.getAttribute("type") === "password";
    pinInput.setAttribute("type", isPassword ? "text" : "password");
    togglePinBtn.textContent = isPassword ? "🙈" : "👁️";
  });

  // Autoresize textarea
  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
  });

  const quickPinBadge = document.getElementById("quickPinBadge");
  if (quickPinBadge) {
    quickPinBadge.addEventListener("click", () => {
      pinInput.value = "Altimera2026!";
      hideError();
    });
  }

  function canonicalizePin(rawPin) {
    let p = (rawPin || "").trim();
    if (p.toLowerCase().replace(/[^a-z0-9]/g, "") === "altimera2026") {
      return "Altimera2026!";
    }
    return p;
  }

  // 3. PRIHLÁSENIE / AUTH FORM
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await performLogin(nicknameInput.value.trim(), pinInput.value.trim());
  });

  async function performLogin(rawNickname, rawPin) {
    if (!rawNickname || !rawPin) {
      showError("Vyplňte prosím meno aj bezpečnostný PIN.");
      return;
    }

    activePin = canonicalizePin(rawPin);
    currentNickname = rawNickname;

    // Trvalé uloženie prihlásenia (Persistent Session)
    localStorage.setItem(
      "altimera_session",
      JSON.stringify({
        nickname: currentNickname,
        pin: activePin,
        roomId: currentRoomId
      })
    );

    hideError();
    btnEnter.disabled = true;
    btnEnter.innerHTML = `<span>Pripájam a inicializujem šifrovanie...</span>`;

    try {
      encryptionKey = await AltimeraCrypto.deriveKeyFromPin(activePin);

      if (!socket) {
        initSocket();
      }

      socket.emit("auth_join", {
        pin: activePin,
        nickname: currentNickname,
        roomId: currentRoomId
      });
    } catch (err) {
      console.error(err);
      showError("Chyba šifrovania: " + err.message);
      btnEnter.disabled = false;
      btnEnter.innerHTML = `<span>Vstúpiť do chatu</span>`;
    }
  }

  // Automatické prihlásenie ak existuje relácia a nebolo kliknuté Odísť
  if (!isExplicitLogout) {
    try {
      const savedSession = JSON.parse(localStorage.getItem("altimera_session") || "null");
      if (savedSession && savedSession.nickname && savedSession.pin) {
        nicknameInput.value = savedSession.nickname;
        pinInput.value = savedSession.pin;
        if (!paramRoom && savedSession.roomId) {
          currentRoomId = savedSession.roomId;
        }
        performLogin(savedSession.nickname, savedSession.pin);
      }
    } catch (e) {}
  }

  function showError(msg) {
    authErrorMessage.textContent = msg;
    authErrorMessage.classList.remove("hidden");
  }

  function hideError() {
    authErrorMessage.classList.add("hidden");
    authErrorMessage.textContent = "";
  }

  // 4. SOCKET.IO LOGIKA
  function initSocket() {
    socket = io();

    socket.on("auth_error", (data) => {
      showError(data.message || "Neplatný PIN.");
      btnEnter.disabled = false;
      btnEnter.innerHTML = `<span>Vstúpiť do chatu</span>`;
      localStorage.removeItem("altimera_session");
    });

    socket.on("auth_success", async (data) => {
      authScreen.classList.add("hidden");
      chatScreen.classList.remove("hidden");
      messageInput.focus();

      currentRoomId = data.roomId;
      currentRoomName = data.roomName;
      currentRoomDisplay.textContent = currentRoomName;

      updateUrlParams(currentRoomId);
      updateMembersList(data.members);
      renderRoomsList(data.roomsList);

      if (window.AltimeraCallManager) {
        window.AltimeraCallManager.initSocket(socket, currentNickname, currentRoomId);
      }

      messagesContainer.innerHTML = "";
      if (data.history && data.history.length > 0) {
        for (const msgPkg of data.history) {
          await renderMessage(msgPkg, false);
        }
        scrollToBottom();
      }
    });

    socket.on("switched_room_success", async (data) => {
      currentRoomId = data.roomId;
      currentRoomName = data.roomName;
      currentRoomDisplay.textContent = currentRoomName;

      updateUrlParams(currentRoomId);
      updateMembersList(data.members);

      if (window.AltimeraCallManager) {
        window.AltimeraCallManager.setRoom(currentRoomId);
      }

      messagesContainer.innerHTML = "";
      renderSystemMessage(`📂 Prepli ste sa do skupiny: ${currentRoomName}`);

      if (data.history && data.history.length > 0) {
        for (const msgPkg of data.history) {
          await renderMessage(msgPkg, false);
        }
        scrollToBottom();
      }
    });

    socket.on("rooms_updated", (roomsList) => {
      renderRoomsList(roomsList);
    });

    socket.on("room_created", ({ roomId }) => {
      closeRoomModal();
      socket.emit("switch_room", { roomId });
    });

    socket.on("new_message", async (msgPkg) => {
      if (msgPkg.roomId && msgPkg.roomId !== currentRoomId) return;

      const rendered = await renderMessage(msgPkg, true);
      if (msgPkg.sender !== currentNickname) {
        playNotificationSound();
        triggerSystemNotification(msgPkg.sender, rendered.decryptedText || "", msgPkg.type);
      }
      scrollToBottom();
    });

    socket.on("member_joined", (data) => {
      updateMembersList(data.members);
      renderSystemMessage(`🔐 ${data.nickname} vstúpil do skupiny.`);
    });

    socket.on("member_left", (data) => {
      updateMembersList(data.members);
      renderSystemMessage(`🚪 ${data.nickname} opustil skupinu.`);
    });

    socket.on("user_typing", ({ nickname, isTyping }) => {
      if (isTyping) {
        typingUserText.textContent = `${nickname} píše...`;
        typingIndicator.classList.remove("hidden");
      } else {
        typingIndicator.classList.add("hidden");
      }
    });

    socket.on("history_wiped", (data) => {
      messagesContainer.innerHTML = "";
      renderSystemMessage(`⚠️ HISTÓRIA TEJTO SKUPINY BOLA ZMAZANÁ používateľom ${data.by}.`);
    });

    socket.on("disconnect", () => {
      renderSystemMessage("⚠️ Spojenie bolo prerušené. Pripájam znova...");
    });
  }

  function updateUrlParams(roomId) {
    const newUrl = `${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    window.history.replaceState({}, "", newUrl);
  }

  function renderRoomsList(roomsList) {
    if (!roomsList || !roomsListElement) return;
    roomsListElement.innerHTML = "";

    roomsList.forEach((r) => {
      const li = document.createElement("li");
      if (r.id === currentRoomId) {
        li.className = "active";
      }

      li.innerHTML = `
        <span># ${r.name}</span>
        <span class="room-members-count">${r.activeMembers} online</span>
      `;

      li.addEventListener("click", () => {
        roomsDropdown.classList.add("hidden");
        if (r.id !== currentRoomId) {
          socket.emit("switch_room", { roomId: r.id });
        }
      });

      roomsListElement.appendChild(li);
    });
  }

  function updateMembersList(members) {
    if (!members) return;
    onlineCountBadge.textContent = `${members.length} online`;
    onlineList.innerHTML = "";
    members.forEach((m) => {
      const li = document.createElement("li");
      li.textContent = m + (m === currentNickname ? " (vy)" : "");
      onlineList.appendChild(li);
    });
  }

  // 5. PREPÍNAČ SKUPÍN
  btnRoomSelector.addEventListener("click", (e) => {
    e.stopPropagation();
    roomsDropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!roomsDropdown.contains(e.target) && e.target !== btnRoomSelector) {
      roomsDropdown.classList.add("hidden");
    }
  });

  btnOpenCreateRoomModal.addEventListener("click", () => {
    roomsDropdown.classList.add("hidden");
    createRoomModal.classList.remove("hidden");
    newRoomNameInput.value = "";
    newRoomNameInput.focus();
  });

  function closeRoomModal() {
    createRoomModal.classList.add("hidden");
  }

  btnCloseCreateRoomModal.addEventListener("click", closeRoomModal);
  btnCancelCreateRoom.addEventListener("click", closeRoomModal);

  createRoomForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = newRoomNameInput.value.trim();
    if (!name || !socket) return;
    socket.emit("create_room", { roomName: name });
  });

  // 6. KOPÍROVANIE PRIAMEHO ODKAZU PRE KOLEGOV (1-KLIK)
  btnShareInvite.addEventListener("click", async () => {
    const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(currentRoomId)}&pin=${encodeURIComponent(activePin)}`;
    const inviteMsg = `Ahoj, pripoj sa do nášho zabezpečeného chatu Altimera do skupiny „${currentRoomName}“:\n${inviteUrl}\n(PIN a skupina sú v odkaze predvyplnené, stačí kliknúť a zadať meno).`;

    if (navigator.share && /mobile|android|iphone/i.test(navigator.userAgent)) {
      try {
        await navigator.share({
          title: `Altimera - ${currentRoomName}`,
          text: inviteMsg,
          url: inviteUrl
        });
        return;
      } catch (e) {}
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      btnShareInvite.innerHTML = `<span>Odkaz skopírovaný! ✓</span>`;
    } catch (err) {
      prompt("Skopírujte tento priamy odkaz pre kolegov:", inviteUrl);
    }

    setTimeout(() => {
      btnShareInvite.innerHTML = `<span>🔗 Odkaz pre kolegov</span>`;
    }, 3000);
  });

  // 7. HLASOVÉ SPRÁVY (VOICE NOTES)
  btnRecordVoice.addEventListener("click", async () => {
    try {
      await AltimeraVoice.startRecording((seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        recordingTimer.textContent = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
      });

      messageForm.classList.add("hidden");
      voiceRecordingBar.classList.remove("hidden");
    } catch (err) {
      alert("Nemáte povolený prístup k mikrofónu. Povoľte prosím mikrofón v prehliadači.");
    }
  });

  btnCancelVoice.addEventListener("click", () => {
    AltimeraVoice.cancelRecording();
    voiceRecordingBar.classList.add("hidden");
    messageForm.classList.remove("hidden");
  });

  btnSendVoice.addEventListener("click", async () => {
    btnSendVoice.disabled = true;
    btnSendVoice.textContent = "Šifrujem...";

    try {
      const { blob, duration, mimeType } = await AltimeraVoice.stopRecording();
      const arrayBuffer = await blob.arrayBuffer();

      // Zašifrovanie nahrávky cez AES-256-GCM
      const encrypted = await AltimeraCrypto.encryptFile(arrayBuffer, encryptionKey);

      socket.emit("send_encrypted_message", {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        type: "voice",
        duration: duration,
        fileType: mimeType,
        fileName: `voice-${Date.now()}.webm`
      });
    } catch (err) {
      console.error("Chyba odosielania hlasu:", err);
      alert("Chyba pri odosielaní hlasovej správy.");
    } finally {
      btnSendVoice.disabled = false;
      btnSendVoice.innerHTML = "<span>Odoslať 🚀</span>";
      voiceRecordingBar.classList.add("hidden");
      messageForm.classList.remove("hidden");
    }
  });

  // 8. ODOSIELANIE TEXTU
  messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await sendCurrentTextMessage();
  });

  messageInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await sendCurrentTextMessage();
    }
  });

  messageInput.addEventListener("input", () => {
    if (!socket) return;
    if (!isTypingActive) {
      isTypingActive = true;
      socket.emit("typing", { isTyping: true });
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isTypingActive = false;
      socket.emit("typing", { isTyping: false });
    }, 1500);
  });

  async function sendCurrentTextMessage() {
    const text = messageInput.value.trim();
    if (!text || !encryptionKey || !socket) return;

    messageInput.value = "";
    messageInput.style.height = "auto";

    const encrypted = await AltimeraCrypto.encryptText(text, encryptionKey);

    socket.emit("send_encrypted_message", {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      type: "text"
    });

    if (isTypingActive) {
      isTypingActive = false;
      socket.emit("typing", { isTyping: false });
    }
  }

  // 9. SÚBORY
  btnAttachFile.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert("Maximálna povolená veľkosť súboru je 20 MB.");
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const arrayBuffer = reader.result;
      const encrypted = await AltimeraCrypto.encryptFile(arrayBuffer, encryptionKey);

      socket.emit("send_encrypted_message", {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        type: "file",
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream"
      });
      fileInput.value = "";
    };
    reader.readAsArrayBuffer(file);
  });

  // 10. VYKRESLENIE SPRÁV (TEXT, HLAS, SÚBORY)
  async function renderMessage(msgPkg, animate = true) {
    const isOutgoing = msgPkg.sender === currentNickname;
    const timeStr = new Date(msgPkg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const row = document.createElement("div");
    row.className = `message-row ${isOutgoing ? "outgoing" : "incoming"}`;
    if (!animate) {
      row.style.animation = "none";
    }

    if (!isOutgoing) {
      const senderDiv = document.createElement("div");
      senderDiv.className = "message-sender";
      senderDiv.textContent = msgPkg.sender;
      row.appendChild(senderDiv);
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    let decryptedTextContent = "";

    if (msgPkg.type === "text") {
      const decryptedText = await AltimeraCrypto.decryptText(msgPkg.ciphertext, msgPkg.iv, encryptionKey);
      decryptedTextContent = decryptedText;
      const contentSpan = document.createElement("span");
      contentSpan.textContent = decryptedText;
      bubble.appendChild(contentSpan);
    } else if (msgPkg.type === "voice") {
      // HLASOVÁ SPRÁVA
      const voiceCard = document.createElement("div");
      voiceCard.className = "voice-card";

      const btnPlay = document.createElement("button");
      btnPlay.className = "btn-audio-play";
      btnPlay.innerHTML = "▶";

      const timeline = document.createElement("div");
      timeline.className = "voice-timeline";

      const pBar = document.createElement("div");
      pBar.className = "voice-progress-bar";
      const pFill = document.createElement("div");
      pFill.className = "voice-progress-fill";
      pBar.appendChild(pFill);

      const timeDisplay = document.createElement("div");
      timeDisplay.className = "voice-time-display";
      const totalDur = msgPkg.duration || 1;
      const durM = Math.floor(totalDur / 60);
      const durS = totalDur % 60;
      timeDisplay.innerHTML = `<span class="cur-time">0:00</span> <span>${durM}:${durS < 10 ? "0" : ""}${durS} 🎙️</span>`;

      timeline.appendChild(pBar);
      timeline.appendChild(timeDisplay);

      voiceCard.appendChild(btnPlay);
      voiceCard.appendChild(timeline);
      bubble.appendChild(voiceCard);

      let audioElement = null;

      btnPlay.addEventListener("click", async () => {
        if (!audioElement) {
          btnPlay.textContent = "⏳";
          try {
            let blobUrl = audioBlobUrlCache.get(msgPkg.id);
            if (!blobUrl) {
              const decryptedBuf = await AltimeraCrypto.decryptFile(msgPkg.ciphertext, msgPkg.iv, encryptionKey);
              const audioBlob = new Blob([decryptedBuf], { type: msgPkg.fileType || "audio/webm" });
              blobUrl = URL.createObjectURL(audioBlob);
              audioBlobUrlCache.set(msgPkg.id, blobUrl);
            }

            audioElement = new Audio(blobUrl);

            audioElement.addEventListener("timeupdate", () => {
              if (audioElement.duration) {
                const percent = (audioElement.currentTime / audioElement.duration) * 100;
                pFill.style.width = percent + "%";
                const cM = Math.floor(audioElement.currentTime / 60);
                const cS = Math.floor(audioElement.currentTime % 60);
                timeDisplay.querySelector(".cur-time").textContent = `${cM}:${cS < 10 ? "0" : ""}${cS}`;
              }
            });

            audioElement.addEventListener("ended", () => {
              btnPlay.innerHTML = "▶";
              pFill.style.width = "0%";
              timeDisplay.querySelector(".cur-time").textContent = "0:00";
            });
          } catch (err) {
            alert("Chyba pri dešifrovaní hlasu.");
            btnPlay.innerHTML = "❌";
            return;
          }
        }

        if (audioElement.paused) {
          audioElement.play();
          btnPlay.innerHTML = "⏸";
        } else {
          audioElement.pause();
          btnPlay.innerHTML = "▶";
        }
      });
    } else if (msgPkg.type === "file") {
      const fileCard = document.createElement("div");
      fileCard.className = "file-card";

      const icon = document.createElement("div");
      icon.className = "file-icon";
      icon.textContent = getFileEmoji(msgPkg.fileName);
      fileCard.appendChild(icon);

      const details = document.createElement("div");
      details.className = "file-details";

      const name = document.createElement("div");
      name.className = "file-name";
      name.textContent = msgPkg.fileName;
      details.appendChild(name);

      const size = document.createElement("div");
      size.className = "file-size";
      size.textContent = formatBytes(msgPkg.fileSize);
      details.appendChild(size);

      fileCard.appendChild(details);

      const btnDl = document.createElement("button");
      btnDl.className = "btn-download";
      btnDl.textContent = "Dešifrovať & Stiahnuť";
      btnDl.addEventListener("click", async () => {
        btnDl.textContent = "Dešifrujem...";
        btnDl.disabled = true;
        try {
          const decryptedBuf = await AltimeraCrypto.decryptFile(msgPkg.ciphertext, msgPkg.iv, encryptionKey);
          downloadBlob(decryptedBuf, msgPkg.fileName, msgPkg.fileType);
          btnDl.textContent = "Stiahnuté ✓";
          setTimeout(() => {
            btnDl.textContent = "Stiahnuť znova";
            btnDl.disabled = false;
          }, 2000);
        } catch (err) {
          alert("Chyba pri dešifrovaní súboru.");
          btnDl.textContent = "Chyba";
        }
      });
      fileCard.appendChild(btnDl);

      bubble.appendChild(fileCard);
    }

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.innerHTML = `<span>${timeStr}</span> <span>🔒</span>`;
    bubble.appendChild(meta);

    row.appendChild(bubble);
    messagesContainer.appendChild(row);

    return { decryptedText: decryptedTextContent };
  }

  function renderSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "system-message";
    div.textContent = text;
    messagesContainer.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    chatMain.scrollTop = chatMain.scrollHeight;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function getFileEmoji(fileName) {
    if (!fileName) return "📎";
    const ext = fileName.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "🖼️";
    if (["pdf"].includes(ext)) return "📄";
    if (["doc", "docx", "txt"].includes(ext)) return "📝";
    if (["xls", "xlsx"].includes(ext)) return "📊";
    if (["zip", "rar", "tar", "gz"].includes(ext)) return "📦";
    return "📎";
  }

  function downloadBlob(buffer, fileName, mimeType) {
    const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "altimera-subor";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 11. PANIC WIPE & ODHLÁSENIE
  if (btnStartCall) {
    btnStartCall.addEventListener("click", () => {
      if (window.AltimeraCallManager) {
        window.AltimeraCallManager.startCall();
      }
    });
  }

  btnPanicWipe.addEventListener("click", () => {
    const confirmed = confirm(`⚠️ Naozaj chcete vymazať celú históriu správ v skupine „${currentRoomName}“?`);
    if (confirmed && socket) {
      socket.emit("panic_wipe");
    }
  });

  btnLogout.addEventListener("click", () => {
    if (confirm("Chcete sa odhlásiť z chatu?")) {
      localStorage.removeItem("altimera_session");
      window.location.href = window.location.pathname + "?logout=1";
    }
  });

  btnOnlineMembers.addEventListener("click", () => {
    onlinePanel.classList.toggle("hidden");
  });

  btnCloseOnlinePanel.addEventListener("click", () => {
    onlinePanel.classList.add("hidden");
  });
})();
