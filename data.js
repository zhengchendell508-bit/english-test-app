/*
  题库读取顺序：
  1. 优先读取家长后台保存在浏览器 localStorage 中的题库
  2. 如果还没有保存，则使用下面的 Lesson 1 示例结构
*/
const DEFAULT_LESSON_BANK = {
  1: {
    title: "Lesson 1",
    words: Array.from({length:30}, (_,i) => ({
      prompt: "",
      answer: "",
      audioText: "",
      mode: "chinese"
    })),
    phrases: Array.from({length:30}, (_,i) => ({
      prompt: "",
      answer: "",
      audioText: "",
      mode: "chinese"
    })),
    sentences: Array.from({length:30}, (_,i) => ({
      prompt: "",
      answer: "",
      audioText: "",
      mode: "chinese"
    }))
  }
};

try{
  const saved = localStorage.getItem("englishLessonBankV1");
  window.LESSON_BANK = saved ? JSON.parse(saved) : DEFAULT_LESSON_BANK;
}catch{
  window.LESSON_BANK = DEFAULT_LESSON_BANK;
}
