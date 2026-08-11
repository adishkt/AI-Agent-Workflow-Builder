import {
  createGraphQLClient,
} from "./lib/graphql.js";

import {
  approvePausedStep,
} from "./lib/workflow.js";

export default async (
  req,
  res
) => {
  try {
    // ========================================================
    // 1. GET AUTHENTICATED USER
    // ========================================================

    const userId =
      req.body?.session_variables?.[
        "x-hasura-user-id"
      ];

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authenticated user is required",
      });
    }

    // ========================================================
    // 2. GET STEP RUN ID
    // ========================================================

    const stepRunId =
      req.body?.input?.step_run_id;

    if (!stepRunId) {
      return res.status(400).json({
        success: false,
        message:
          "step_run_id is required",
      });
    }

    // ========================================================
    // 3. ENVIRONMENT
    // ========================================================

    if (
      !process.env.NHOST_GRAPHQL_URL
    ) {
      throw new Error(
        "NHOST_GRAPHQL_URL is not configured"
      );
    }

    if (
      !process.env.NHOST_ADMIN_SECRET
    ) {
      throw new Error(
        "NHOST_ADMIN_SECRET is not configured"
      );
    }

    // ========================================================
    // 4. GRAPHQL CLIENT
    // ========================================================

    const graphqlRequest =
      createGraphQLClient({
        getRemainingTime:
          () => 8000,
      });

    // ========================================================
    // 5. APPROVE
    //
    // approvePausedStep itself verifies:
    //
    // - step exists
    // - step is approval_gate
    // - workflow exists
    // - user belongs to workflow org
    // - user is owner/editor
    // ========================================================

    const result =
      await approvePausedStep(
        graphqlRequest,
        {
          stepRunId,

          userId,
        }
      );

    return res.status(200).json({
      success: true,

      message:
        "Approval accepted and workflow resumed",

      step_run_id:
        stepRunId,

      approved_by:
        userId,

      result,
    });
  } catch (error) {
    console.error(
      "approveStep error:",
      error
    );

    return res.status(403).json({
      success: false,

      message:
        error?.message ||
        "Could not approve step",
    });
  }
};
