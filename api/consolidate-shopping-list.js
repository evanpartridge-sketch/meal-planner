export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const itemList = items.map((it, i) => `${i + 1}. ${it}`).join("\n");

  const prompt = `You are a smart grocery shopping assistant. Convert this raw recipe ingredient list into a practical, consolidated shopping list.

Raw ingredients:
${itemList}

Rules:
1. COMBINE duplicates and related items by ingredient type:
   - "4 large garlic cloves, minced" + "2 garlic cloves" → "6 garlic cloves"
   - "1 large red onion, halved and sliced" + "18 tablespoons chopped onion" → "2 medium onions"
   - "½ cup cilantro" + "¼ cup chopped cilantro" → "1 bunch cilantro"

2. CONVERT recipe measurements to practical store-bought units:
   - Citrus juice (tbsp/cup) → whole fruits: ¼ cup lime juice = 2 limes, ½ cup lemon juice = 2 lemons
   - Fresh herbs by volume → bunches: ½ cup cilantro = 1 bunch, 1 cup basil = 1 bunch
   - Butter by tablespoon → sticks: 8 tbsp butter = 1 stick butter
   - Leave produce already in natural units as-is (e.g. "2 avocados", "3 tomatoes")

3. Use practical quantities with proper fractions (¼, ½, ¾) not decimals

4. Keep items concise and grocery-focused (drop prep instructions like "minced", "chopped", "diced")

5. If an item is already a sensible grocery unit, keep it

Return JSON only:
{"items": [{"text": "6 garlic cloves"}, {"text": "2 limes"}, ...]}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        temperature: 0,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: "{" },
        ],
      }),
    });

    const data = await response.json();
    const rawText = data.content?.[0]?.text?.trim();

    let parsed;
    try {
      parsed = JSON.parse("{" + rawText);
    } catch {
      return res.status(500).json({ error: "Could not parse response" });
    }

    if (!parsed.items || !Array.isArray(parsed.items)) {
      return res.status(500).json({ error: "Invalid response format" });
    }

    return res.status(200).json({ items: parsed.items.map(it => it.text || it) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to consolidate shopping list" });
  }
}
