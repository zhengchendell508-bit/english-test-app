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

function getOrCreateStudent(name){
  const cleanName = normalizeStudentName(name);
  const id = createStudentId(cleanName);
  const existing = students[id];
  if (existing) {
    existing.name = cleanName;
    existing.answers = normalizeAnswerArrays(existing.answers);
    existing.currentSection = sections[existing.currentSection] ? existing.currentSection : "words";
    existing.submissions = Array.isArray(existing.submissions) ? existing.submissions : [];
    const isContinuingSameSession = localStorage.getItem(ACTIVE_STUDENT_KEY) === id && existing.sessionActive === true;
    if (!isContinuingSameSession) {
      existing.startedAt = nowIso();
      existing.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    }
    existing.sessionActive = true;
    return {id, student:existing};
  }

  const student = {
    id,
    name:cleanName,
    createdAt:nowIso(),
    startedAt:nowIso(),
    sessionId:`session_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    sessionActive:true,
    updatedAt:nowIso(),
    currentSection:"words",
    answers:makeEmptyAnswers(),
    submissions:[]
  };
  students[id] = student;
  persistStudents();
  return {id, student};
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
  el("studentSessionCard").classList.remove("hidden");
  el("examContent").classList.remove("hidden");
  el("settingsBtn").disabled = false;
  document.body.classList.remove("student-locked");
  if (loginDialog.open) loginDialog.close();
  render();
}

function openLogin(prefill=""){
  el("loginStudentName").value = prefill;
  el("loginError").textContent = "";
  el("studentSessionCard").classList.add("hidden");
  el("examContent").classList.add("hidden");
  el("settingsBtn").disabled = true;
  document.body.classList.add("student-locked");
  if (!loginDialog.open) loginDialog.showModal();
  setTimeout(() => el("loginStudentName").focus(), 80);
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
  const score = Math.round(correct / sec.data.length * 100);
  const submission = {
    id:`submission_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    studentId:activeStudentId,
    studentName:activeStudent.name,
    section:currentSection,
    sectionTitle:sec.title,
    startedAt:activeStudent.startedAt,
    submittedAt,
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
    <p class="submission-time">提交时间：${formatDateTime(submittedAt)}（系统自动记录）</p>`;
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

el("studentLoginForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = normalizeStudentName(el("loginStudentName").value);
  if (!name) {
    el("loginError").textContent = "请输入孩子姓名。";
    return;
  }
  const {id, student} = getOrCreateStudent(name);
  activateStudent(id, student);
});

el("switchStudentBtn").addEventListener("click", () => {
  if (activeStudent) {
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

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

loginDialog.addEventListener("cancel", event => event.preventDefault());

const rememberedStudent = activeStudentId && students[activeStudentId];
openLogin(rememberedStudent?.name || "");
