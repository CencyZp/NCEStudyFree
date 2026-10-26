/** 练习题判分与文案。 */

export const TYPE_LABELS = {
  'vocab-choice': '词义选择',
  spell: '拼写',
  'phrase-fill': '短语填空',
  cloze: '课文填空',
  'grammar-choice': '语法选择',
  'translation-choice': '句意选择',
  dictation: '听写',
};

export function normalizeAnswer(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,!?;:，。！？；：、]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkAnswer(question, response) {
  if (question.kind === 'choice') {
    return Number(response) === Number(question.answer);
  }
  return normalizeAnswer(response) === normalizeAnswer(question.answer);
}

export function choiceText(question, response) {
  if (question.kind !== 'choice') return String(response ?? '');
  const index = Number(response);
  return Number.isInteger(index) && question.options?.[index] ? question.options[index] : '';
}

export function typeLabel(type) {
  return TYPE_LABELS[type] || type;
}

export function isChoice(question) {
  return question?.kind === 'choice';
}

export function questionPromptLines(question) {
  return String(question.prompt || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
