
const sections = {
  words: { title: "第一部分：单词", data: QUESTION_BANK.words, className: "words-grid" },
  phrases: { title: "第二部分：短语", data: QUESTION_BANK.phrases, className: "phrases-grid" },
  sentences: { title: "第三部分：句子", data: QUESTION_BANK.sentences, className: "sentences-grid" }
};

let currentSection = localStorage.getItem("currentSection") || "words";
const state = JSON.parse(localStorage.getItem("englishTestAnswers") || "{}");
for (const key of Object.keys(sections)) state[key] ??= Array(sections[key].data.length).fill("");

const el = id => document.getElementById(id);
const questionsEl = el("questions");
const resultPanel = el("resultPanel");
const saveStatus = el("saveStatus");

el("studentName").value = localStorage.getItem("studentName") || "";
el("testDate").value = localStorage.getItem("testDate") || new Date().toISOString().slice(0,10);
el("allowReveal").checked = localStorage.getItem("allowReveal") === "true";
el("lenientMode").checked = localStorage.getItem("lenientMode") !== "false";

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

let saveTimer;
function saveAll(){
  localStorage.setItem("englishTestAnswers", JSON.stringify(state));
  localStorage.setItem("currentSection", currentSection);
  saveStatus.textContent = "已自动保存";
  saveStatus.style.color = "var(--ok)";
}
function queueSave(){
  saveStatus.textContent = "正在保存…";
  saveStatus.style.color = "var(--muted)";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAll, 250);
}

function render(){
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.section === currentSection));
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
  const sec = sections[currentSection];
  let correct = 0, wrong = 0, blank = 0;
  sec.data.forEach((answer, i) => {
    const box = el(`q-${i+1}`);
    box.querySelectorAll(".feedback,.reveal-btn").forEach(n => n.remove());
    const user = state[currentSection][i] || "";
    box.classList.remove("correct","wrong");

    if (!user.trim()){
      blank++;
      return;
    }
    if (normalize(user) === normalize(answer)){
      correct++;
      box.classList.add("correct");
    } else {
      wrong++;
      box.classList.add("wrong");
      const feedback = document.createElement("div");
      feedback.className = "feedback";
      feedback.textContent = "答案不一致";
      box.appendChild(feedback);

      if (el("allowReveal").checked){
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
  });

  const answered = correct + wrong;
  const score = answered ? Math.round(correct / sec.data.length * 100) : 0;
  resultPanel.innerHTML = `
    <h3>${sec.title}批改结果</h3>
    <div class="result-numbers">
      <span class="badge">正确 ${correct}</span>
      <span class="badge">错误 ${wrong}</span>
      <span class="badge">未答 ${blank}</span>
      <span class="badge">分数 ${score} / 100</span>
    </div>`;
  resultPanel.classList.remove("hidden");
  resultPanel.scrollIntoView({behavior:"smooth",block:"start"});
  saveAll();
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  currentSection = btn.dataset.section;
  render();
}));

el("gradeBtn").addEventListener("click", grade);

el("studentName").addEventListener("input", e => {
  localStorage.setItem("studentName", e.target.value);
  queueSave();
});
el("testDate").addEventListener("change", e => localStorage.setItem("testDate", e.target.value));

const settingsDialog = el("settingsDialog");
el("settingsBtn").addEventListener("click", () => settingsDialog.showModal());
el("allowReveal").addEventListener("change", e => localStorage.setItem("allowReveal", String(e.target.checked)));
el("lenientMode").addEventListener("change", e => localStorage.setItem("lenientMode", String(e.target.checked)));

el("resetBtn").addEventListener("click", () => {
  if (!confirm("确定要清空三个部分的全部答案吗？")) return;
  for (const key of Object.keys(sections)) state[key] = Array(sections[key].data.length).fill("");
  saveAll();
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
render();
