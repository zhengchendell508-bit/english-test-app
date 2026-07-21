const sections = {
  words: { title: "第一部分：单词", data: QUESTION_BANK.words, className: "words-grid" },
  phrases: { title: "第二部分：短语", data: QUESTION_BANK.phrases, className: "phrases-grid" },
  sentences: { title: "第三部分：句子", data: QUESTION_BANK.sentences, className: "sentences-grid" }
};

const STUDENTS_KEY = "englishTestStudentsV2";
const ACTIVE_STUDENT_KEY = "englishTestActiveStudentV2";
const SETTINGS_KEY = "englishTestSharedSettingsV2";
const el = id => document.getElementById(id);
const questionsEl = el("questions");
const resultPanel = el("resultPanel");
const saveStatus = el("saveStatus");
const loginDialog = el("studentLoginDialog");

let students = readJson(STUDENTS_KEY, {});
let activeStudentId = localStorage.getItem(ACTIVE_STUDENT_KEY) || "";
let activeStudent = null;
let state = makeEmptyAnswers();
let currentSection = "words";
let saveTimer;
let examTimer = null;
let timerLastTick = 0;

const sharedSettings = readJson(SETTINGS_KEY, { allowReveal:false, lenientMode:true });
el("allowReveal").checked = Boolean(sharedSettings.allowReveal);
el("lenientMode").checked = sharedSettings.lenientMode !== false;

function readJson(key, fallback){
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function makeEmptyAnswers(){
  return Object.fromEntries(
    Object.entries(sections).map(([key, section]) => [key, Array(section.data.length).fill("")])
  );
}

function normalizeAnswerArrays(raw){
  const answers = makeEmptyAnswers();
  for (const [key, section] of Object.entries(sections)) {
    const oldValues = Array.isArray(raw?.[key]) ? raw[key] : [];
    answers[key] = Array.from({length:section.data.length}, (_, index) => String(oldValues[index] ?? ""));
  }
  return answers;
}

function normalizeStudentName(name){
  return String(name || "").trim().replace(/\s+/g, " ");
}

function createStudentId(name){
  const normalized = normalizeStudentName(name).toLocaleLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `student_${(hash >>> 0).toString(36)}`;
}

function nowIso(){
  return new Date().toISOString();
}

function formatDateTime(iso){
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit",
    hour12:false
  }).format(date);
}

async function hashPassword(password){
  const text = String(password || "");
  if (window.crypto?.subtle && window.TextEncoder) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback_${(hash >>> 0).toString(36)}`;
}

async function createStudent(name, password){
  const cleanName = normalizeStudentName(name);
  const duplicate = Object.values(students).find(student => normalizeStudentName(student.name).toLocaleLowerCase() === cleanName.toLocaleLowerCase());
  if (duplicate) return {duplicate};

  const id = `student_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const startedAt = nowIso();
  const passwordHash = await hashPassword(password);
  const student = {
    id,
    name:cleanName,
    passwordHash,
    createdAt:startedAt,
    startedAt,
    sessionId:`session_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    sessionActive:true,
    updatedAt:startedAt,
    currentSection:"words",
    answers:makeEmptyAnswers(),
    submissions:[],
    elapsedSeconds:0,
    timerCompleted:false,
    timerCompletedAt:null
  };
  students[id] = student;
  persistStudents();
  return {id, student};
}

function prepareStudentSession(id){
  const student = students[id];
  if (!student) return null;
  student.answers = normalizeAnswerArrays(student.answers);
  student.currentSection = sections[student.currentSection] ? student.currentSection : "words";
  student.submissions = Array.isArray(student.submissions) ? student.submissions : [];
  student.elapsedSeconds = Number.isFinite(Number(student.elapsedSeconds)) ? Math.max(0, Math.floor(Number(student.elapsedSeconds))) : 0;
  student.timerCompleted = Boolean(student.timerCompleted);
  student.startedAt = nowIso();
  student.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  student.sessionActive = true;
  student.updatedAt = nowIso();
  persistStudents();
  return student;
}

function persistStudents(){
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
}

function activateStudent(id, student){
  activeStudentId = id;
  activeStudent = student;
  state = normalizeAnswerArrays(student.answers);
  currentSection = sections[student.currentSection] ? student.currentSection : "words";
  activeStudent.answers = state;
  localStorage.setItem(ACTIVE_STUDENT_KEY, id);
  persistStudents();

  el("activeStudentName").textContent = activeStudent.name;
  el("startTimeText").textContent = formatDateTime(activeStudent.startedAt);
  updateElapsedTimeDisplay();
  el("studentSessionCard").classList.remove("hidden");
  el("examContent").classList.remove("hidden");
  el("settingsBtn").disabled = false;
  document.body.classList.remove("student-locked");
  if (loginDialog.open) loginDialog.close();
  render();
  if (!activeStudent.timerCompleted) startExamTimer();
}

function switchAccountPanel(mode){
  const loginMode = mode === "login";
  el("loginAccountTab").classList.toggle("active", loginMode);
  el("createAccountTab").classList.toggle("active", !loginMode);
  el("loginStudentForm").classList.toggle("hidden", !loginMode);
  el("createStudentForm").classList.toggle("hidden", loginMode);
  el("loginStudentError").textContent = "";
  el("createStudentError").textContent = "";
  setTimeout(() => el(loginMode ? "loginStudentName" : "newStudentName").focus(), 80);
}

function findStudentByName(name){
  const normalized = normalizeStudentName(name).toLocaleLowerCase();
  return Object.values(students).find(student =>
    normalizeStudentName(student.name).toLocaleLowerCase() === normalized
  ) || null;
}

function openLogin(mode="login"){
  el("loginStudentName").value = "";
  el("loginStudentPassword").value = "";
  el("newStudentName").value = "";
  el("newStudentPassword").value = "";
  el("confirmStudentPassword").value = "";
  el("loginStudentError").textContent = "";
  el("createStudentError").textContent = "";
  el("studentSessionCard").classList.add("hidden");
  el("examContent").classList.add("hidden");
  el("settingsBtn").disabled = true;
  document.body.classList.add("student-locked");
  switchAccountPanel(mode);
  if (!loginDialog.open) loginDialog.showModal();
}


function formatElapsedTime(totalSeconds){
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours, minutes, remaining].map(value => String(value).padStart(2, "0")).join(":");
}

function updateElapsedTimeDisplay(){
  if (!el("elapsedTimeText")) return;
  el("elapsedTimeText").textContent = formatElapsedTime(activeStudent?.elapsedSeconds || 0);
}

function persistTimerTick(message){
  if (!activeStudent) return;
  activeStudent.updatedAt = nowIso();
  students[activeStudentId] = activeStudent;
  persistStudents();
  updateElapsedTimeDisplay();
  if (message) {
    saveStatus.textContent = message;
    saveStatus.style.color = "var(--ok)";
  }
}

function startExamTimer(){
  if (!activeStudent || activeStudent.timerCompleted || examTimer) return;
  timerLastTick = Date.now();
  examTimer = window.setInterval(() => {
    if (!activeStudent || document.hidden || activeStudent.timerCompleted) return;
    const now = Date.now();
    const added = Math.max(1, Math.floor((now - timerLastTick) / 1000));
    activeStudent.elapsedSeconds = (Number(activeStudent.elapsedSeconds) || 0) + added;
    timerLastTick += added * 1000;
    persistTimerTick();
  }, 1000);
}

function pauseExamTimer(message="计时已自动保存"){
  if (examTimer) {
    clearInterval(examTimer);
    examTimer = null;
  }
  timerLastTick = 0;
  if (activeStudent) persistTimerTick(message);
}

function completeExamTimer(submittedAt){
  if (!activeStudent) return;
  pauseExamTimer();
  activeStudent.timerCompleted = true;
  activeStudent.timerCompletedAt = submittedAt;
  persistTimerTick("用时与提交记录已保存");
}

function normalize(v){
  let s = String(v ?? "").trim();
  if (el("lenientMode").checked) {
    s = s.toLowerCase()
      .replace(/[“”‘’']/g, "")
      .replace(/[.,!?;:，。！？；：]/g, "")
      .replace(/\s+/g, " ");
  }
  return s;
}

function saveAll(message="已自动保存"){
  if (!activeStudent) return;
  activeStudent.answers = state;
  activeStudent.currentSection = currentSection;
  activeStudent.updatedAt = nowIso();
  students[activeStudentId] = activeStudent;
  persistStudents();
  saveStatus.textContent = message;
  saveStatus.style.color = "var(--ok)";
}

function queueSave(){
  if (!activeStudent) return;
  saveStatus.textContent = "正在保存…";
  saveStatus.style.color = "var(--muted)";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveAll(), 250);
}

function render(){
  if (!activeStudent) return;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.section === currentSection));
  for (const [key, section] of Object.entries(sections)) {
    const count = section.data.length;
    document.querySelector(`.tab[data-section="${key}"] span`).textContent = count;
  }

  const sec = sections[currentSection];
  el("sectionTitle").textContent = sec.title;
  questionsEl.className = `questions ${sec.className}`;
  questionsEl.innerHTML = "";
  resultPanel.classList.add("hidden");
  updateProgress();

  sec.data.forEach((answer, i) => {
    const box = document.createElement("div");
    box.className = "question";
    box.id = `q-${i+1}`;

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = `${i+1}.`;

    const input = document.createElement("input");
    input.className = "answer-input";
    input.type = "text";
    input.value = state[currentSection][i] || "";
    input.autocomplete = "off";
    input.autocapitalize = "sentences";
    input.spellcheck = false;
    input.setAttribute("aria-label", `${sec.title}第${i+1}题`);
    input.addEventListener("input", () => {
      state[currentSection][i] = input.value;
      box.classList.remove("correct","wrong");
      box.querySelectorAll(".feedback,.reveal-btn").forEach(n => n.remove());
      queueSave();
      updateProgress();
    });

    box.append(num,input);
    questionsEl.appendChild(box);
  });
  window.scrollTo({top:0,behavior:"smooth"});
}

function updateProgress(){
  const values = state[currentSection];
  const count = values.filter(v => v.trim()).length;
  el("progressText").textContent = `已填写 ${count} / ${values.length}`;
}

function grade(){
  if (!activeStudent) return;
  const sec = sections[currentSection];
  let correct = 0, wrong = 0, blank = 0;
  const itemResults = [];

  sec.data.forEach((answer, i) => {
    const box = el(`q-${i+1}`);
    box.querySelectorAll(".feedback,.reveal-btn").forEach(n => n.remove());
    const user = state[currentSection][i] || "";
    box.classList.remove("correct","wrong");
    let status = "blank";

    if (!user.trim()) {
      blank++;
    } else if (normalize(user) === normalize(answer)) {
      correct++;
      status = "correct";
      box.classList.add("correct");
    } else {
      wrong++;
      status = "wrong";
      box.classList.add("wrong");
      const feedback = document.createElement("div");
      feedback.className = "feedback";
      feedback.textContent = "答案不一致";
      box.appendChild(feedback);

      if (el("allowReveal").checked) {
        const btn = document.createElement("button");
        btn.className = "reveal-btn";
        btn.type = "button";
        btn.textContent = "显示正确答案";
        btn.addEventListener("click", () => {
          feedback.textContent = `正确答案：${answer}`;
          btn.remove();
        });
        box.appendChild(btn);
      }
    }

    itemResults.push({
      number:i + 1,
      answer:user,
      correctAnswer:answer,
      status
    });
  });

  const submittedAt = nowIso();
  completeExamTimer(submittedAt);
  const score = Math.round(correct / sec.data.length * 100);
  const submission = {
    id:`submission_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    studentId:activeStudentId,
    studentName:activeStudent.name,
    section:currentSection,
    sectionTitle:sec.title,
    startedAt:activeStudent.startedAt,
    submittedAt,
    elapsedSeconds:activeStudent.elapsedSeconds,
    elapsedTime:formatElapsedTime(activeStudent.elapsedSeconds),
    correct,
    wrong,
    blank,
    total:sec.data.length,
    score,
    items:itemResults
  };
  activeStudent.submissions.push(submission);
  activeStudent.lastSubmittedAt = submittedAt;

  resultPanel.innerHTML = `
    <h3>${sec.title}批改结果</h3>
    <div class="result-numbers">
      <span class="badge">正确 ${correct}</span>
      <span class="badge">错误 ${wrong}</span>
      <span class="badge">未答 ${blank}</span>
      <span class="badge">分数 ${score} / 100</span>
    </div>
    <p class="submission-time">提交时间：${formatDateTime(submittedAt)}（系统自动记录）</p>
    <p class="submission-time">累计答题用时：${formatElapsedTime(activeStudent.elapsedSeconds)}</p>`;
  resultPanel.classList.remove("hidden");
  resultPanel.scrollIntoView({behavior:"smooth",block:"start"});
  saveAll("提交记录已保存");
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  if (!activeStudent) return;
  currentSection = btn.dataset.section;
  saveAll();
  render();
}));

el("loginAccountTab").addEventListener("click", () => switchAccountPanel("login"));
el("createAccountTab").addEventListener("click", () => switchAccountPanel("create"));

el("loginStudentForm").addEventListener("submit", async event => {
  event.preventDefault();
  const name = normalizeStudentName(el("loginStudentName").value);
  const password = el("loginStudentPassword").value;
  if (!name || !password) {
    el("loginStudentError").textContent = "请输入用户名和密码。";
    return;
  }
  const student = findStudentByName(name);
  if (!student) {
    el("loginStudentError").textContent = "用户名不存在，请检查拼写或创建新账号。";
    return;
  }
  if (!student.passwordHash) {
    el("loginStudentError").textContent = "这个旧账号还没有密码，请联系家长重新创建账号。";
    return;
  }
  const enteredHash = await hashPassword(password);
  if (enteredHash !== student.passwordHash) {
    el("loginStudentError").textContent = "用户名或密码不正确。";
    el("loginStudentPassword").select();
    return;
  }
  const ready = prepareStudentSession(student.id);
  if (ready) activateStudent(student.id, ready);
});

el("createStudentForm").addEventListener("submit", async event => {
  event.preventDefault();
  const name = normalizeStudentName(el("newStudentName").value);
  const password = el("newStudentPassword").value;
  const confirmPassword = el("confirmStudentPassword").value;
  if (!name) {
    el("createStudentError").textContent = "请输入孩子用户名。";
    return;
  }
  if (password.length < 4) {
    el("createStudentError").textContent = "密码至少需要4个字符。";
    return;
  }
  if (password !== confirmPassword) {
    el("createStudentError").textContent = "两次输入的密码不一致。";
    return;
  }
  const result = await createStudent(name, password);
  if (result.duplicate) {
    el("createStudentError").textContent = "这个用户名已经存在，请返回登录。";
    return;
  }
  activateStudent(result.id, result.student);
});

el("switchStudentBtn").addEventListener("click", () => {
  if (activeStudent) {
    pauseExamTimer();
    activeStudent.sessionActive = false;
    activeStudent.sessionEndedAt = nowIso();
    saveAll();
  }
  activeStudentId = "";
  activeStudent = null;
  state = makeEmptyAnswers();
  localStorage.removeItem(ACTIVE_STUDENT_KEY);
  openLogin();
});

el("gradeBtn").addEventListener("click", grade);

const settingsDialog = el("settingsDialog");
el("settingsBtn").addEventListener("click", () => settingsDialog.showModal());
el("allowReveal").addEventListener("change", event => {
  sharedSettings.allowReveal = event.target.checked;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(sharedSettings));
});
el("lenientMode").addEventListener("change", event => {
  sharedSettings.lenientMode = event.target.checked;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(sharedSettings));
});

el("resetBtn").addEventListener("click", () => {
  if (!activeStudent || !confirm(`确定要清空“${activeStudent.name}”三个部分的全部答案吗？历史提交记录不会删除。`)) return;
  state = makeEmptyAnswers();
  activeStudent.answers = state;
  saveAll("当前孩子答案已清空");
  settingsDialog.close();
  render();
});

const jumpDialog = el("jumpDialog");
el("jumpBtn").addEventListener("click", () => {
  el("jumpInput").value = "";
  el("jumpInput").max = sections[currentSection].data.length;
  jumpDialog.showModal();
  setTimeout(() => el("jumpInput").focus(), 100);
});
el("jumpConfirm").addEventListener("click", () => {
  const n = Number(el("jumpInput").value);
  if (n >= 1 && n <= sections[currentSection].data.length) {
    jumpDialog.close();
    const target = el(`q-${n}`);
    target.scrollIntoView({behavior:"smooth",block:"center"});
    setTimeout(() => target.querySelector("input").focus(), 450);
  }
});

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
}

document.addEventListener("visibilitychange", () => {
  if (!activeStudent || activeStudent.timerCompleted) return;
  if (document.hidden) pauseExamTimer();
  else startExamTimer();
});

window.addEventListener("pagehide", () => {
  if (activeStudent && !activeStudent.timerCompleted) pauseExamTimer();
});

window.addEventListener("beforeunload", () => {
  if (activeStudent && !activeStudent.timerCompleted) pauseExamTimer();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

loginDialog.addEventListener("cancel", event => event.preventDefault());

openLogin("login");
