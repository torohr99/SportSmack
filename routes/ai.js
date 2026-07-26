const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// @route   POST /api/ai/meme
// @desc    Generate a meme image URL by enriching the prompt for maximum accuracy
router.post('/meme', authMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    // In a real application, we would pass this to an LLM to generate a highly detailed 
    // visual description (e.g., matching a player's name to their real-world appearance, team, and jersey).
    // For this implementation, we will procedurally enrich the prompt to force the image generator 
    // to focus on photorealistic, accurate subject portrayal.
    
    // We add strong styling keywords that instruct Pollinations (Stable Diffusion) 
    // to create an accurate depiction rather than a generic one.
    const enrichedPrompt = `Highly detailed photograph of ${prompt.trim()}, masterpiece, photorealistic, exact likeness, 8k resolution, award winning photography, clear facial features, accurate portrayal, meme format`;
    
    const randomSeed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enrichedPrompt)}?width=800&height=500&nologo=true&seed=${randomSeed}`;

    res.json({ imageUrl });
  } catch (error) {
    console.error('Error generating AI meme URL:', error.message);
    res.status(500).json({ message: 'Server error generating meme' });
  }
});

module.exports = router;
