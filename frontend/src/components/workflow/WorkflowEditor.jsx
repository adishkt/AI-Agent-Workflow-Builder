import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  deleteWorkflowStep,
  getCurrentUserRole,
  reorderWorkflowSteps,
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
  // SAFETY CHECK
  // ==========================================================

  if (!workflow) {
    return (
      <section className="workflow-editor">
        <p>Loading workflow...</p>
      </section>
    );
  }


  // ==========================================================
  // STEPS
  // ==========================================================

  const [steps, setSteps] = useState(
    [...(workflow.workflow_steps || [])].sort(
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
  // LOAD ROLE
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
  // CREATE / UPDATE STEP
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
  // EDIT
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
  // DELETE
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


      // Remove deleted step
      // and renumber locally

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


      // Persist new ordering
      // to Hasura

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
  // MOVE UP
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

      setSteps(reordered);


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


      // Restore previous order

      setSteps(
        sortedSteps
      );

    }

  };


  // ==========================================================
  // MOVE DOWN
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

      setSteps(reordered);


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

        </div>

      </div>


      <hr />


      {/* ==================================================== */}
      {/* ERROR */}
      {/* ==================================================== */}

      {error && (

        <p className="error">
          {error}
        </p>

      )}


      {/* ==================================================== */}
      {/* STEP TITLE */}
      {/* ==================================================== */}

      <div className="workflow-editor-title">

        <h3>
          Workflow Steps
        </h3>


        {canEdit && !roleLoading && (

          <button
            type="button"
            onClick={() => {

              setEditingStep(null);

              setShowStepForm(true);

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
                {/* HEADER */}
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
                            index === 0
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


                {/* ========================================== */}
                {/* CONFIG */}
                {/* ========================================== */}

                <p>
                  Type:{" "}
                  {STEP_LABELS[
                    step.type
                  ] ||
                    step.type}
                </p>


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

            editingStep={null}

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