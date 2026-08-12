# AI Agent Workflow Builder

A full-stack AI workflow automation platform for building, executing, and monitoring multi-step AI agent workflows.

Users can create workflows composed of different step types, including **LLM steps** and **Human Approval Gates**. Workflows execute step-by-step, pass outputs between steps, pause when human approval is required, and resume automatically after approval.

---

## 🚀 Features

### Workflow Management

- Create workflows
- Edit workflow name and description
- Delete workflows
- Add, edit, and delete workflow steps
- Reorder workflow steps
- View workflow configuration
- View workflow execution status

### AI / LLM Steps

- Execute LLM-powered workflow steps
- OpenRouter integration
- Configurable AI model
- Configurable prompts
- Configurable maximum tokens
- Pass previous step output to the next step
- Store LLM output in the database

### Human Approval

- Add Approval Gate workflow steps
- Pause workflow execution until approval
- Approve workflow steps from the frontend
- Record the approving user
- Record approval timestamp
- Resume workflow execution automatically after approval

### Workflow Execution

- Create workflow runs
- Create individual step runs
- Track step status
- Track workflow status
- Store step inputs and outputs
- Handle workflow failures
- Retry failed steps
- Continue execution from the next step
- Complete the workflow when the final step finishes

### Organization & Authorization

- Organization-based workflows
- Owner / Editor / Viewer roles
- Role-based workflow permissions
- Owner and Editor can execute workflows
- Owner and Editor can approve approval gates
- Viewer access is restricted from modifying workflows
- Organization workflow quota tracking

---

## 🏗️ Architecture

```text
                    ┌─────────────────────┐
                    │      Frontend       │
                    │      React + Vite   │
                    └──────────┬──────────┘
                               │
                            GraphQL
                               │
                               ▼
                    ┌─────────────────────┐
                    │        Nhost        │
                    │                     │
                    │  Auth               │
                    │  Hasura GraphQL     │
                    │  PostgreSQL         │
                    └──────────┬──────────┘
                               │
                         Hasura Actions
                               │
                               ▼
                    ┌─────────────────────┐
                    │       Backend       │
                    │   Serverless APIs   │
                    └──────────┬──────────┘
                               │
                      ┌────────┴────────┐
                      ▼                 ▼
               ┌──────────────┐  ┌──────────────┐
               │   Workflow   │  │  OpenRouter  │
               │   Execution  │  │     LLM      │
               └──────────────┘  └──────────────┘
```

---

## 🔄 Workflow Execution

A workflow can contain multiple steps.

### Example

```text
┌──────────────┐
│   LLM Step   │
└──────┬───────┘
       │
       │ output
       ▼
┌──────────────┐
│   Approval   │
│     Gate     │
└──────┬───────┘
       │
       │ approved
       ▼
┌──────────────┐
│   LLM Step   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   LLM Step   │
└──────┬───────┘
       │
       ▼
   Completed
```

### Step Chaining

The output of a previous step is passed to the next step:

```json
{
  "previous_output": {
    "text": "Previous step output"
  }
}
```

The LLM step can use this output when constructing its prompt.

---

## 🧑‍⚖️ Human Approval Flow

When an Approval Gate is reached:

```text
Workflow Running
       │
       ▼
Approval Gate
       │
       ▼
Workflow Paused
       │
       ▼
User Approves
       │
       ▼
Approval Gate Completed
       │
       ▼
Workflow Resumes
       │
       ▼
Next Step
```

The approval stores:

```json
{
  "approved": true,
  "approved_by": "user-id",
  "approved_at": "timestamp"
}
```

---

## 📊 Workflow Statuses

### Workflow

```text
pending
   ↓
running
   ↓
paused
   ↓
running
   ↓
completed
```

A workflow can also transition to:

```text
failed
```

### Step Run

```text
pending
   ↓
running
   ↓
completed
```

Other possible states include:

- `paused`
- `failed`

---

## 🗄️ Database

The application uses **PostgreSQL through Nhost**.

### Main Tables

- `organizations`
- `org_members`
- `workflows`
- `workflow_steps`
- `workflow_runs`
- `step_runs`
- `workflow_triggers`

### Workflow

Stores workflow-level information.

| Field | Description |
|---|---|
| `id` | Workflow identifier |
| `org_id` | Organization identifier |
| `name` | Workflow name |
| `description` | Workflow description |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

### Workflow Steps

Stores the individual steps belonging to a workflow.

| Field | Description |
|---|---|
| `id` | Step identifier |
| `workflow_id` | Parent workflow |
| `step_order` | Step execution order |
| `name` | Step name |
| `type` | Step type |
| `config` | Step configuration |

### Workflow Runs

Stores each execution of a workflow.

| Field | Description |
|---|---|
| `id` | Workflow run identifier |
| `workflow_id` | Workflow being executed |
| `status` | Current execution status |
| `started_at` | Start timestamp |
| `completed_at` | Completion timestamp |
| `error` | Error information, if any |

### Step Runs

Stores the execution state and output of individual workflow steps.

| Field | Description |
|---|---|
| `id` | Step run identifier |
| `workflow_run_id` | Parent workflow run |
| `workflow_step_id` | Workflow step |
| `status` | Current step status |
| `input` | Step input |
| `output` | Step output |
| `error` | Error information |
| `attempt_count` | Number of execution attempts |
| `approved_by` | Approving user |
| `approved_at` | Approval timestamp |

---

## 🔐 Authentication & Authorization

Authentication is handled through **Nhost Auth**.

Authorization is implemented using organization membership and **Hasura permissions**.

### Supported Organization Roles

- `owner`
- `editor`
- `viewer`

### Permissions

| Action | Owner | Editor | Viewer |
|---|:---:|:---:|:---:|
| View workflows | ✅ | ✅ | ✅ |
| Create workflow | ✅ | ✅ | ❌ |
| Edit workflow | ✅ | ✅ | ❌ |
| Delete workflow | ✅ | ❌ | ❌ |
| Add/edit steps | ✅ | ✅ | ❌ |
| Run workflow | ✅ | ✅ | ❌ |
| Approve workflow | ✅ | ✅ | ❌ |

Authorization is enforced on the backend/database layer rather than relying only on frontend UI restrictions.

---

## 🤖 LLM Integration

LLM steps use **OpenRouter**.

### Example Configuration

```json
{
  "model": "openai/gpt-4o-mini",
  "prompt": "Give me three startup ideas related to AI.",
  "max_tokens": 120
}
```

The backend sends the request to OpenRouter and stores the response as the step output.

### Example Output

```json
{
  "text": "Here are three startup ideas related to AI...",
  "model": "openai/gpt-4o-mini"
}
```

---

## 🛠️ Tech Stack

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- Node.js
- Serverless Functions
- GraphQL

### Database / Backend Platform

- Nhost
- Hasura
- PostgreSQL

### AI

- OpenRouter
- OpenAI-compatible LLM APIs

### Authentication

- Nhost Auth

### Deployment

- Netlify

---

## 📁 Project Structure

A simplified structure:

```text
AI-Agent-Workflow-Builder/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── graphql.js
│   │   ├── nhost.js
│   │   └── ...
│   │
│   └── package.json
│
├── netlify/
│   └── functions/
│       ├── triggerWorkflowRun.js
│       ├── approveStep.js
│       └── lib/
│           ├── graphql.js
│           ├── workflow.js
│           ├── executeWorkflowStep.js
│           └── llm.js
│
├── package.json
└── README.md
```

> The exact directory structure may differ depending on the repository layout.

---

## ⚙️ Environment Variables

The backend requires the following environment variables:

```env
NHOST_GRAPHQL_URL=your_nhost_graphql_url
NHOST_ADMIN_SECRET=your_nhost_admin_secret
OPENROUTER_API_KEY=your_openrouter_api_key
```

### ⚠️ Important

Never commit secrets such as:

```text
NHOST_ADMIN_SECRET
OPENROUTER_API_KEY
```

to GitHub.

Use environment variables during local development and configure them securely in deployment platforms such as Netlify.

---

## 💻 Local Development

### 1. Clone the Repository

```bash
git clone https://github.com/adishkt/AI-Agent-Workflow-Builder.git
cd AI-Agent-Workflow-Builder
```

### 2. Install Dependencies

If the project is configured from the repository root:

```bash
npm install
```

If the frontend is inside a subdirectory:

```bash
cd frontend
npm install
```

### 3. Configure Environment Variables

Create an appropriate `.env` file and configure:

```env
NHOST_GRAPHQL_URL=
NHOST_ADMIN_SECRET=
OPENROUTER_API_KEY=
```

### 4. Start the Development Server

```bash
npm run dev
```

The application will be available through the Vite development server.

---

## ▶️ Example Workflow

Create a workflow such as:

### AI Startup Generator

**Step 1 — LLM**

Prompt:

```text
Give me three startup ideas related to AI.
```

↓

**Step 2 — Approval Gate**

Message:

```text
Please approve this workflow before continuing.
```

↓

**Step 3 — LLM**

Prompt:

```text
Write a short product description for the startup selected
in the previous output.
```

↓

**Completed**

The second LLM receives the output generated by the first LLM.

---

## 🔁 Retry & Failure Handling

Workflow execution includes failure handling and retry support.

```text
Step Execution
      │
      ├── Success ──→ Next Step
      │
      └── Failure
            │
            ▼
          Retry
            │
       ┌────┴────┐
       │         │
    Success    Failure
       │         │
       ▼         ▼
  Next Step  Workflow Failed
```

Step attempts are tracked using:

```text
attempt_count
```

Errors are stored in both step runs and workflow runs when appropriate.

---

## 📈 Quota Management

Organizations have workflow execution quotas.

The organization stores:

```text
quota_limit
quota_used
```

Before starting a workflow, the backend checks whether the organization's quota has been exhausted.

After successful workflow completion, the organization's usage is incremented.

---

## 🔒 Security Considerations

The application follows several security principles:

- Authentication is required for workflow operations.
- Organization membership is verified before workflow execution.
- User roles are checked before privileged operations.
- Admin secrets are kept on the backend.
- OpenRouter API keys are never exposed to the frontend.
- Hasura permissions provide database-level authorization.
- Workflow ownership is validated before execution.
- Viewer users cannot perform privileged workflow operations.

---

## 🧪 Tested Workflow

The complete execution flow has been tested successfully:

```text
LLM Step
   ↓
Human Approval Gate
   ↓
Approval
   ↓
Next Step
   ↓
LLM Execution
   ↓
Final Step
   ↓
Workflow Completed
```

### Verified Functionality

- ✅ Workflow creation
- ✅ Workflow execution
- ✅ LLM execution
- ✅ Step-to-step output chaining
- ✅ Approval Gate pause
- ✅ Human approval
- ✅ Workflow resume
- ✅ Next step creation
- ✅ Step output persistence
- ✅ Final workflow completion
- ✅ Workflow run tracking
- ✅ Error handling
- ✅ Role-based access control

---

## 🚀 Deployment

The frontend can be deployed using **Netlify**.

When deploying, make sure the correct project directory is configured as the **Base directory** if the frontend is not located at the repository root.

Configure all required environment variables in the deployment platform.

---

## 🔮 Future Improvements

Possible future improvements include:

- Visual drag-and-drop workflow editor
- More workflow step types
- Conditional branching
- Webhook triggers
- Scheduled workflow execution
- Email / Slack notification steps
- Workflow templates
- Execution logs
- Real-time workflow monitoring
- More advanced retry policies
- Workflow versioning
- Usage analytics
- Team invitations and organization management

---

## 👨‍💻 Author

**Adish K T**

Computer Science & Engineering

**GitHub:**  
https://github.com/adishkt

---

## 📄 License

This project was developed as a full-stack AI workflow automation project demonstrating:

- React frontend development
- Node.js backend development
- GraphQL
- PostgreSQL
- Authentication and authorization
- AI / LLM integration
- Workflow orchestration
- Human-in-the-loop execution
- Serverless deployment
