// The paper-page node: a photo of a page someone wrote by hand becomes the words on it, so a day written partly on
// paper still reads as one page in Lore. One call to Claude Sonnet 5.5 (vision) reads the page; the words are the
// writer's own, so nothing is corrected. Code checks only that something came back and strips any framing.
// Shared by the backend (worker/).

export const READ_SYSTEM = `You transcribe a photo of a handwritten journal page, word for word.
- Write exactly what is written, in the language it is written in (often Chinese, English, or both mixed). Never translate, correct spelling or grammar, or tidy the wording.
- Keep the writer's paragraphs: a blank line between paragraphs. Join lines that were only wrapped by the page width.
- Leave out crossed-out words, page numbers, printed headers, and drawings. Write a word you cannot read as […].
- If the photo shows no handwriting, return nothing.
Return only the text, with no preface, quotes or notes.`;

/* framing a model sometimes adds anyway */
export function checkRead(text) {
  return String(text ?? '')
    .replace(/^```[a-z]*\s*|\s*```$/g, '')
    .replace(/^(here is|here's|transcription|以下是)[^\n]*\n+/i, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* call: ({ system, image, mime }) => { text } */
export async function read(image, mime, call) {
  const r = await call({ system: READ_SYSTEM, image, mime });
  return { text: checkRead(r.text), ms: r.ms };
}
