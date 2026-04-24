#!/usr/bin/env node
// Direct end-to-end test of the Gemini API call that api/translate.ts makes.
// Reads GEMINI_API_KEY from .env.local.
// Usage: node scripts/test-gemini.mjs [word] [language]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((l) => !l.startsWith('#'))
    .forEach((line) => {
      const eq = line.indexOf('=');
      if (eq > 0) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    });
}

const word = process.argv[2] ?? '长';
const language = process.argv[3] ?? 'English';
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY not set');
  process.exit(1);
}

const SYSTEM_PROMPT = (w, l) => `你是一位专业的中文词典编辑，为非母语学习者编写词条。

对中文词"${w}"提供详细解释，翻译目标语言为 ${l}。

严格要求：
1. 列出所有常用含义与词性，每个单独作为一个 meaning 对象。
2. 如果是多音字或多音词，在每个 meaning 中填写 pinyin 字段表示该义项的读音。
3. 每个 meaning 提供一个自然、地道的中文例句。
4. 例句拆分为 Syllable 数组：每个汉字一个对象 { hanzi, pinyin }；标点符号也占一个位置，但 pinyin 填空字符串 ""。
5. wordSyllables 同样是 Syllable 数组，表示该词的主拼音读法（多音字取最常用）。
6. partOfSpeech、definition、example.translation 全部使用 ${l} 书写。
7. pinyin 使用带声调的带调标字母（例如 "hǎo"、"zhōng"、"cháng"），不要使用数字声调。
8. 只返回 JSON，严格符合提供的 schema，不要添加任何其他文字。`;

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    word: { type: 'STRING' },
    language: { type: 'STRING' },
    wordSyllables: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          hanzi: { type: 'STRING' },
          pinyin: { type: 'STRING' },
        },
        required: ['hanzi', 'pinyin'],
      },
    },
    meanings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          partOfSpeech: { type: 'STRING' },
          pinyin: { type: 'STRING' },
          definition: { type: 'STRING' },
          example: {
            type: 'OBJECT',
            properties: {
              chinese: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    hanzi: { type: 'STRING' },
                    pinyin: { type: 'STRING' },
                  },
                  required: ['hanzi', 'pinyin'],
                },
              },
              translation: { type: 'STRING' },
            },
            required: ['chinese', 'translation'],
          },
        },
        required: ['partOfSpeech', 'definition', 'example'],
      },
    },
  },
  required: ['word', 'language', 'wordSyllables', 'meanings'],
};

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
const body = {
  contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT(word, language) }] }],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: GEMINI_SCHEMA,
    temperature: 0.3,
  },
};

console.log(`→ 查询 "${word}" → ${language}`);
const t0 = Date.now();
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const elapsed = Date.now() - t0;
console.log(`← ${res.status} (${elapsed}ms)`);

if (!res.ok) {
  const txt = await res.text();
  console.error(txt);
  process.exit(1);
}

const data = await res.json();
const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) {
  console.error('empty content:', JSON.stringify(data, null, 2));
  process.exit(1);
}

const parsed = JSON.parse(text);
console.log('\n=== Parsed response ===');
console.log(JSON.stringify(parsed, null, 2));

console.log('\n=== Shape check ===');
console.log('word:', parsed.word);
console.log('language:', parsed.language);
console.log('wordSyllables:', parsed.wordSyllables?.length, 'syllables');
console.log('meanings:', parsed.meanings?.length, 'meaning(s)');
parsed.meanings?.forEach((m, i) => {
  console.log(`  [${i + 1}] ${m.partOfSpeech}${m.pinyin ? ` (${m.pinyin})` : ''}`);
  console.log(`      def: ${m.definition}`);
  const sentence = m.example?.chinese?.map((s) => s.hanzi).join('');
  const pinyinLine = m.example?.chinese?.map((s) => s.pinyin).filter(Boolean).join(' ');
  console.log(`      例: ${sentence}`);
  console.log(`      pinyin: ${pinyinLine}`);
  console.log(`      → ${m.example?.translation}`);
});
