/*
  全新题库默认从空白 Lesson 1 开始。

  家长后台支持：
  1. TXT：每行“英文 | 中文”
  2. JS：const CHINESE_TRANSLATIONS = { "english": "中文" };

  上传后会自动分类，并按每类 30 条依次生成 Lesson 1、Lesson 2……
*/
const DEFAULT_LESSON_BANK = {
  1: {
    title: "Lesson 1",
    words: Array.from({length:30}, () => ({
      prompt: "", answer: "", audioText: "", mode: "chinese"
    })),
    phrases: Array.from({length:30}, () => ({
      prompt: "", answer: "", audioText: "", mode: "chinese"
    })),
    sentences: Array.from({length:30}, () => ({
      prompt: "", answer: "", audioText: "", mode: "chinese"
    }))
  }
};

try{
  const saved = localStorage.getItem("englishLessonBankV1");
  window.LESSON_BANK = saved ? JSON.parse(saved) : DEFAULT_LESSON_BANK;
}catch{
  window.LESSON_BANK = DEFAULT_LESSON_BANK;
}
