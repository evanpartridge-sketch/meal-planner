export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ingredients, yield: yieldText } = req.body;

  if (!ingredients || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: "ingredients array required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const prompt = `Given this recipe that makes ${yieldText || "4 servings"}, estimate the total calories per serving.

Ingredients:
${ingredients.join("\n")}

Respond with JSON only, no text outside the JSON object:
{"calories": <integer calories per serving>, "breakdown": "<brief per-ingredient calorie list, one bullet point per line using •>"}`;

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
        max_tokens: 400,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: "{" },
        ],
      }),
    });

    const data = await response.json();
    const rawText = data.content?.[0]?.text?.trim();

    let calories, breakdown;
    try {
      const parsed = JSON.parse("{" + rawText);
      calories = parseInt(parsed.calories, 10);
      breakdown = parsed.breakdown || "";
    } catch {
      calories = NaN;
      breakdown = "";
    }

    if (isNaN(calories)) {
      return res.status(500).json({ error: "Could not parse calorie estimate" });
    }

    return res.status(200).json({ caloriesPerServing: calories, calorieReasoning: breakdown });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to estimate calories" });
  }
}
