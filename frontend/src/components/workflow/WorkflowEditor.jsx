import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  deleteWorkflowStep,
  getCurrentUserRole,
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
      [...(workflow?.workflow_steps || [])].sort(
        (a, b) =>
          a.step_order - b.step_order
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
  // UPDATE STEPS WHEN WORKFLOW CHANGES
  // ==========================================================

  useEffect(() => {

    if (!workflow) {
      return;
    }

    setSteps(
      [...(workflow.workflow_steps || [])].sort(
        (a, b) =>
          a.step_order - b.step_order
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

          setRole("viewer");


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


    setShowStepForm(false);

    setEditingStep(null);

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


    setEditingStep(null);

    setShowStepForm(false);

  };


  // ==========================================================
  // EDIT STEP
  // ==========================================================

  const handleEdit = (
    step
  ) => {

    setError("");

    setEditingStep(step);

    setShowStepForm(false);

  };


  // ==========================================================
  // CANCEL FORM
  // ==========================================================

  const handleCancelForm = () => {

    setEditingStep(null);

    setShowStepForm(false);

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
              item.id !== step.id
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


      // Persist the new ordering

      if (
        remainingSteps.length > 0
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
          item.id === step.id
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
          item.id === step.id
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

  const handleRunWorkflow = async () => {

    if (!workflow?.id) {

      setRunError(
        "Workflow ID is missing."
      );

      return;

    }


    if (sortedSteps.length === 0) {

      setRunError(
        "Add at least one workflow step before running."
      );

      return;

    }


    try {

      setRunningWorkflow(true);

      setRunError("");

      setRunResult(null);


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


      setRunResult(result);


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

      setRunningWorkflow(false);

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
            {runResult.status ||
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

      {sortedSteps.length === 0 ? (

        <p>
          No steps added yet.
        </p>

      ) : (

        <div className="workflow-steps">

          {sortedSteps.map(
            (step, index) => (

              <div
                key={step.id}
                className="workflow-step-card"
              >


                {/* ========================================== */}
                {/* STEP HEADER */}
                {/* ========================================== */}

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


                  {/* ======================================== */}
                  {/* ACTIONS */}
                  {/* ======================================== */}

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


                    {/* ====================================== */}
                    {/* DELETE */}
                    {/* ====================================== */}

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


                {/* ========================================== */}
                {/* TYPE */}
                {/* ========================================== */}

                <p>
                  Type:{" "}
                  {STEP_LABELS[
                    step.type
                  ] ||
                    step.type}
                </p>


                {/* ========================================== */}
                {/* CONFIG */}
                {/* ========================================== */}

                <pre>
                  {JSON.stringify(
                    step.config,
                    null,
                    2
                  )}
                </pre>


              </div>

            )
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