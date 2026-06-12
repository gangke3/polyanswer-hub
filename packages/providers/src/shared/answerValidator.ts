import { normalizeAnswerText } from "./extraction.js";

/**
 * 通用 UI 文本标记——匹配任意一条时视为纯 UI 内容（非真实回答）
 */
const UI_ONLY_MARKERS = [
  "Copy", "Retry", "Share", "Edit",
  "Good response", "Bad response",
  "Regenerate", "Like", "Dislike",
  "Try again", "Stop generating",
  "\u590d\u5236", "\u91cd\u65b0\u751f\u6210", "\u5206\u4eab", "\u70b9\u8d5e", "\u70b9\u8e29",
  "\u00c9diter", "Copier", "R\u00e9g\u00e9n\u00e9rer",
  "Bearbeiten", "Kopieren", "Neu generieren"
];

/**
 * 截断标记：出现这些文字说明答案尚未生成完毕
 */
const TRUNCATION_MARKERS = [
  "Continue generating",
  "continue generating",
  "Show more",
  "show more",
  "\u7ee7\u7eed\u751f\u6210",
  "\u5c55\u5f00\u66f4\u591a",
  "Lire la suite",
  "Weiterlesen",
  "Continua a generare"
];

/**
 * 句子中途截断标记：答案以这些字符/词结尾，说明句子不完整
 */
const MID_SENTENCE_END_MARKERS = [
  "例如：", "比如：", "如：", "例如:", "比如:", "如:",
  "包括：", "包括:", "包含：", "包含:", 
  "如下：", "如下:", "以下：", "以下:", 
  "有：", "有:", "是：", "是:",
  "和", "或", "以及", "与",
  "但是", "然而", "不过", "而且", "并且",
  "因为", "所以", "因此", "如果", "那么",
  "首先", "其次", "最后", "另外", "此外",
  "总结", "总之", "综上",
  "第", "1.", "2.", "3.", "4.", "5.",
  ",", "，", "、", "；", "：", ":", "—"
];

/**
 * 判断文本是否仅为 UI 元素（按钮、操作标签等），而非真实回答内容
 */
export function isUiOnlyText(text: string): boolean {
  const normalized = normalizeAnswerText(text);
  if (!normalized) {
    return true;
  }
  return normalized.length < 200 && UI_ONLY_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * 检测答案是否明显不完整（截断）。
 *
 * 触发条件：
 *  1. 答案文本过短（< 80 字符）
 *  2. 包含"继续生成"等截断标记
 *  3. 以逗号、冒号、"例如"等标记结尾，明显句子未完成
 */
export function isAnswerIncomplete(text: string): boolean {
  const normalized = normalizeAnswerText(text);

  if (!normalized) {
    return true;
  }

  // 内容过短（从 20 提升到 80，因为真正的答案至少几十个字）
  if (normalized.length < 80) {
    return true;
  }

  // 包含明确的截断标记
  if (TRUNCATION_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  // 检测句子中途截断：结尾字符暗示内容未完
  const trimmed = normalized.trimEnd();
  if (MID_SENTENCE_END_MARKERS.some((marker) => trimmed.endsWith(marker))) {
    return true;
  }

  return false;
}
