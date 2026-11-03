// Read-only account access check. Never prints credentials or raw provider errors.
const model = 'gpt-image-2.5-sunburst';
if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error('OPENAI_API_KEY is not configured.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${model}`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) {
      console.log(`${model}: accessible to this API key (HTTP ${response.status}). This read-only check does not generate an image or verify editing output.`);
    } else {
      console.error(`Model access check failed (HTTP ${response.status}). Check the key, model permissions, organization verification, and billing. No image edit was requested.`);
      process.exitCode = 1;
    }
  } catch {
    console.error('Model access check could not reach OpenAI. Check network access. No image edit was requested.');
    process.exitCode = 1;
  }
}
