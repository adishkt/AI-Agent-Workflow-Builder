export async function executeHttpStep(
  step,
  stepInput,
  { getRemainingTime }
) {
  const config = step.config || {};

  const url = config.url;

  if (!url) {
    throw new Error(
      "http_request step requires config.url"
    );
  }

  const method =
    String(config.method || "GET").toUpperCase();

  const headers = {
    ...(config.headers || {}),
  };

  const hasBody =
    !["GET", "HEAD"].includes(method);

  const body =
    hasBody && config.body !== undefined
      ? typeof config.body === "string"
        ? config.body
        : JSON.stringify(config.body)
      : undefined;

  if (
    body &&
    !headers["Content-Type"] &&
    !headers["content-type"]
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  const remaining =
    getRemainingTime();

  if (remaining <= 1000) {
    throw new Error(
      "Not enough function time remaining for HTTP request"
    );
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      Math.max(
        1000,
        remaining - 500
      )
    );

  try {
    const response =
      await fetch(url, {
        method,
        headers,
        body,
        signal:
          controller.signal,
      });

    const text =
      await response.text();

    let data;

    try {
      data =
        text
          ? JSON.parse(text)
          : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(
        `HTTP request failed: ${response.status} ${response.statusText} - ${text.slice(
          0,
          500
        )}`
      );
    }

    return {
      status: response.status,
      ok: true,
      data,
    };
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        "HTTP request timed out"
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
