(() => {
  "use strict";

  const LOCAL_KEY = "englishTestSubmissionsV1";
  const CLOUD_COLLECTION = "englishTestApp";
  const CLOUD_DOCUMENT = "children";
  const CLOUD_SUBCOLLECTION = "submissions";

  const firebaseConfig = {
    apiKey: "AIzaSyAi-ZzHPmt1bXeK52tNg5f5_gQG3ZLKrUc",
    authDomain: "english-test-app-ba2c5.firebaseapp.com",
    projectId: "english-test-app-ba2c5",
    storageBucket: "english-test-app-ba2c5.firebasestorage.app",
    messagingSenderId: "551821449937",
    appId: "1:551821449937:web:36c2195835c724b68583f0"
  };

  let firestore = null;

  function initializeFirestore() {
    if (firestore) return firestore;
    if (!window.firebase?.initializeApp || !window.firebase?.firestore) {
      throw new Error("云端组件没有加载完成");
    }
    const app = window.firebase.apps?.length
      ? window.firebase.app()
      : window.firebase.initializeApp(firebaseConfig);
    firestore = app.firestore();
    return firestore;
  }

  function normalizeSection(section) {
    if (!Array.isArray(section)) return [];
    return section.slice(0, 30).map((item, index) => ({
      number: index + 1,
      prompt: String(item?.prompt || ""),
      studentAnswer: String(item?.studentAnswer || "")
    }));
  }

  function normalizeRecord(record) {
    if (!record || typeof record !== "object") return null;
    const normalized = {
      id: String(record.id || "").trim(),
      childId: String(record.childId || "").trim(),
      childName: String(record.childName || "").trim(),
      lessonId: Number(record.lessonId) || 0,
      lessonTitle: String(record.lessonTitle || "").trim(),
      submittedAt: Number(record.submittedAt) || 0,
      elapsedMs: Math.max(0, Number(record.elapsedMs) || 0),
      sections: {
        words: normalizeSection(record.sections?.words),
        phrases: normalizeSection(record.sections?.phrases),
        sentences: normalizeSection(record.sections?.sentences)
      }
    };
    return normalized.id && normalized.childId && normalized.submittedAt
      ? normalized
      : null;
  }

  function normalizeRecords(records) {
    if (!Array.isArray(records)) return [];
    const byId = new Map();
    records.forEach(record => {
      const normalized = normalizeRecord(record);
      if (normalized) byId.set(normalized.id, normalized);
    });
    return Array.from(byId.values())
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, 120);
  }

  function loadLocal() {
    try {
      return normalizeRecords(JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"));
    } catch {
      return [];
    }
  }

  function saveLocal(records) {
    const normalized = normalizeRecords(records);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(normalized));
    return normalized;
  }

  async function saveSubmissionRecord(record) {
    const normalized = normalizeRecord(record);
    if (!normalized) throw new Error("提交记录内容不完整");

    const localRecords = loadLocal().filter(item => item.id !== normalized.id);
    try {
      saveLocal([normalized, ...localRecords]);
    } catch (error) {
      console.error("提交记录无法写入当前设备缓存。", error);
    }

    const db = initializeFirestore();
    await db
      .collection(CLOUD_COLLECTION)
      .doc(CLOUD_DOCUMENT)
      .collection(CLOUD_SUBCOLLECTION)
      .doc(normalized.id)
      .set({
        ...normalized,
        schemaVersion: 1,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });

    return { ok: true, cloudSaved: true, record: normalized };
  }

  async function loadChildSubmissions(childId) {
    const cleanChildId = String(childId || "").trim();
    if (!cleanChildId) return [];
    const localRecords = loadLocal();

    try {
      const db = initializeFirestore();
      const snapshot = await db
        .collection(CLOUD_COLLECTION)
        .doc(CLOUD_DOCUMENT)
        .collection(CLOUD_SUBCOLLECTION)
        .where("childId", "==", cleanChildId)
        .get();

      const cloudRecords = snapshot.docs.map(documentSnapshot =>
        normalizeRecord({ ...documentSnapshot.data(), id: documentSnapshot.id })
      ).filter(Boolean);
      const merged = normalizeRecords([...cloudRecords, ...localRecords]);
      try {
        saveLocal(merged);
      } catch (error) {
        console.error("云端记录无法写入当前设备缓存。", error);
      }
      return merged.filter(record => record.childId === cleanChildId);
    } catch (error) {
      console.error("云端提交记录读取失败。", error);
      return localRecords.filter(record => record.childId === cleanChildId);
    }
  }

  window.saveSubmissionRecord = saveSubmissionRecord;
  window.loadChildSubmissions = loadChildSubmissions;
})();
