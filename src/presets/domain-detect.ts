/**
 * 领域识别（契约 v3）—— 按领域预设的 keywords 打分，返回**带证据的切换建议**。
 * 纯函数，便于测试；是否切换由 agent 向用户确认后决定。
 */

export interface DomainKeywordSet {
  name: string;
  keywords: string[];
}

export interface DomainSuggestion {
  domain: string;
  score: number;
  matched: string[];
  coverage: number;
}

export interface DomainDetectResult {
  current: string;
  suggestions: DomainSuggestion[];
  recommendation: { switch_to: string; reason: string; matched: string[] } | null;
}

/** 单字关键词噪声太大（如"额"），不参与匹配 */
const MIN_KEYWORD_LEN = 2;

export function detectDomain(
  text: string,
  domains: DomainKeywordSet[],
  current: string,
  minHits = 2
): DomainDetectResult {
  const haystack = text.toLowerCase();
  const suggestions: DomainSuggestion[] = [];

  for (const d of domains) {
    const matched: string[] = [];
    for (const raw of d.keywords) {
      const k = raw.trim();
      if (k.length < MIN_KEYWORD_LEN) continue;
      if (haystack.includes(k.toLowerCase())) matched.push(k);
    }
    if (matched.length === 0) continue;

    const score = matched.reduce((s, k) => s + 1 + Math.max(0, k.length - 2), 0);
    const total = d.keywords.filter((k) => k.trim().length >= MIN_KEYWORD_LEN).length;
    suggestions.push({
      domain: d.name,
      score,
      matched,
      coverage: total > 0 ? Number((matched.length / total).toFixed(2)) : 0,
    });
  }

  suggestions.sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));

  const top = suggestions[0];
  const second = suggestions[1];
  const shouldSwitch =
    top !== undefined &&
    top.domain !== current &&
    top.matched.length >= minHits &&
    (second === undefined || top.score > second.score);

  return {
    current,
    suggestions,
    recommendation: shouldSwitch
      ? {
          switch_to: top.domain,
          matched: top.matched,
          reason: `命中 ${top.matched.length} 个「${top.domain}」领域关键词：${top.matched.join("、")}`,
        }
      : null,
  };
}
