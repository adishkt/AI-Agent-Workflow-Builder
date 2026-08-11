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
  // ========================================================
  // CORS
  // ========================================================

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-hasura-user-id"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // ======================================================
    // 1. ONLY ALLOW POST
    // ======================================================

    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        message:
          "Method not allowed. Use POST.",
      });
    }

    // ======================================================
    // 2. GET AUTHENTICATED USER
    // ======================================================

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

    // ======================================================
    // 3. GET STEP RUN ID
    // ======================================================

    const stepRunId =
      req.body?.input?.step_run_id;

    if (!stepRunId) {
      return res.status(400).json({
        success: false,
        message:
          "step_run_id is required",
      });
    }

    // ======================================================
    // 4. ENVIRONMENT
    // ======================================================

    if (
      !process.env.NHOST_GRAPHQL_URL
    ) {
      console.error(
        "NHOST_GRAPHQL_URL is not configured"
      );

      return res.status(500).json({
        success: false,
        message:
          "NHOST_GRAPHQL_URL is not configured",
      });
    }

    if (
      !process.env.NHOST_ADMIN_SECRET
    ) {
      console.error(
        "NHOST_ADMIN_SECRET is not configured"
      );

      return res.status(500).json({
        success: false,
        message:
          "NHOST_ADMIN_SECRET is not configured",
      });
    }

    // ======================================================
    // 5. GRAPHQL CLIENT
    // ======================================================

    const graphqlRequest =
      createGraphQLClient({
        getRemainingTime:
          () => 8000,
      });

    // ======================================================
    // 6. APPROVE PAUSED STEP
    //
    // approvePausedStep verifies:
    //
    // - step run exists
    // - step is paused
    // - workflow step exists
    // - step is approval_gate
    // - workflow exists
    // - user belongs to workflow organization
    // - user is owner/editor
    // - next step is resolved
    // - approval step is completed
    // - workflow resumes
    // - next step run is created
    // ======================================================

    console.log(
      "========================================"
    );

    console.log(
      "Approving workflow step"
    );

    console.log(
      "Step run:",
      stepRunId
    );

    console.log(
      "User:",
      userId
    );

    const result =
      await approvePausedStep(
        graphqlRequest,
        {
          stepRunId,
          userId,
        }
      );

    console.log(
      "Approval successful"
    );

    console.log(
      "========================================"
    );

    // ======================================================
    // 7. SUCCESS RESPONSE
    // ======================================================

    return res.status(200).json({
      success: true,

      message:
        "Approval accepted and workflow resumed",

      step_run_id:
        stepRunId,

      status:
        "approved",

      approved_by:
        userId,

      result,
    });
  } catch (error) {
    // ======================================================
    // ERROR HANDLING
    // ======================================================

    console.error(
      "========================================"
    );

    console.error(
      "approveStep error:"
    );

    console.error(
      error
    );

    console.error(
      "========================================"
    );

    const message =
      error?.message ||
      "Could not approve step";

    // ======================================================
    // AUTHORIZATION ERRORS
    // ======================================================

    if (
      message.includes(
        "not a member"
      ) ||
      message.includes(
        "Only an owner or editor"
      )
    ) {
      return res.status(403).json({
        success: false,
        message,
      });
    }

    // ======================================================
    // NOT FOUND ERRORS
    // ======================================================

    if (
      message.includes(
        "Step run not found"
      ) ||
      message.includes(
        "Workflow step not found"
      ) ||
      message.includes(
        "Workflow not found"
      )
    ) {
      return res.status(404).json({
        success: false,
        message,
      });
    }

    // ======================================================
    // INVALID STATE
    // ======================================================

    if (
      message.includes(
        "not waiting for approval"
      ) ||
      message.includes(
        "not an approval gate"
      )
    ) {
      return res.status(409).json({
        success: false,
        message,
      });
    }

    // ======================================================
    // INTERNAL ERROR
    // ======================================================

    return res.status(500).json({
      success: false,
      message,
    });
  }
};