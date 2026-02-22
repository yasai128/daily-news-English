// Generates English lessons using Claude Haiku with in-memory caching (24h TTL)
// Env var required: ANTHROPIC_API_KEY

const cache = {};
const TTL = 24 * 60 * 60 * 1000; // 24 hours

const LEVEL_CONFIG = {
  beginner:
    "Beginner (TOEIC 300-500). Pick 5 basic vocabulary words. 2 grammar points (present/past tense, passive voice). Japanese explanations should be gentle and beginner-friendly.",
  intermediate:
    "Intermediate (TOEIC 600-750). Pick 6 intermediate vocabulary words. 3 grammar points (relative clauses, subjunctive, participle clauses).",
  advanced:
    "Advanced (TOEIC 800+). Pick 7 advanced vocabulary words. 3 advanced grammar points (inversion, cleft sentences, nominalization). Include business/academic expressions.",
};

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: '{"error":"POST only"}' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }) };
  }

  let article, level;
  try {
    const body = JSON.parse(event.body);
    article = body.article;
    level = body.level || "intermediate";
  } catch {
    return { statusCode: 400, headers, body: '{"error":"Invalid request body"}' };
  }

  // Cache key: based on title hash + level
  const titleKey = Buffer.from(article.title || "").toString("base64").slice(0, 40);
  const cacheKey = `lesson_${titleKey}_${level}`;

  if (cache[cacheKey] && Date.now() - cache[cacheKey].time < TTL) {
    return { statusCode: 200, headers, body: JSON.stringify(cache[cacheKey].data) };
  }

  const prompt = `You are an English teacher for Japanese learners, styled like CNN English Express magazine.

Here is today's news article:
Headline: ${article.title}
Source: ${article.source}
Summary: ${article.summary}

Create an English lesson based on this article. Return ONLY a valid JSON object. No markdown, no backticks, no text before or after the JSON:
{"headline":"The full English headline","body":"A 4-6 sentence English news paragraph expanding on the summary","translation":"上記bodyの自然な日本語訳","vocabulary":[{"word":"English word","pronunciation":"カタカナ発音","meaning":"日本語の意味","example":"Example sentence using this word","pos":"part of speech"}],"grammar":[{"pattern":"Grammar pattern name","explanation":"日本語での文法解説","sentence":"The relevant English sentence from body","breakdown":"文の構造の日本語解説"}],"quiz":[{"question":"Question text","options":["A","B","C","D"],"answer":0,"explanation":"日本語での解説"}]}

Level: ${LEVEL_CONFIG[level] || LEVEL_CONFIG.intermediate}
Include exactly 3 quiz questions (vocabulary, grammar, and comprehension).`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (data.error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: data.error.message }) };
    }

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);

    if (match) {
      const lesson = JSON.parse(match[0]);
      cache[cacheKey] = { time: Date.now(), data: lesson };
      return { statusCode: 200, headers, body: JSON.stringify(lesson) };
    }

    return { statusCode: 500, headers, body: '{"error":"Failed to parse lesson JSON"}' };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
