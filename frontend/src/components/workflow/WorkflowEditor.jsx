import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  approveStep,
  deleteWorkflowStep,
  getCurrentUserRole,
  getWorkflowRun,
  reorderWorkflowSteps,
  triggerWorkflowRun,
} from "../../lib/graphql";

import WorkflowStepForm from "./WorkflowStepForm";


const STEP_LABELS = {
  llm: "LLM",
  http_request: "HTTP Request",
  db_write: "Database Write",
  conditional_branch: "Conditional Branch",
  approval_gate: "Approval Gate",
};


function WorkflowEditor({
  workflow,
  onBack,
}) {

  // ==========================================================
  // STEPS
  // ==========================================================

  const [steps, setSteps] = useState(
    () =>
      [
        ...(workflow?.workflow_steps || []),
      ].sort(
        (a, b) =>
          a.step_order -
          b.step_order
      )
  );


  // ==========================================================
  // FORM STATE
  // ==========================================================

  const [showStepForm, setShowStepForm] =
    useState(false);

  const [editingStep, setEditingStep] =
    useState(null);


  // ==========================================================
  // ERROR
  // ==========================================================

  const [error, setError] =
    useState("");


  // ==========================================================
  // ROLE
  // ==========================================================

  const [role, setRole] =
    useState("loading");

  const [roleLoading, setRoleLoading] =
    useState(true);


  // ==========================================================
  // RUN WORKFLOW STATE
  // ==========================================================

  const [runningWorkflow, setRunningWorkflow] =
    useState(false);

  const [runResult, setRunResult] =
    useState(null);

  const [runError, setRunError] =
    useState("");


  // ==========================================================
  // WORKFLOW RUN DETAILS
  // ==========================================================

  const [runDetails, setRunDetails] =
    useState(null);

  const [runLoading, setRunLoading] =
    useState(false);


  // ==========================================================
  // APPROVAL STATE
  // ==========================================================

  const [approvingStepRunId, setApprovingStepRunId] =
    useState(null);

  const [approvalError, setApprovalError] =
    useState("");


  // ==========================================================
  // UPDATE STEPS WHEN WORKFLOW CHANGES
  // ==========================================================

  useEffect(() => {

    if (!workflow) {
      return;
    }

    setSteps(
      [
        ...(workflow.workflow_steps || []),
      ].sort(
        (a, b) =>
          a.step_order -
          b.step_order
      )
    );

  }, [workflow]);


  // ==========================================================
  // LOAD CURRENT USER ROLE
  // ==========================================================

  useEffect(() => {

    let mounted = true;


    async function loadRole() {

      try {

        setRoleLoading(true);


        const currentRole =
          await getCurrentUserRole();


        console.log(
          "WorkflowEditor role:",
          currentRole
        );


        if (mounted) {

          setRole(
            currentRole
          );

        }

      } catch (err) {

        console.error(
          "Failed to get user role:",
          err
        );


        if (mounted) {

          setRole(
            "viewer"
          );


          setError(
            err?.message ||
              "Could not determine user role"
          );

        }

      } finally {

        if (mounted) {

          setRoleLoading(false);

        }

      }

    }


    loadRole();


    return () => {

      mounted = false;

    };

  }, []);


  // ==========================================================
  // PERMISSIONS
  // ==========================================================

  const canEdit =
    role === "owner" ||
    role === "editor";


  const canDelete =
    role === "owner";


  const canRun =
    role === "owner" ||
    role === "editor" ||
    role === "viewer";


  // ==========================================================
  // SORT STEPS
  // ==========================================================

  const sortedSteps = useMemo(
    () =>
      [...steps].sort(
        (a, b) =>
          a.step_order -
          b.step_order
      ),
    [steps]
  );


  // ==========================================================
  // GET STEP RUN FOR WORKFLOW STEP
  // ==========================================================

  const getStepRunForStep = (
    stepId
  ) => {

    if (!runDetails?.stepRuns) {
      return null;
    }


    return (
      runDetails.stepRuns.find(
        (stepRun) =>
          stepRun.workflow_step_id ===
          stepId
      ) || null
    );

  };


  // ==========================================================
  // REFRESH WORKFLOW RUN
  // ==========================================================

  const refreshWorkflowRun = async (
    runId
  ) => {

    if (!runId) {
      return;
    }


    try {

      setRunLoading(true);


      const details =
        await getWorkflowRun(
          runId
        );


      console.log(
        "Workflow run details:",
        details
      );


      setRunDetails(
        details
      );

    } catch (err) {

      console.error(
        "Failed to get workflow run:",
        err
      );


      setRunError(
        err?.message ||
          "Could not load workflow run"
      );

    } finally {

      setRunLoading(false);

    }

  };


  // ==========================================================
  // POLL WORKFLOW RUN
  // ==========================================================

  useEffect(() => {

    const runId =
      runResult?.run_id;


    if (!runId) {
      return;
    }


    let mounted = true;


    // Load immediately

    refreshWorkflowRun(
      runId
    );


    const interval =
      setInterval(
        async () => {

          if (!mounted) {
            return;
          }


          try {

            const details =
              await getWorkflowRun(
                runId
              );


            if (!mounted) {
              return;
            }


            setRunDetails(
              details
            );


            console.log(
              "Workflow run updated:",
              details
            );

          } catch (err) {

            console.error(
              "Failed to refresh workflow run:",
              err
            );

          }

        },
        2000
      );


    return () => {

      mounted = false;

      clearInterval(
        interval
      );

    };

  }, [
    runResult?.run_id,
  ]);


  // ==========================================================
  // CREATE STEP
  // ==========================================================

  const handleStepCreated = (
    step
  ) => {

    setError("");


    setSteps(
      (currentSteps) => [
        ...currentSteps,
        step,
      ]
    );


    setShowStepForm(
      false
    );

    setEditingStep(
      null
    );

  };


  // ==========================================================
  // UPDATE STEP
  // ==========================================================

  const handleStepUpdated = (
    updatedStep
  ) => {

    setError("");


    setSteps(
      (currentSteps) =>
        currentSteps.map(
          (step) =>
            step.id ===
            updatedStep.id
              ? updatedStep
              : step
        )
    );


    setEditingStep(
      null
    );

    setShowStepForm(
      false
    );

  };


  // ==========================================================
  // EDIT STEP
  // ==========================================================

  const handleEdit = (
    step
  ) => {

    setError("");

    setEditingStep(
      step
    );

    setShowStepForm(
      false
    );

  };


  // ==========================================================
  // CANCEL FORM
  // ==========================================================

  const handleCancelForm = () => {

    setEditingStep(
      null
    );

    setShowStepForm(
      false
    );

    setError("");

  };


  // ==========================================================
  // DELETE STEP
  // ==========================================================

  const handleDelete = async (
    step
  ) => {

    const confirmed =
      window.confirm(
        `Delete "${step.name}"?`
      );


    if (!confirmed) {
      return;
    }


    try {

      setError("");


      await deleteWorkflowStep(
        step.id
      );


      const remainingSteps =
        sortedSteps
          .filter(
            (item) =>
              item.id !==
              step.id
          )
          .map(
            (item, index) => ({
              ...item,
              step_order:
                index + 1,
            })
          );


      setSteps(
        remainingSteps
      );


      if (
        remainingSteps.length >
        0
      ) {

        await reorderWorkflowSteps(
          remainingSteps
        );

      }

    } catch (err) {

      console.error(
        "Failed to delete workflow step:",
        err
      );


      setError(
        err?.message ||
          "Could not delete workflow step"
      );

    }

  };


  // ==========================================================
  // MOVE STEP UP
  // ==========================================================

  const handleMoveUp = async (
    step
  ) => {

    const index =
      sortedSteps.findIndex(
        (item) =>
          item.id ===
          step.id
      );


    if (index <= 0) {
      return;
    }


    const newSteps = [
      ...sortedSteps,
    ];


    const previous =
      newSteps[index - 1];


    newSteps[index - 1] =
      step;

    newSteps[index] =
      previous;


    const reordered =
      newSteps.map(
        (item, index) => ({
          ...item,
          step_order:
            index + 1,
        })
      );


    try {

      setError("");

      setSteps(
        reordered
      );


      await reorderWorkflowSteps(
        reordered
      );

    } catch (err) {

      console.error(
        "Failed to reorder steps:",
        err
      );


      setError(
        err?.message ||
          "Could not reorder workflow steps"
      );


      setSteps(
        sortedSteps
      );

    }

  };


  // ==========================================================
  // MOVE STEP DOWN
  // ==========================================================

  const handleMoveDown = async (
    step
  ) => {

    const index =
      sortedSteps.findIndex(
        (item) =>
          item.id ===
          step.id
      );


    if (
      index === -1 ||
      index >=
        sortedSteps.length - 1
    ) {

      return;

    }


    const newSteps = [
      ...sortedSteps,
    ];


    const next =
      newSteps[index + 1];


    newSteps[index + 1] =
      step;

    newSteps[index] =
      next;


    const reordered =
      newSteps.map(
        (item, index) => ({
          ...item,
          step_order:
            index + 1,
        })
      );


    try {

      setError("");

      setSteps(
        reordered
      );


      await reorderWorkflowSteps(
        reordered
      );

    } catch (err) {

      console.error(
        "Failed to reorder steps:",
        err
      );


      setError(
        err?.message ||
          "Could not reorder workflow steps"
      );


      setSteps(
        sortedSteps
      );

    }

  };


  // ==========================================================
  // RUN WORKFLOW
  // ==========================================================

  const handleRunWorkflow =
    async () => {

      if (!workflow?.id) {

        setRunError(
          "Workflow ID is missing."
        );

        return;

      }


      if (
        sortedSteps.length ===
        0
      ) {

        setRunError(
          "Add at least one workflow step before running."
        );

        return;

      }


      try {

        setRunningWorkflow(
          true
        );

        setRunError("");

        setApprovalError("");

        setRunResult(
          null
        );

        setRunDetails(
          null
        );


        console.log(
          "Starting workflow:",
          workflow.id
        );


        const result =
          await triggerWorkflowRun(
            workflow.id
          );


        console.log(
          "Workflow run started:",
          result
        );


        setRunResult(
          result
        );


      } catch (err) {

        console.error(
          "Failed to run workflow:",
          err
        );


        setRunError(
          err?.message ||
            "Failed to run workflow"
        );

      } finally {

        setRunningWorkflow(
          false
        );

      }

    };


  // ==========================================================
  // APPROVE PAUSED STEP
  // ==========================================================

  const handleApproveStep =
    async (
      stepRun
    ) => {

      if (!stepRun?.id) {

        setApprovalError(
          "Step run ID is missing."
        );

        return;

      }


      if (
        stepRun.status !==
        "paused"
      ) {

        setApprovalError(
          "This step is no longer waiting for approval."
        );

        return;

      }


      try {

        setApprovingStepRunId(
          stepRun.id
        );

        setApprovalError("");


        console.log(
          "Approving step run:",
          stepRun.id
        );


        const result =
          await approveStep(
            stepRun.id
          );


        console.log(
          "Approval result:",
          result
        );


        // Immediately refresh

        if (
          runResult?.run_id
        ) {

          await refreshWorkflowRun(
            runResult.run_id
          );

        }

      } catch (err) {

        console.error(
          "Failed to approve workflow step:",
          err
        );


        setApprovalError(
          err?.message ||
            "Could not approve workflow step"
        );

      } finally {

        setApprovingStepRunId(
          null
        );

      }

    };


  // ==========================================================
  // SAFETY RENDER
  // ==========================================================

  if (!workflow) {

    return (
      <section className="workflow-editor">

        <p>
          Loading workflow...
        </p>

      </section>
    );

  }


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <section className="workflow-editor">


      {/* ==================================================== */}
      {/* BACK */}
      {/* ==================================================== */}

      <button
        type="button"
        onClick={onBack}
      >
        ← Back to Workflows
      </button>


      {/* ==================================================== */}
      {/* WORKFLOW HEADER */}
      {/* ==================================================== */}

      <div className="workflow-editor-header">

        <div>

          <h2>
            {workflow.name}
          </h2>

          <p>
            {workflow.description ||
              "No description"}
          </p>

        </div>


        <div>

          <strong>
            Role:{" "}
            {roleLoading
              ? "Loading..."
              : role}
          </strong>


          {/* ============================================== */}
          {/* RUN WORKFLOW */}
          {/* ============================================== */}

          {canRun &&
            !roleLoading && (

              <button
                type="button"
                onClick={
                  handleRunWorkflow
                }
                disabled={
                  runningWorkflow ||
                  sortedSteps.length ===
                    0
                }
                style={{
                  marginLeft:
                    "20px",
                }}
              >

                {runningWorkflow
                  ? "Running..."
                  : "▶ Run Workflow"}

              </button>

            )}

        </div>

      </div>


      <hr />


      {/* ==================================================== */}
      {/* GENERAL ERROR */}
      {/* ==================================================== */}

      {error && (

        <p className="error">
          {error}
        </p>

      )}


      {/* ==================================================== */}
      {/* RUN ERROR */}
      {/* ==================================================== */}

      {runError && (

        <p className="error">
          {runError}
        </p>

      )}


      {/* ==================================================== */}
      {/* APPROVAL ERROR */}
      {/* ==================================================== */}

      {approvalError && (

        <p className="error">
          {approvalError}
        </p>

      )}


      {/* ==================================================== */}
      {/* RUN RESULT */}
      {/* ==================================================== */}

      {runResult && (

        <div
          className="workflow-run-result"
        >

          <h3>
            Workflow Run
          </h3>


          <p>
            <strong>
              Status:
            </strong>{" "}

            {runDetails?.run?.status ||
              runResult.status ||
              "Started"}

          </p>


          {runResult.run_id && (

            <p>
              <strong>
                Run ID:
              </strong>{" "}

              {runResult.run_id}

            </p>

          )}


          {runResult.message && (

            <p>
              {runResult.message}
            </p>

          )}


          {runLoading && (

            <p>
              Refreshing workflow status...
            </p>

          )}

        </div>

      )}


      {/* ==================================================== */}
      {/* STEP TITLE */}
      {/* ==================================================== */}

      <div className="workflow-editor-title">

        <h3>
          Workflow Steps
        </h3>


        {/* ================================================ */}
        {/* ADD STEP */}
        {/* ================================================ */}

        {canEdit &&
          !roleLoading && (

            <button
              type="button"
              onClick={() => {

                setEditingStep(
                  null
                );

                setShowStepForm(
                  true
                );

                setError("");

              }}
            >
              + Add Step
            </button>

          )}

      </div>


      {/* ==================================================== */}
      {/* STEPS */}
      {/* ==================================================== */}

      {sortedSteps.length ===
      0 ? (

        <p>
          No steps added yet.
        </p>

      ) : (

        <div className="workflow-steps">

          {sortedSteps.map(
            (
              step,
              index
            ) => {

              const stepRun =
                getStepRunForStep(
                  step.id
                );


              const isApprovalGate =
                step.type ===
                "approval_gate";


              const isPaused =
                stepRun?.status ===
                "paused";


              const waitingForApproval =
                isApprovalGate &&
                isPaused;


              return (

                <div
                  key={step.id}
                  className="workflow-step-card"
                >


                  {/* ====================================== */}
                  {/* STEP HEADER */}
                  {/* ====================================== */}

                  <div className="workflow-step-header">

                    <div>

                      <h4>
                        Step{" "}
                        {step.step_order}
                        :{" "}
                        {step.name}
                      </h4>


                      <span>
                        {
                          STEP_LABELS[
                            step.type
                          ] ||
                          step.type
                        }
                      </span>

                    </div>


                    {/* ==================================== */}
                    {/* ACTIONS */}
                    {/* ==================================== */}

                    <div className="workflow-step-actions">


                      {canEdit && (

                        <>

                          {/* MOVE UP */}

                          <button
                            type="button"
                            onClick={() =>
                              handleMoveUp(
                                step
                              )
                            }
                            disabled={
                              index ===
                              0
                            }
                            title="Move up"
                          >
                            ↑
                          </button>


                          {/* MOVE DOWN */}

                          <button
                            type="button"
                            onClick={() =>
                              handleMoveDown(
                                step
                              )
                            }
                            disabled={
                              index ===
                              sortedSteps.length -
                                1
                            }
                            title="Move down"
                          >
                            ↓
                          </button>


                          {/* EDIT */}

                          <button
                            type="button"
                            onClick={() =>
                              handleEdit(
                                step
                              )
                            }
                          >
                            ✏️ Edit
                          </button>

                        </>

                      )}


                      {/* DELETE */}

                      {canDelete && (

                        <button
                          type="button"
                          onClick={() =>
                            handleDelete(
                              step
                            )
                          }
                        >
                          🗑️ Delete
                        </button>

                      )}

                    </div>

                  </div>


                  {/* ====================================== */}
                  {/* TYPE */}
                  {/* ====================================== */}

                  <p>
                    Type:{" "}
                    {STEP_LABELS[
                      step.type
                    ] ||
                      step.type}
                  </p>


                  {/* ====================================== */}
                  {/* STEP RUN STATUS */}
                  {/* ====================================== */}

                  {stepRun && (

                    <div
                      className="workflow-step-run-status"
                      style={{
                        margin:
                          "10px 0",
                        padding:
                          "10px",
                        border:
                          "1px solid #444",
                        borderRadius:
                          "8px",
                      }}
                    >

                      <p>

                        <strong>
                          Run Status:
                        </strong>{" "}

                        {stepRun.status}

                      </p>


                      {stepRun.attempt_count !==
                        undefined && (

                        <p>

                          <strong>
                            Attempts:
                          </strong>{" "}

                          {
                            stepRun.attempt_count
                          }

                        </p>

                      )}


                      {/* ================================= */}
                      {/* APPROVAL GATE */}
                      {/* ================================= */}

                      {waitingForApproval && (

                        <div
                          className="approval-gate"
                          style={{
                            marginTop:
                              "12px",
                            padding:
                              "12px",
                            border:
                              "1px solid #c084fc",
                            borderRadius:
                              "8px",
                          }}
                        >

                          <p>
                            <strong>
                              ⏸ Waiting for approval
                            </strong>
                          </p>


                          {stepRun.output
                            ?.message && (

                            <p>
                              {
                                stepRun
                                  .output
                                  .message
                              }
                            </p>

                          )}


                          {canEdit ? (

                            <button
                              type="button"
                              onClick={() =>
                                handleApproveStep(
                                  stepRun
                                )
                              }
                              disabled={
                                approvingStepRunId ===
                                stepRun.id
                              }
                            >

                              {approvingStepRunId ===
                              stepRun.id
                                ? "Approving..."
                                : "✅ Approve"}

                            </button>

                          ) : (

                            <p>
                              You do not have permission to approve this step.
                            </p>

                          )}

                        </div>

                      )}


                      {/* ================================= */}
                      {/* STEP OUTPUT */}
                      {/* ================================= */}

                      {stepRun.output && (

                        <details
                          style={{
                            marginTop:
                              "10px",
                          }}
                        >

                          <summary>
                            Step output
                          </summary>

                          <pre>
                            {JSON.stringify(
                              stepRun.output,
                              null,
                              2
                            )}
                          </pre>

                        </details>

                      )}


                      {/* ================================= */}
                      {/* STEP ERROR */}
                      {/* ================================= */}

                      {stepRun.error && (

                        <p className="error">

                          <strong>
                            Error:
                          </strong>{" "}

                          {stepRun.error}

                        </p>

                      )}

                    </div>

                  )}


                  {/* ====================================== */}
                  {/* CONFIG */}
                  {/* ====================================== */}

                  <pre>
                    {JSON.stringify(
                      step.config,
                      null,
                      2
                    )}
                  </pre>


                </div>

              );

            }
          )}

        </div>

      )}


      {/* ==================================================== */}
      {/* ADD STEP FORM */}
      {/* ==================================================== */}

      {showStepForm &&
        canEdit &&
        !editingStep && (

          <WorkflowStepForm

            workflowId={
              workflow.id
            }

            nextStepOrder={
              sortedSteps.length + 1
            }

            editingStep={
              null
            }

            onCreated={
              handleStepCreated
            }

            onUpdated={
              handleStepUpdated
            }

            onCancel={
              handleCancelForm
            }

          />

        )}


      {/* ==================================================== */}
      {/* EDIT STEP FORM */}
      {/* ==================================================== */}

      {editingStep &&
        canEdit && (

          <WorkflowStepForm

            workflowId={
              workflow.id
            }

            nextStepOrder={
              sortedSteps.length + 1
            }

            editingStep={
              editingStep
            }

            onCreated={
              handleStepCreated
            }

            onUpdated={
              handleStepUpdated
            }

            onCancel={
              handleCancelForm
            }

          />

        )}

    </section>
  );
}


export default WorkflowEditor;