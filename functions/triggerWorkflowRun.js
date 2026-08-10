import type { Request, Response } from "express";

export default (req: Request, res: Response) => {
  const workflowId = req.body?.input?.workflow_id ?? null;

  res.status(200).json({
    success: true,
    message: "triggerWorkflowRun is working",
    workflow_id: workflowId,
  });
};