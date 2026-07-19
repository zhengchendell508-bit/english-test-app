(() => {
  "use strict";

  const CHILDREN_KEY = "englishTestChildrenV3";
  const ACTIVE_CHILD_KEY = "englishTestActiveChildV3";
  const CLOUD_COLLECTION = "englishTestApp";
  const CLOUD_DOCUMENT = "children";

  const firebaseConfig = {
    apiKey: "AIzaSyAi-ZzHPmt1bXeK52tNg5f5_gQG3ZLKrUc",
    authDomain: "english-test-app-ba2c5.firebaseapp.com",
    projectId: "english-test-app-ba2c5",
    storageBucket: "english-test-app-ba2c5.firebasestorage.app",
    messagingSenderId: "551821449937",
    appId: "1:551821449937:web:36c2195835c724b68583f0"
  };

  function normalizeChildren(children) {
    if (!Array.isArray(children)) return [];
    const seen = new Set();
    return children
      .map(child => ({
        id: String(child?.id || "").trim(),
        name: String(child?.name || "").trim()
      }))
      .filter(child => {
        if (!child.id || !child.name || seen.has(child.id)) return false;
        seen.add(child.id);
        return true;
      });
  }

  function getChildren() {
    try {
      return normalizeChildren(JSON.parse(localStorage.getItem(CHILDREN_KEY) || "[]"));
    } catch {
      return [];
    }
  }

  function saveChildrenLocal(children) {
    const normalized = normalizeChildren(children);
    localStorage.setItem(CHILDREN_KEY, JSON.stringify(normalized));
    return normalized;
  }

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
      const app = window.firebase.apps?.length
        ? window.firebase.app()
        : window.firebase.initializeApp(firebaseConfig);
      firestore = app.firestore();
      cloudReady = true;
      return true;
    } catch (error) {
      lastError = error;
      console.error("孩子名单云端连接失败，将使用本地缓存。", error);
      return false;
    }
  }

  async function loadChildren() {
    const localChildren = getChildren();

    if (!initializeFirebase()) {
      lastSource = "local";
      return localChildren;
    }

    try {
      const ref = firestore.collection(CLOUD_COLLECTION).doc(CLOUD_DOCUMENT);
      const snapshot = await ref.get();

      if (!snapshot.exists) {
        if (localChildren.length) {
          await ref.set({
            schemaVersion: 1,
            children: localChildren,
            migratedFromLocalAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
          });
          lastSource = "local-migration";
          lastError = null;
          return localChildren;
        }
        lastSource = "cloud";
        return [];
      }

      const cloudChildren = normalizeChildren(snapshot.data()?.children);

      if (!cloudChildren.length && localChildren.length) {
        await ref.set({
          schemaVersion: 1,
          children: localChildren,
          migratedFromLocalAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        lastSource = "local-migration";
        lastError = null;
        return localChildren;
      }

      saveChildrenLocal(cloudChildren);
      lastSource = "cloud";
      lastError = null;
      return cloudChildren;
    } catch (error) {
      lastError = error;
      lastSource = "local";
      console.error("孩子名单读取失败，将使用本地缓存。", error);
      return localChildren;
    }
  }

  async function saveChildren(children) {
    const normalized = saveChildrenLocal(children);

    if (!initializeFirebase()) {
      return { ok: false, source: "local", children: normalized, error: lastError };
    }

    try {
      await firestore.collection(CLOUD_COLLECTION).doc(CLOUD_DOCUMENT).set({
        schemaVersion: 1,
        children: normalized,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      lastSource = "cloud";
      lastError = null;
      return { ok: true, source: "cloud", children: normalized };
    } catch (error) {
      lastError = error;
      lastSource = "local";
      console.error("孩子名单保存到云端失败。", error);
      return { ok: false, source: "local", children: normalized, error };
    }
  }

  async function createChild(name) {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("请输入孩子名字");

    const children = await loadChildren();

    if (children.some(child => child.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error("这个孩子已经创建过了");
    }

    const child = {
      id: `child-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: clean
    };

    const result = await saveChildren([...children, child]);
    if (!result.ok) {
      throw new Error("孩子已经保存在电脑，但云端同步失败。请检查网络后再试。");
    }
    return child;
  }

  async function removeChild(id) {
    const children = await loadChildren();
    const result = await saveChildren(children.filter(child => child.id !== id));

    const active = getActiveChild();
    if (active && active.id === id) {
      localStorage.removeItem(ACTIVE_CHILD_KEY);
    }

    if (!result.ok) {
      throw new Error("孩子已经从本机删除，但云端同步失败。");
    }
  }

  function setActiveChild(child) {
    localStorage.setItem(ACTIVE_CHILD_KEY, JSON.stringify(child));
  }

  function getActiveChild() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVE_CHILD_KEY) || "null");
    } catch {
      return null;
    }
  }

  function getChildrenSyncStatus() {
    return {
      source: lastSource,
      cloudReady,
      error: lastError ? String(lastError.message || lastError) : ""
    };
  }

  window.getChildren = getChildren;
  window.loadChildren = loadChildren;
  window.saveChildren = saveChildren;
  window.createChild = createChild;
  window.removeChild = removeChild;
  window.setActiveChild = setActiveChild;
  window.getActiveChild = getActiveChild;
  window.getChildrenSyncStatus = getChildrenSyncStatus;
})();
