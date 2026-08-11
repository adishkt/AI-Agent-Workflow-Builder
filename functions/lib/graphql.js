export function createGraphQLClient({
  getRemainingTime,
}) {
  return async function graphqlRequest(
    query,
    variables = {}
  ) {
    const remaining =
      getRemainingTime();

    if (remaining < 600) {
      throw new Error(
        "Not enough time remaining for GraphQL request"
      );
    }

    const controller =
      new AbortController();

    const timeoutMs = Math.min(
      1200,
      Math.max(
        600,
        remaining - 300
      )
    );

    const timeout =
      setTimeout(() => {
        controller.abort();
      }, timeoutMs);

    try {
      const response =
        await fetch(
          process.env.NHOST_GRAPHQL_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-hasura-admin-secret":
                process.env.NHOST_ADMIN_SECRET,
            },

            body: JSON.stringify({
              query,
              variables,
            }),

            signal:
              controller.signal,
          }
        );

      const text =
        await response.text();

      let result;

      try {
        result =
          JSON.parse(text);
      } catch {
        throw new Error(
          `GraphQL returned invalid JSON: ${text.slice(
            0,
            500
          )}`
        );
      }

      if (
        !response.ok ||
        result.errors
      ) {
        throw new Error(
          result.errors?.[0]?.message ||
            `GraphQL request failed with status ${response.status}`
        );
      }

      return result.data;
    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        throw new Error(
          "GraphQL request timed out"
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}
