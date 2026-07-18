/*
  每一个 Lesson 固定：
  单词 30 题、短语 30 题、句子 30 题。

  题目显示中文，孩子只输入英文。
  mode:
  - "chinese": 显示中文提示
  - "audio": 只显示喇叭，听声音输入英文

  将下面的示范内容替换成你的真实 Lesson 题库即可。
*/
window.LESSON_BANK = {
  1: {
    title: "Lesson 1",
    words: Array.from({length:30}, (_,i) => ({
      prompt: `单词中文提示 ${i+1}`,
      answer: `word${i+1}`,
      audioText: `word ${i+1}`,
      mode: "chinese"
    })),
    phrases: Array.from({length:30}, (_,i) => ({
      prompt: `短语中文提示 ${i+1}`,
      answer: `phrase ${i+1}`,
      audioText: `phrase ${i+1}`,
      mode: "chinese"
    })),
    sentences: Array.from({length:30}, (_,i) => ({
      prompt: `句子中文提示 ${i+1}`,
      answer: `This is sentence ${i+1}.`,
      audioText: `This is sentence ${i+1}.`,
      mode: "chinese"
    }))
  }
};
