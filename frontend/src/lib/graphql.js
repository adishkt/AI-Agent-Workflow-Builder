import { nhost } from "./nhost";

export async function getWorkflows() {
  const response = await nhost.graphql.request({
    query: `
      query GetWorkflows {
        workflows(
          order_by: {
            created_at: desc
          }
        ) {
          id
          org_id
          name
          description
          created_at
          updated_at
          workflow_steps(
            order_by: {
              step_order: asc
            }
          ) {
            id
            step_order
            name
            type
            config
          }
        }
      }
    `,
  });

  if (response.error) {
    throw new Error(
      response.error.message || "Failed to load workflows"
    );
  }

  return response.body?.data?.workflows || [];
}
