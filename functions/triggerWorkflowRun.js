export default (req, res) => {
  res.status(200).json({
    success: true,
    message: "triggerWorkflowRun is working",
    workflow_id: req.body?.workflow_id ?? null,
  });
};
