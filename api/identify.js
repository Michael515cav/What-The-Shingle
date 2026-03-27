export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { image, hint, mode, productName } = req.body;

  try {
    // MODE: visual — send image to Claude, get top 3 candidates
    if (mode === 'visual') {
      const sys = `You are the world's foremost expert on roofing shingles with 30+ years of experience identifying every product ever manufactured. You have memorized every shingle product line, color, texture pattern, shadow line, granule blend, cutout style, and tab shape from GAF, Owens Corning, CertainTeed, Tamko, IKO, Atlas, Malarkey, and all other manufacturers.

Analyze the photo carefully. Examine: tab style, shadow line shape and height, granule color and blend pattern, texture, laminate thickness, exposure, and any other distinguishing visual features.

Return your TOP 3 most likely candidates ranked by confidence. Be honest — if the photo is unclear, say so and lower your confidence scores accordingly.

${hint ? `The user says: "${hint}" — use this to narrow your candidates.` : ''}

Respond ONLY with a raw JSON array of exactly 3 objects. No markdown, no backticks, no text before or after.

Schema:
[
  {
    "rank": 1,
    "productName": string,
    "manufacturer": string,
    "colorStyle": string,
    "confidence": number 0-100,
    "visualReasoning": string (2 sentences max — what specific visual features point to this product),
    "colorHex": string (approximate hex of the shingle color)
  },
  { rank 2... },
  { rank 3... }
]`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: sys,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
              { type: 'text', text: 'Analyze this shingle photo and return your top 3 candidates as a JSON array.' }
            ]
          }]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const text = (data.content || []).map(b => b.text || '').join('').trim();
      const m = text.match(/\[[\s\S]*\]/);
      if (!m) throw new Error('No JSON array in response');
      return res.status(200).json(JSON.parse(m[0]));
    }

    // MODE: specs — user selected a candidate, get full specs
    if (mode === 'specs') {
      const sys = `You are the world's foremost expert on roofing shingles. Return complete specs for the given product.

Respond ONLY with a raw JSON object. No markdown, no backticks, no extra text.

Schema:
{
  "productName": string,
  "manufacturer": string,
  "colorStyle": string,
  "shingleType": string,
  "material": string,
  "dimensions": string or null,
  "warrantyOriginal": string or null,
  "weightPerSquare": string or null,
  "windRating": string or null,
  "fireRating": string or null,
  "availability": "active" or "discontinued" or "limited",
  "discontinuedYear": string or null,
  "replacedBy": string or null,
  "whereToBuy": string,
  "pricePerSquare": string or null,
  "confidence": number 0-100,
  "fieldNotes": string,
  "alternatives": [{"productName": string, "manufacturer": string, "reason": string, "colorHex": string, "available": boolean}]
}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          system: sys,
          messages: [{ role: 'user', content: `Return full specs as JSON for: ${productName}` }]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const text = (data.content || []).map(b => b.text || '').join('').trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('No JSON in response');
      return res.status(200).json(JSON.parse(m[0]));
    }

    // MODE: code — look up by shingle code/number printed on the shingle
    if (mode === 'code') {
      const sys = `You are the world's foremost expert on roofing shingles. Roofers often find codes, numbers, or text printed on the back tab or surface of shingles — these can be color codes, batch numbers, product codes, UPC numbers, or style names.

The user will give you whatever text/numbers they found on the shingle. Identify the exact product from this and return full specs.

If you cannot identify the exact product from the code, make your best match and lower the confidence score accordingly.

Respond ONLY with a raw JSON object. No markdown, no backticks, no extra text.

Schema:
{
  "productName": string,
  "manufacturer": string,
  "colorStyle": string,
  "shingleType": string,
  "material": string,
  "dimensions": string or null,
  "warrantyOriginal": string or null,
  "weightPerSquare": string or null,
  "windRating": string or null,
  "fireRating": string or null,
  "availability": "active" or "discontinued" or "limited",
  "discontinuedYear": string or null,
  "replacedBy": string or null,
  "whereToBuy": string,
  "pricePerSquare": string or null,
  "confidence": number 0-100,
  "codeExplained": string (explain what the code means — what each part identifies),
  "fieldNotes": string,
  "alternatives": [{"productName": string, "manufacturer": string, "reason": string, "colorHex": string, "available": boolean}]
}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          system: sys,
          messages: [{ role: 'user', content: `Identify this shingle from the code/text found on it and return full specs as JSON:\n\n"${req.body.code}"` }]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const text = (data.content || []).map(b => b.text || '').join('').trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('No JSON in response');
      return res.status(200).json(JSON.parse(m[0]));
    }

    res.status(400).json({ error: { message: 'Invalid mode' } });

  } catch(e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
