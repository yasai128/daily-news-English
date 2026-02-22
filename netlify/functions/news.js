// Fetches news from NewsData.io with in-memory caching (1 hour TTL)
// Env var required: NEWSDATA_API_KEY

const cache = {};
const TTL = 60 * 60 * 1000; // 1 hour

const CATEGORY_MAP = {
  world: "world",
  business: "business",
  tech: "technology",
  sports: "sports",
};

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const params = event.queryStringParameters || {};
  const category = params.category || "world";
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `news_${category}_${today}`;

  // Return cached if fresh
  if (cache[cacheKey] && Date.now() - cache[cacheKey].time < TTL) {
    return { statusCode: 200, headers, body: JSON.stringify(cache[cacheKey].data) };
  }

  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "NEWSDATA_API_KEY not configured. Add it in Netlify dashboard → Site settings → Environment variables." }) };
  }

  const ndCategory = CATEGORY_MAP[category] || "world";

  try {
    const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&language=en&category=${ndCategory}&image=1&size=5`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "success") {
      return { statusCode: 500, headers, body: JSON.stringify({ error: data.results?.message || "NewsData API error" }) };
    }

    const articles = (data.results || [])
      .filter((a) => a.title)
      .slice(0, 5)
      .map((a) => ({
        title: a.title || "",
        source: a.source_name || "Unknown",
        summary: a.description || a.title,
        topic: (a.category || [])[0] || category,
        image: a.image_url || null,
        link: a.link || "",
        pubDate: a.pubDate || "",
      }));

    // Cache the result
    cache[cacheKey] = { time: Date.now(), data: articles };

    return { statusCode: 200, headers, body: JSON.stringify(articles) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
