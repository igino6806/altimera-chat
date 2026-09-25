const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024 // 25 MB max payload pre zašifrované súbory
});

const PORT = process.env.PORT || 3000;
const DEFAULT_PIN = process.env.ROOM_PIN || 'Altimera2026!';
const MAX_HISTORY_PER_ROOM = 100;

// In-memory úložisko miestností a používateľov (nič sa nezapisuje na disk)
const rooms = new Map();

// Predvolená hlavná miestnosť
rooms.set('main', {
  id: 'main',
  name: 'Altimera Hlavný Chat',
  createdBy: 'Admin',
  createdAt: Date.now(),
  history: []
});

// socket.id -> { id, nickname, currentRoom, joinedAt }
const activeUsers = new Map();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    roomsCount: rooms.size,
    onlineMembers: activeUsers.size,
    uptime: process.uptime()
  });
});

function getRoomsSummary() {
  const list = [];
  rooms.forEach((r, id) => {
    let count = 0;
    activeUsers.forEach(u => {
      if (u.currentRoom === id) count++;
    });
    list.push({
      id: r.id,
      name: r.name,
      createdBy: r.createdBy,
      activeMembers: count
    });
  });
  return list;
}

function getRoomMembers(roomId) {
  const members = [];
  activeUsers.forEach(u => {
    if (u.currentRoom === roomId) {
      members.push(u.nickname);
    }
  });
  return members;
}

function sanitizeId(str) {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40) || 'skupina';
}

io.on('connection', (socket) => {
  // 1. Pripojenie a overenie PINu do konkrétnej miestnosti
  socket.on('auth_join', ({ pin, nickname, roomId }) => {
    const cleanNickname = (nickname || 'Člen Altimery').trim().slice(0, 30);
    const rawPin = (pin || '').trim();

    // Kanonikalizácia pre prípad malých písmen alebo chýbajúceho výkričníka
    let cleanPin = rawPin;
    if (rawPin.toLowerCase().replace(/[^a-z0-9]/g, '') === 'altimera2026') {
      cleanPin = 'Altimera2026!';
    }

    if (!cleanPin || (cleanPin !== DEFAULT_PIN && rawPin !== DEFAULT_PIN)) {
      socket.emit('auth_error', { message: 'Neplatný bezpečnostný PIN kód. Správny PIN je: Altimera2026!' });
      return;
    }

    // Určenie cieľovej miestnosti (ak neexistuje, vytvoríme ju)
    let targetRoomId = sanitizeId(roomId) || 'main';
    if (!rooms.has(targetRoomId)) {
      rooms.set(targetRoomId, {
        id: targetRoomId,
        name: (roomId || 'Nová skupina').trim().slice(0, 40),
        createdBy: cleanNickname,
        createdAt: Date.now(),
        history: []
      });
    }

    const currentRoomObj = rooms.get(targetRoomId);

    activeUsers.set(socket.id, {
      id: socket.id,
      nickname: cleanNickname,
      currentRoom: targetRoomId,
      joinedAt: Date.now()
    });

    socket.join(targetRoomId);

    // Odošleme úspešné prihlásenie s dátami miestnosti
    socket.emit('auth_success', {
      nickname: cleanNickname,
      roomId: targetRoomId,
      roomName: currentRoomObj.name,
      history: currentRoomObj.history,
      members: getRoomMembers(targetRoomId),
      roomsList: getRoomsSummary()
    });

    // Upozorníme členov v danej miestnosti
    socket.to(targetRoomId).emit('member_joined', {
      nickname: cleanNickname,
      members: getRoomMembers(targetRoomId),
      timestamp: Date.now()
    });

    // Aktualizujeme zoznam miestností pre všetkých
    io.emit('rooms_updated', getRoomsSummary());

    console.log(`[Auth] ${cleanNickname} vstúpil do skupiny '${currentRoomObj.name}' (${targetRoomId}).`);
  });

  // 2. Vytvorenie novej skupiny (Admin / člen)
  socket.on('create_room', ({ roomName }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const cleanName = (roomName || '').trim().slice(0, 40);
    if (!cleanName) return;

    let targetId = sanitizeId(cleanName);
    if (rooms.has(targetId)) {
      targetId = `${targetId}-${Math.floor(100 + Math.random() * 900)}`;
    }

    rooms.set(targetId, {
      id: targetId,
      name: cleanName,
      createdBy: user.nickname,
      createdAt: Date.now(),
      history: []
    });

    io.emit('rooms_updated', getRoomsSummary());
    socket.emit('room_created', { roomId: targetId, roomName: cleanName });
    console.log(`[Group] ${user.nickname} vytvoril novú skupinu: ${cleanName} (ID: ${targetId})`);
  });

  // 3. Prepnutie do inej skupiny
  socket.on('switch_room', ({ roomId }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const oldRoomId = user.currentRoom;
    const targetRoomId = sanitizeId(roomId);

    if (!rooms.has(targetRoomId)) return;

    // Opustiť starú miestnosť
    socket.leave(oldRoomId);
    user.currentRoom = targetRoomId;

    // Upozorniť starú miestnosť
    socket.to(oldRoomId).emit('member_left', {
      nickname: user.nickname,
      members: getRoomMembers(oldRoomId),
      timestamp: Date.now()
    });

    // Vstúpiť do novej miestnosti
    socket.join(targetRoomId);
    const roomObj = rooms.get(targetRoomId);

    socket.emit('switched_room_success', {
      roomId: targetRoomId,
      roomName: roomObj.name,
      history: roomObj.history,
      members: getRoomMembers(targetRoomId)
    });

    // Upozorniť novú miestnosť
    socket.to(targetRoomId).emit('member_joined', {
      nickname: user.nickname,
      members: getRoomMembers(targetRoomId),
      timestamp: Date.now()
    });

    io.emit('rooms_updated', getRoomsSummary());
  });

  // 4. Zašifrované správy
  socket.on('send_encrypted_message', (data) => {
    const user = activeUsers.get(socket.id);
    if (!user || !data.ciphertext || !data.iv) return;

    const currentRoomObj = rooms.get(user.currentRoom);
    if (!currentRoomObj) return;

    const messagePackage = {
      id: crypto.randomUUID(),
      sender: user.nickname,
      roomId: user.currentRoom,
      ciphertext: data.ciphertext,
      iv: data.iv,
      type: data.type || 'text',
      duration: data.duration || null,
      fileName: data.fileName || null,
      fileSize: data.fileSize || null,
      fileType: data.fileType || null,
      timestamp: Date.now()
    };

    currentRoomObj.history.push(messagePackage);
    if (currentRoomObj.history.length > MAX_HISTORY_PER_ROOM) {
      currentRoomObj.history.shift();
    }

    io.to(user.currentRoom).emit('new_message', messagePackage);
  });

  // 5. Indikátor písania
  socket.on('typing', ({ isTyping }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    socket.to(user.currentRoom).emit('user_typing', {
      nickname: user.nickname,
      isTyping: !!isTyping
    });
  });

  // 6. Panic wipe v rámci skupiny
  socket.on('panic_wipe', () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const currentRoomObj = rooms.get(user.currentRoom);
    if (!currentRoomObj) return;

    currentRoomObj.history = [];
    io.to(user.currentRoom).emit('history_wiped', {
      by: user.nickname,
      timestamp: Date.now()
    });
  });

  // 7. Odpojenie
  socket.on('disconnect', () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      const oldRoomId = user.currentRoom;
      activeUsers.delete(socket.id);
      socket.to(oldRoomId).emit('member_left', {
        nickname: user.nickname,
        members: getRoomMembers(oldRoomId),
        timestamp: Date.now()
      });
      io.emit('rooms_updated', getRoomsSummary());
      console.log(`[Disconnect] ${user.nickname} opustil chat.`);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`  ALTIMERA SECURE MULTI-ROOM CHAT NA PORTE ${PORT}`);
  console.log(`  Podpora skupinových chatov a priamych pozvánok`);
  console.log(`=================================================`);
});
