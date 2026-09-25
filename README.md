# 🛡️ Altimera Secure Chat

Ultra-ľahká, moderná a vysoko zabezpečená webová komunikačná aplikácia určená výhradne pre členov tímu **Altimera**. Funguje okamžite v prehliadači na počítačoch aj na smartfónoch (iOS Safari, Android Chrome) bez akejkoľvek inštalácie.

---

## 🔒 Bezpečnostná architektúra (Zero-Knowledge)

1. **End-to-End šifrovanie (AES-256-GCM):**
   - Všetky správy a súbory sú šifrované priamo vo vašom prehliadači cez natívne **Web Crypto API**.
   - Šifrovací 256-bitový kľúč sa odvodzuje z vášho tajného PIN-u pomocou algoritmu **PBKDF2** (100 000 iterácií SHA-256).
   - Server ani databáza **nikdy nevidia obsah správ ani súborov** v čitateľnej podobe – prenáša a uchováva sa len nečitateľný ciphertext.

2. **Zero-Trace & In-Memory:**
   - Správy sa nezapisujú na disk ani do permanentnej databázy. Bežia iba v pamäti servera (RAM) počas aktívnej relácie.
   - Po reštarte servera alebo kliknutí na **Panic Wipe** sa celá história okamžite a nenávratne vymaže.

3. **Žiadna registrácia osobných údajov:**
   - Nevyžadujú sa žiadne telefónne čísla, emaily ani heslá k externým službám. Stačí tímový PIN a vaše meno/prezývka.

---

## 🚀 Rýchle spustenie lokálne

V priečinku `altimera-chat` spustite:

```bash
# 1. Spustenie servera
npm start
```

Server sa spustí na adrese: `http://localhost:3000`

- **Predvolený PIN miestnosti:** `Altimera2026!`
- **Predvolený port:** `3000`

---

## ⚙️ Vlastná konfigurácia PINu a portu

Môžete vytvoriť súbor `.env` v priečinku `altimera-chat`:

```env
PORT=3000
ROOM_PIN=VaseVlastneTajneHesloAltimera123!
```

---

## 📱 Ako sa pripojiť z mobilu / iného počítača

### Možnosť A: V rámci rovnakej Wi-Fi siete
1. Na Macu zistite svoju lokálnu IP adresu (napr. v Termináli cez `ipconfig getifaddr en0`). Predpokladajme napr. `192.168.1.50`.
2. Na mobile otvorte prehliadač (Safari alebo Chrome) a zadajte:
   ```
   http://192.168.1.50:3000
   ```
3. Zadáte meno, PIN a okamžite komunikujete v reálnom čase!

### Možnosť B: Cez bezplatný Cloudflare Tunnel (okamžitý prístup odkiaľkoľvek cez HTTPS)
Pre bezpečný prístup cez internet s platným SSL certifikátom (HTTPS) bez nastavovania routra:
```bash
npx untun@latest tunnel http://localhost:3000
# alebo
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel --url http://localhost:3000
```
Dostanete zabezpečenú verejnú adresu (napr. `https://xyz.trycloudflare.com`), ktorú stačí poslať členom Altimery.

### Možnosť C: Trvalé nasadenie na bezplatný Cloud (Render / Railway)
Aplikácia je pripravená na okamžité nasadenie na platformy ako **Render.com** alebo **Railway.app**:
- Stačí nahrať priečinok na privátny GitHub repozitár
- Nastaviť Build Command: `npm install`
- Nastaviť Start Command: `node server.js`
- V environment variables nastaviť `ROOM_PIN`

---

## ✨ Funkcie aplikácie
- **Real-time chat:** Okamžité doručovanie správ cez WebSockets.
- **Indikátor písania:** Vidíte, keď niekto píše správu.
- **Zoznam online členov:** Prehľad aktívnych kolegov z Altimery.
- **Zašifrované prílohy:** Možnosť posielať dokumenty, obrázky a tabuľky do 20 MB (každý súbor je pred odoslaním zašifrovaný).
- **Diskrétne zvukové notifikácie:** Jemný tón pri novej správe (generovaný priamo v prehliadači).
- **Panic Wipe:** Červené tlačidlo v záhlaví pre okamžité zmazanie celej histórie chatu pre všetkých účastníkov.
