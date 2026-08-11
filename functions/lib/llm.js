export async function executeLLMStep(
  step,
  stepInput,
  {
    getRemainingTime,
  }
) {
  const config =
    step.config || {};

  const basePrompt =
    config.prompt ??
    config.message ??
    step.name ??
    "Complete this task.";

  const previousOutput =
    stepInput?.previous_output;

  let prompt =
    basePrompt;

  // ==========================================================
  // STEP-TO-STEP CHAINING
  // ==========================================================

  if (
    previousOutput !== undefined &&
    previousOutput !== null
  ) {
    prompt += `

Previous step output:
${JSON.stringify(previousOutput)}
`;
  }

  const model =
    config.model ||
    "openai/gpt-4o-mini";

  console.log(
    `Calling OpenRouter using ${model}`
  );

  console.log(
    "Previous output:",
    JSON.stringify(
      previousOutput
    )
  );

  // ==========================================================
  // TIME CHECK
  // ==========================================================

  const remaining =
    getRemainingTime();

  if (remaining < 4000) {
    throw new Error(
      "Not enough time remaining to call OpenRouter"
    );
  }

  // ==========================================================
  // OPENROUTER
  // ==========================================================

  const controller =
    new AbortController();

  const timeoutMs =
    Math.min(
      3000,
      Math.max(
        1500,
        remaining - 1200
      )
    );

  console.log(
    `OpenRouter timeout: ${timeoutMs}ms`
  );

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, timeoutMs);

  let response;

  try {
    response =
      await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${process.env.OPENROUTER_API_KEY}`,

            "HTTP-Referer":
              "https://app.nhost.io",

            "X-Title":
              "AI Agent Workflow Builder",
          },

          body: JSON.stringify({
            model,

            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],

            max_tokens:
              config.max_tokens ||
              150,
          }),

          signal:
            controller.signal,
        }
      );
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        "OpenRouter request timed out after 3 seconds"
      );
    }

    throw new Error(
      `Could not connect to OpenRouter: ${
        error?.message ||
        "Unknown error"
      }`
    );
  } finally {
    clearTimeout(timeout);
  }

  // ==========================================================
  // RESPONSE
  // ==========================================================

  const text =
    await response.text();

  let result;

  try {
    result =
      JSON.parse(text);
  } catch {
    throw new Error(
      `OpenRouter returned invalid JSON: ${text.slice(
        0,
        500
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
        `OpenRouter request failed with status ${response.status}`
    );
  }

  const aiText =
    result
      ?.choices?.[0]
      ?.message?.content;

  if (!aiText) {
    throw new Error(
      "OpenRouter returned no text response"
    );
  }

  const output = {
    text: aiText,

    model:
      result.model ||
      model,
  };

  console.log(
    "LLM step completed"
  );

  console.log(
    "Step output:",
    JSON.stringify(output)
  );

  return output;
}
