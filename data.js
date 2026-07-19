(() => {
  "use strict";

  const LOCAL_BANK_KEY = "englishLessonBankV2";
  const CLOUD_COLLECTION = "englishTestApp";
  const CLOUD_DOCUMENT = "lessonBank";

  const firebaseConfig = {
    apiKey: "AIzaSyAi-ZzHPmt1bXeK52tNg5f5_gQG3ZLKrUc",
    authDomain: "english-test-app-ba2c5.firebaseapp.com",
    projectId: "english-test-app-ba2c5",
    storageBucket: "english-test-app-ba2c5.firebasestorage.app",
    messagingSenderId: "551821449937",
    appId: "1:551821449937:web:36c2195835c724b68583f0"
  };

  function blankItem() {
    return { prompt: "", answer: "", audioText: "", mode: "chinese" };
  }

  function createDefaultBank() {
    return {
      1: {
        title: "Lesson 1",
        words: Array.from({ length: 30 }, blankItem),
        phrases: Array.from({ length: 30 }, blankItem),
        sentences: Array.from({ length: 30 }, blankItem)
      }
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeItem(item) {
    const answer = String(item?.answer || "").trim();
    return {
      prompt: String(item?.prompt || "").trim(),
      answer,
      audioText: String(item?.audioText || answer).trim(),
      mode: item?.mode === "audio" ? "audio" : "chinese"
    };
  }

  function normalizeBank(input) {
    const source = input && typeof input === "object" ? input : {};
    const ids = Object.keys(source)
      .map(Number)
      .filter(Number.isInteger)
      .sort((a, b) => a - b);

    if (!ids.length) return createDefaultBank();

    const output = {};
    ids.forEach(id => {
      const lesson = source[id] || {};
      output[id] = {
        title: String(lesson.title || `Lesson ${id}`),
        words: normalizeSection(lesson.words),
        phrases: normalizeSection(lesson.phrases),
        sentences: normalizeSection(lesson.sentences)
      };
    });

    return output;
  }

  function normalizeSection(items) {
    const output = Array.isArray(items)
      ? items.slice(0, 30).map(normalizeItem)
      : [];

    while (output.length < 30) output.push(blankItem());
    return output;
  }

  function readLocalBank() {
    try {
      const saved = localStorage.getItem(LOCAL_BANK_KEY);
      return saved ? normalizeBank(JSON.parse(saved)) : createDefaultBank();
    } catch (error) {
      console.warn("本地题库读取失败，已使用空白题库。", error);
      return createDefaultBank();
    }
  }

  function writeLocalBank(bank) {
    const normalized = normalizeBank(bank);
    localStorage.setItem(LOCAL_BANK_KEY, JSON.stringify(normalized));
    window.LESSON_BANK = clone(normalized);
    return normalized;
  }

  let firebaseApp = null;
  let firestore = null;
  let cloudReady = false;
  let lastSource = "local";
  let lastError = null;

  function initializeFirebase() {
    if (cloudReady) return true;

    try {
      if (!window.firebase?.initializeApp || !window.firebase?.firestore) {
        throw new Error("Firebase SDK 没有加载完成");
      }

      firebaseApp = window.firebase.apps?.length
        ? window.firebase.app()
        : window.firebase.initializeApp(firebaseConfig);

      firestore = firebaseApp.firestore();
      cloudReady = true;
      return true;
    } catch (error) {
      lastError = error;
      console.error("Firebase 初始化失败，将使用本地缓存。", error);
      return false;
    }
  }

  async function loadBank() {
    const localBank = readLocalBank();
    window.LESSON_BANK = clone(localBank);

    if (!initializeFirebase()) {
      lastSource = "local";
      return clone(localBank);
    }

    try {
      const snapshot = await firestore
        .collection(CLOUD_COLLECTION)
        .doc(CLOUD_DOCUMENT)
        .get();

      if (!snapshot.exists) {
        lastSource = "local";
        return clone(localBank);
      }

      const cloudBank = normalizeBank(snapshot.data()?.bank);
      writeLocalBank(cloudBank);
      lastSource = "cloud";
      lastError = null;
      return clone(cloudBank);
    } catch (error) {
      lastError = error;
      lastSource = "local";
      console.error("云端题库读取失败，将使用本地缓存。", error);
      return clone(localBank);
    }
  }

  async function saveBank(bank) {
    const normalized = writeLocalBank(bank);

    if (!initializeFirebase()) {
      const error = lastError || new Error("Firebase 尚未连接");
      return { ok: false, source: "local", error };
    }

    try {
      await firestore
        .collection(CLOUD_COLLECTION)
        .doc(CLOUD_DOCUMENT)
        .set({
          schemaVersion: 1,
          bank: normalized,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });

      lastSource = "cloud";
      lastError = null;
      return { ok: true, source: "cloud" };
    } catch (error) {
      lastError = error;
      lastSource = "local";
      console.error("云端题库保存失败，已保存在当前设备。", error);
      return { ok: false, source: "local", error };
    }
  }

  function getStatus() {
    return {
      cloudReady,
      source: lastSource,
      error: lastError ? String(lastError.message || lastError) : ""
    };
  }

  window.DEFAULT_LESSON_BANK = createDefaultBank();
  window.LESSON_BANK = readLocalBank();
  window.LessonDataService = Object.freeze({
    loadBank,
    saveBank,
    getStatus,
    normalizeBank,
    readLocalBank
  });
})();
