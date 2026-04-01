import wordRulesJson from '../config/word-rules.json' with { type: 'json' };

const WORD_PATTERN = /[a-z][a-z0-9+.-]*/g;
const WORD_TRIM_PATTERN = /^[^a-z0-9+#+]+|[^a-z0-9+#+]+$/g;

export function createWordRules(rawRules = wordRulesJson) {
  return {
    stopWords: new Set(rawRules.stopWords || []),
    shortWordAllowlist: new Set(rawRules.shortWordAllowlist || []),
    normalization: new Map(Object.entries(rawRules.normalization || {})),
    displayLabels: new Map(Object.entries(rawRules.displayLabels || {})),
  };
}

export const DEFAULT_WORD_RULES = createWordRules();

export function collectWordStatItems(sessions, {
  limit = 96,
  rules = DEFAULT_WORD_RULES,
  getSessionId = (session) => session?.id || session?.url || session?.title || '',
  getTextParts = (session) => [
    session?.title,
    session?.description,
    ...(session?.topics || []),
    ...(session?.speakers || []).map((speaker) => speaker?.company || ''),
  ],
} = {}) {
  const counts = new Map();
  const sessionSets = new Map();

  for (const session of sessions) {
    const sessionId = String(getSessionId(session) || '');
    const text = getTextParts(session).filter(Boolean).join(' ').toLowerCase();
    for (const rawWord of text.match(WORD_PATTERN) || []) {
      const cleanedWord = rawWord.replace(WORD_TRIM_PATTERN, '');
      const word = rules.normalization.get(cleanedWord) || cleanedWord;
      if (!word) continue;
      if ((word.length < 3 && !rules.shortWordAllowlist.has(word)) || rules.stopWords.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
      if (!sessionSets.has(word)) sessionSets.set(word, new Set());
      sessionSets.get(word).add(sessionId);
    }
  }

  return [...counts.entries()]
    .map(([word, count]) => ({
      word,
      count,
      sessionCount: sessionSets.get(word)?.size || 0,
      label: rules.displayLabels.get(word) || word,
    }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}
