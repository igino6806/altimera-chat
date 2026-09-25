/**
 * ALTIMERA CRYPTO MODULE
 * Využíva Web Crypto API (štandard v moderných prehliadačoch)
 * Kľúč je odvodený z PIN-u cez PBKDF2 (100 000 iterácií SHA-256)
 * Šifrovanie prebieha pomocou AES-256-GCM (autentifikované šifrovanie)
 */

const AltimeraCrypto = (function () {
  // Pevný soľný reťazec pre odvodenie kľúča tímu Altimera
  const SALT = new TextEncoder().encode("altimera-zero-knowledge-salt-v1");

  // Pomocné konverzie Base64 <-> ArrayBuffer
  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Odvodenie AES-256-GCM kľúča z PIN kódu
   */
  async function deriveKeyFromPin(pin) {
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);

    // 1. Import surového hesla
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      pinBytes,
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    // 2. Odvodenie 256-bitového AES-GCM kľúča
    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: SALT,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false, // neexportovateľný pre bezpečnosť
      ["encrypt", "decrypt"]
    );

    return derivedKey;
  }

  /**
   * Zašifrovanie textovej správy
   */
  async function encryptText(plainText, key) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainText);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV pre GCM

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      data
    );

    return {
      ciphertext: arrayBufferToBase64(encryptedBuffer),
      iv: arrayBufferToBase64(iv)
    };
  }

  /**
   * Dešifrovanie textovej správy
   */
  async function decryptText(ciphertextBase64, ivBase64, key) {
    try {
      const ciphertext = base64ToArrayBuffer(ciphertextBase64);
      const iv = base64ToArrayBuffer(ivBase64);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(iv)
        },
        key,
        ciphertext
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (err) {
      console.error("Chyba dešifrovania (nesprávny kľúč alebo porušená integrita):", err);
      return "⚠️ [Nepodarilo sa dešifrovať – neplatný kľúč alebo manipulácia so správou]";
    }
  }

  /**
   * Zašifrovanie súboru (ArrayBuffer)
   */
  async function encryptFile(fileArrayBuffer, key) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      fileArrayBuffer
    );

    return {
      ciphertext: arrayBufferToBase64(encryptedBuffer),
      iv: arrayBufferToBase64(iv)
    };
  }

  /**
   * Dešifrovanie súboru
   */
  async function decryptFile(ciphertextBase64, ivBase64, key) {
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const iv = base64ToArrayBuffer(ivBase64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(iv)
      },
      key,
      ciphertext
    );

    return decryptedBuffer;
  }

  return {
    deriveKeyFromPin,
    encryptText,
    decryptText,
    encryptFile,
    decryptFile
  };
})();
