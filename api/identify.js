export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { image, mode, shingleName } = req.body;

  try {
    // STEP 1: Send to Google Vision API for web detection
    if (mode === 'vision') {
      const visionRes = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: image },
              features: [
                { type: 'WEB_DETECTION', maxResults: 10 },
                { type: 'LABEL_DETECTION', maxResults: 10 }
              ]
            }]
          })
        }
      );
      const visionData = await visionRes.json();
      if (visionData.error) throw new Error(visionData.error.message);
      const web = visionData.responses?.[0]?.webDetection || {};
      const labels = visionData.responses?.[0]?.labelAnnotations || [];

      // Extract the most useful signals
      const bestGuesses = (web.bestGuessLabels || []).map(g => g.label);
      const webEntities = (web.webEntities || [])
        .filter(e => e.score > 0.3 && e.description)
        .map(e => e.description);
      const pagesWithImage = (web.pagesWithMatchingImages || [])
        .slice(0, 5)
        .map(p => p.pageTitle || p.url);
      const labelDesc = labels.slice(0, 8).map(l => l.description);

      return res.status(200).json({
        bestGuesses,
        webEntities,
        pagesWithImage,
        labels: labelDesc
      });
    }

    // STEP 2: Send Vision results to Claude for research
    if (mode === 'research') {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: `You are the world's foremost expert on roofing shingles — every product ever made by GAF, Owens Corning, CertainTeed, Tamko, IKO, Atlas, Malarkey, and all manufacturers. You have complete knowledge of every product line, color, spec, warranty, discontinuation history, and compatible alternative.

You will receive signals from Google Vision's web detection about a shingle photo. Use ALL signals — best guess labels, web entities, matching page titles — to identify the most likely shingle product. Then return everything known about it.

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
  "identifiedFrom": string (brief explanation of what Vision signals led to this ID),
  "fieldNotes": string (practical notes for a roofer: sourcing, install quirks, insurance relevance),
  "alternatives": [{"productName": string, "manufacturer": string, "reason": string, "colorHex": string, "available": boolean}]
}`,
          messages: [{
            role: 'user',
            content: `Google Vision returned these signals from a shingle photo:

Best guess labels: ${JSON.stringify(shingleName.bestGuesses)}
Web entities: ${JSON.stringify(shingleName.webEntities)}
Matching page titles: ${JSON.stringify(shingleName.pagesWithImage)}
Image labels: ${JSON.stringify(shingleName.labels)}

Based on all of these signals, identify the shingle and return full details as JSON.`
          }]
        })
      });

      const claudeData = await claudeRes.json();
      if (claudeData.error) throw new Error(claudeData.error.message);
      const text = (claudeData.content || []).map(b => b.text || '').join('').trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('No JSON in Claude response');
      return res.status(200).json(JSON.parse(m[0]));
    }

    res.status(400).json({ error: { message: 'Invalid mode' } });

  } catch(e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
