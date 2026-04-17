# BTW Recruitment — Business Logic & Flow Documentation

Scope: **Customer → Opening → Candidate → Interview → Joining Tracker → Sales Invoice**

This document is the **technical/process spec**: what the system enforces, what it automates, and how objects link together.

---

## Table of contents

- [1. End-to-end flow (happy path)](#1-end-to-end-flow-happy-path)
- [2. Data model (key doctypes & links)](#2-data-model-key-doctypes--links)
- [3. Customer (ERPNext `Customer`) — custom fields used](#3-customer-erpnext-customer--custom-fields-used)
- [4. Opening — `DKP_Job_Opening`](#4-opening--dkp_job_opening)
- [5. Candidate — `DKP_Candidate`](#5-candidate--dkp_candidate)
- [6. Interview — `DKP_Interview`](#6-interview--dkp_interview)
- [7. Joining Tracker — `DKP_Joining_Tracker`](#7-joining-tracker--dkp_joining_tracker)
- [8. Sales Invoice — linkage to Joining Tracker](#8-sales-invoice--linkage-to-joining-tracker)
- [9. “Custom behaviors index” (quick scan)](#9-custom-behaviors-index-quick-scan)

---

## 1. End-to-end flow (happy path)

- **Customer** (standard ERPNext `Customer`) is created/maintained with custom fields like:
  - **Replacement policy days**
  - **No-poach flag**
  - **Standard fee % (billing fee)**
- **Opening** (`DKP_Job_Opening`) is created against a `Customer` via `company_name` (Link to `Customer`).
- **Candidates** (`DKP_Candidate`) are created (manually or by uploading resume).
  - Uploading **`resume_attachment`** triggers **AI resume parsing** and populates candidate fields.
- Candidate ↔ Opening mapping happens in two ways:
  - **From Candidate list view**: multi-select candidates → **Add to openings** dialog → select Opening → candidates added to opening child table.
  - **From Opening form**: click **Suggest Candidates** → scoring-based suggestions → select candidates → add into opening child table (with “previous openings” review).
- **Interview** (`DKP_Interview`) is created from Opening’s candidates child table using a **“Create Interview”** action (allowed only in a specific stage).
  - Interview stage updates are synced back into Opening’s candidate row.
  - Interview rounds (child table) can trigger interview emails.
- When Interview stage becomes **Joined**:
  - System creates/updates **Joining Tracker** (`DKP_Joining_Tracker`) and links it back to Interview.
  - Job Opening status may be auto-evaluated (e.g. auto close when all positions joined and no pending replacements).
- From **Joining Tracker**, user can click **Create Sales Invoice**, which opens a new `Sales Invoice` prefilled with:
  - `customer = company_name`
  - `custom_joining_tracker_link = joining_tracker_id`

---

## 2. Data model (key doctypes & links)

### Core objects

- **Customer** (ERPNext doctype)
  - Has **custom fields** (fixtures) used in logic (billing fee %, no-poach flag, replacement policy, etc.).
- **Opening**: `DKP_Job_Opening`
  - `company_name` → Link to **`Customer`**
  - Contains child table: `candidates_table` (`DKP_JobApplication_Child`)
  - Has replacement history table: `replacement_history` (`DKP_Replacement_Log`)
- **Candidate**: `DKP_Candidate`
  - `current_company_master` → Link to **`Customer`** (used for no-poach checks)
  - Contains child table: `table_gcbt` (`DKP_Candidate_Openings_Child`) which mirrors “Tagged Openings”
- **Interview**: `DKP_Interview`
  - `job_opening` → Link to `DKP_Job_Opening`
  - `candidate_name` → Link to `DKP_Candidate`
  - Child table: `interview_child_table` (`DKP_Interview_Child`) for interview rounds/schedule
  - `invoice_ref` → Link to `DKP_Joining_Tracker`
  - Replacement fields: `is_replacement_for`, `days_before_left`, `within_replacement_policy`, `replacement_policy_days`
- **Joining Tracker**: `DKP_Joining_Tracker`
  - `interview_ref` → Link to `DKP_Interview` (and **Joining Tracker name is forced to `interview_ref`**)
  - `job_opening` → Link to `DKP_Job_Opening`
  - `company_name` → Link to `Customer`
  - `billing_status` (Yet to Bill / Bill Sent / Payment Received)
  - Used as the “billing anchor” to create Sales Invoice

---

## 3. Customer (ERPNext `Customer`) — custom fields used

Custom fields are shipped via `fixtures/custom_field.json`.

### Fields used in recruitment logic

- **No-poach flag**: `custom_no_poach_flag`
  - Used to tag/warn candidates currently employed at a no-poach customer.
- **Replacement policy days**: `custom_replacement_policy_`
  - Used for:
    - Replacement tracking (Joined → Joined And Left)
    - Freeze windows (after replacement window ends)
- **Standard fee value (%)**: `custom_standard_fee_value`
  - Used to compute Joining Tracker `billing_value` from offered CTC.
- **GSTIN**: `custom_gstin`
  - Copied into Joining Tracker.

---

## 4. Opening — `DKP_Job_Opening`

### 4.1 Non-default behaviors

#### A) “Suggest Candidates” button (Opening form)

- **Trigger**: user clicks `Suggest Candidates` button.
- **Backend scorer**: `get_matching_candidates(job_opening_name, existing_candidates)`
- **Eligibility gates (strict)**
  - If both Opening’s **Must Have Skills** and **Designation** are empty → **no candidates shown**.
  - If Must Have Skills are present → candidate must match **at least one** must-have skill, otherwise excluded.
  - Candidate must match **skills OR designation**, otherwise excluded.
- **Blacklisted candidates excluded**
  - Candidates with `blacklisted = "Yes"` are excluded.
- **No-poach signal**
  - If candidate has `current_company_master` set and that `Customer.custom_no_poach_flag == "Yes"`, the candidate is returned with:
    - `is_no_poach = true`
    - `no_poach_company = <customer label>`
  - UI highlights these candidates and allows warnings.
- **Result limiting**
  - Candidates are scored and sorted by `match_score` descending.
  - Top 20 are returned.

#### B) Suggested candidates dialog (Opening form)

The dialog supports:

- Persistent selection across pagination (checkbox selection map).
- Filters:
  - Search by name/skills
  - Minimum match score %
  - Hide no-poach
  - Gender filter
  - Age range
  - Expected CTC range
- “Previous Openings” drilldown per candidate + bulk “previous openings” check before adding.

#### C) “Create Interview” action in Opening → candidates child table

- **Guard**:
  - Candidate must be selected
  - Candidate row stage must be exactly **`Schedule Interview`**
- **Dedup**: if an interview already exists for same `(job_opening, candidate_name)`, it routes to that existing interview, otherwise opens a new interview with prefilled fields.

#### D) Candidate child row addition validations (Opening form)

When manually selecting `candidate_name` inside Opening child row:

- Prevents duplicate candidate rows in same opening.
- Blocks adding candidate if candidate is blacklisted (`DKP_Candidate.blacklisted == "Yes"`).
- If candidate’s current company has no-poach flag:
  - Shows warning but **does not block** adding.

### 4.2 Automation on Opening save/update

#### A) Auto `added_by` on new candidate mapping rows

On Opening `before_save`, for each new row in candidates table:

- if row is new and `added_by` is empty → set to `frappe.session.user`.

#### B) “Tagged Openings” sync into Candidate

On Opening `on_update`:

- Runs `sync_candidate_openings()`:
  - Mirrors Opening’s `candidates_table` into each candidate’s `table_gcbt` (child table `DKP_Candidate_Openings_Child`)
  - Adds/updates/removes rows to match Opening mapping.
  - Also stores context fields into candidate opening row:
    - opening status, company, designation, location, mapping stage, interview stage, remarks, interview ref, etc.

#### C) Delete interviews when candidate mapping row is removed

On Opening `before_save`, `delete_interviews_for_removed_candidates()`:

- If an old mapping row had `interview` linked and the row is removed → deletes the linked `DKP_Interview`.

#### D) Email notifications on Opening update

On Opening `on_update`, `send_change_notification_email()`:

- Compares old doc vs new doc (main fields, recruiter list, candidate table changes).
- Sends email to assigned recruiters only if **actual changes** exist.

#### E) Mark company active on save

After save (client-side), if `company_name` exists:

- Calls `company_rules.mark_company_active(company)`

---

## 5. Candidate — `DKP_Candidate`

### 5.1 Validations (server-side)

#### Duplicate prevention

On `validate()`:

- Prevent duplicate candidate by **email OR mobile number**.
- If another candidate exists with same email or phone → throws error.

### 5.2 Non-default behaviors (UI + automation)

#### A) Resume parsing via AI (on resume attachment upload)

- **Trigger**: Candidate field `resume_attachment` is set.
- **Flow**
  - Form saves the candidate.
  - Calls server method: `resume_parser.process_resume(docname)`
  - If parsing succeeds:
    - Populates fields like name/email/phone/location/experience/skills/qualification/languages etc.
    - Sets:
      - `resume_parsed = 1`
      - `confidence_score = <calculated %>`
  - After parse, calls: `naming.rename_candidate_after_parse(docname)`:
    - If renamed → routes user to new docname.
    - Else reloads.
- **Text extraction supports**
  - PDF (text layer or OCR with PyMuPDF + EasyOCR)
  - DOCX (Mammoth)
  - Images (EasyOCR)
  - TXT
  - ZIP (extract first readable file)
- **LLM provider**
  - Uses **Anthropic** client; expects `ANTHROPIC_API_KEY` (or site config).
- **Confidence threshold**
  - If confidence score < 40% → parsing is rejected (error).
- **List flattening**
  - skills/certifications/languages/institute arrays are flattened into comma-separated strings before mapping.

#### B) Candidate “required manual fields” highlighting

On form refresh:

- A list of fields is highlighted (red border + light red background) when empty, to force manual review/completion after parsing.

#### C) Candidate list view — “Add to openings” (bulk)

From Candidate list view:

- User selects multiple candidates using list checkboxes.
- Clicks **Add to openings** inner button.
- A custom dialog opens to select an Opening:
  - Includes client-side filters:
    - Search (name/designation/company/department)
    - Status
    - Priority
    - Department
    - Company (datalist)
  - Fetches Opening list from server: `candidate_openings.get_job_openings_for_candidate_dialog(...)`
  - On selection, candidates are appended to Opening’s `candidates_table` and saved.
  - Skips candidates already in the opening and reports them.

---

## 6. Interview — `DKP_Interview`

### 6.1 Naming (non-default)

`autoname()`:

- If `job_opening` + `candidate_name` present:
  - Builds name: `<Company> - <Candidate Display Name>`
  - If conflict exists → appends `-.##`
- Else falls back to `INT-.#####`

### 6.2 Key validations and stage-specific guards

#### A) Joined / Joined And Left date validation

- If stage == **Joined And Left**:
  - `joining_date` mandatory
  - `candidate_left_date` mandatory
  - `candidate_left_date` cannot be before `joining_date`
- If stage == **Joined** and joining date missing:
  - Shows alert to fill joining date (non-blocking msgprint)

### 6.3 Automation and sync

#### A) Link Interview back to Opening mapping row

After interview insert:

- Updates Opening’s child table row (`DKP_JobApplication_Child`) for that candidate:
  - sets `interview = <this interview name>`
- Syncs stage to opening (interview stage mirrored).

#### B) Sync interview stage back to Opening mapping row

On interview updates:

- Sets `DKP_JobApplication_Child.sub_stages_interview = interview.stage` (always, even blank).
- Triggers Opening status evaluation logic (see below).

#### C) Job Opening auto status evaluation

When interview stage changes, it evaluates Opening status unless Opening is manually set to:

- `On Hold`
- `Closed – Cancelled`

Decision:

- `joined_count = count(child rows where sub_stages_interview == "Joined")`
- `pending_replacements = count(replacement log rows where status == "Pending")`
- If `joined_count >= number_of_positions` AND `pending_replacements == 0` → set opening status to `Closed – Hired`
- Else if opening status is `Closed – Hired` but conditions no longer hold → revert to `Open`

#### D) Replacement tracking & replacement history

When interview stage transitions:

- On **Joined And Left**:
  - Computes days worked = date diff (left - join)
  - Checks replacement policy days from `Customer.custom_replacement_policy_`
  - Writes into interview:
    - `days_before_left`, `within_replacement_policy`, `replacement_policy_days`
  - Writes/updates row in Opening’s `replacement_history` (`DKP_Replacement_Log`)
    - status becomes **Pending** if within policy else **Not Required**
- On **Joined** for a replacement candidate (when `is_replacement_for` is set):
  - Marks the corresponding pending replacement log row as **Replaced** and stores replacement refs.
- Updates counters on opening:
  - `pending_replacements`, `total_replacements`

#### E) Joining Tracker auto-create/update (billing anchor)

When interview stage == **Joined**:

- Creates or updates `DKP_Joining_Tracker` record linked by `interview_ref`.
- Preconditions to create new:
  - `joining_date` must be set
  - `offered_amount` must be set
- Computes billing:
  - `fee_percentage = Customer.custom_standard_fee_value`
  - `billing_value = offered_amount * fee_percentage / 100`
  - `billing_month = <Month Year from joining_date>`
- Prefills recipient contact:
  - Finds billing contact/primary contact linked to Customer via `Contact` + `Dynamic Link`.
- Links back:
  - sets `DKP_Interview.invoice_ref = joining_tracker_name`

When stage == **Joined And Left** and `invoice_ref` exists:

- Updates joining tracker:
  - `status = "Joined And Left"`
  - `candidate_left_date` if provided
- Sends email to accounts (hardcoded) informing candidate left + invoice ref.

### 6.4 Freeze logic (non-default)

The Interview document is conditionally frozen under two scenarios:

#### A) Freeze due to “Bill Sent” (Joining Tracker)

If there exists a `DKP_Joining_Tracker` for this interview and:

- `billing_status == "Bill Sent"`

Then:

- Allowed stage transitions: **Joined → Joined And Left** only
- Blocked edits:
  - core identity fields (`candidate_name`, `job_opening`, `added_by`)
  - billing fields (`joining_date`, `offered_amount`, `remarks_for_invoice`, `invoice_ref`)
  - interview rounds child table modifications

Client-side UX:

- Protected fields become read-only
- `stage` options are restricted to only:
  - `Joined`
  - `Joined And Left`
- Interview child table becomes read-only with add/delete disabled.

#### B) Full freeze after replacement policy window ends

If:

- stage == `Joined`
- replacement policy days are defined on company (`Customer.custom_replacement_policy_`)
- today > joining_date + replacement_policy_days

Then:

- Interview becomes fully frozen (no changes allowed).

Client-side UX:

- Form is disabled, save disabled, banner comment shows freeze message.

---

## 7. Joining Tracker — `DKP_Joining_Tracker`

Joining Tracker acts as the **billing tracking record** per successful join, and is anchored 1:1 with an Interview.

### 7.1 Naming (non-default)

- `autoname()` forces:
  - `name = interview_ref`
- If `interview_ref` missing, the document cannot be created.

### 7.2 Lifecycle / fields populated

Created/updated primarily from `DKP_Interview` when stage becomes **Joined**.

Typical population includes:

- Company & opening context:
  - `company_name`, `job_opening`, `designation`, `hiring_location`
- Candidate context:
  - `candidate_name` (ID), `candidate_contact`
- Billing:
  - `billable_ctc` (stringified offered amount)
  - `billing_fee` (percentage from `Customer.custom_standard_fee_value`)
  - `billing_value` (computed)
  - `billing_month` (Month Year of joining date)
  - `billing_status` defaults to **Yet to Bill**
- Recipient info (from Customer contacts):
  - `recipients_name`, `recipients_mail_id`, `recipients_number`

### 7.3 Delete behavior (non-default)

On `on_trash()`:

- If it has `interview_ref`, it clears `DKP_Interview.invoice_ref` to prevent stale linking.

### 7.4 Freeze logic (non-default)

Joining Tracker becomes fully frozen if:

- replacement policy days exist on `Customer.custom_replacement_policy_`
- today > joining_date + replacement_policy_days
- AND Interview stage is **not** `Joined And Left` (if candidate left, freeze is not applied)

Client-side UX:

- Form + save disabled
- Red freeze banner shown on dashboard

---

## 8. Sales Invoice — linkage to Joining Tracker

### 8.1 Custom field on Sales Invoice

Custom field shipped:

- `Sales Invoice.custom_joining_tracker_link` (Link to `DKP_Joining_Tracker`)

This is used to keep a trace from invoicing back to the recruitment join event.

### 8.2 Create Sales Invoice button (Joining Tracker form)

On Joining Tracker refresh (for existing docs):

- Adds custom button: **Create Sales Invoice**
- Action:
  - Opens `frappe.new_doc("Sales Invoice", { customer, custom_joining_tracker_link })`
  - Shows success alert

Guard:

- `company_name` must be present.

---

## 9. “Custom behaviors index” (quick scan)

Use this section for fast scanning.

### Candidate (`DKP_Candidate`)

- **AI Resume parsing on upload** (`resume_attachment`)
  - Extracts text (PDF/DOCX/images/TXT/ZIP) + parses using Anthropic
  - Writes structured data to candidate fields + sets confidence score + marks parsed
  - Post-step rename attempt via `rename_candidate_after_parse`
- **Listview bulk action: “Add to openings”**
  - Multi-select candidates → pick opening in custom dialog → candidates added to opening table
- **Duplicate prevention**
  - Blocks duplicates by email/phone on validate
- **Age auto-calc**
  - `date_of_birth` updates `age`

### Opening (`DKP_Job_Opening`)

- **Suggest Candidates**
  - Strict gates (must-have skills/designation)
  - Match scoring (skills, designation, exp, certs, location, gender, CTC)
  - No-poach highlighting + optional hiding
  - “Previous openings” drilldown for risk context
- **Mapping validations**
  - Prevent duplicates in same opening
  - Block blacklisted candidates
  - Warn on no-poach (allowed)
- **Interview creation guard**
  - Only when child-row stage == `Schedule Interview`
- **Sync “Tagged Openings” into Candidate**
  - Mirror opening mapping into candidate’s `table_gcbt`
- **Interview auto-delete on mapping removal**
  - Remove candidate row → deletes linked interview (if any)
- **Change email notifications**
  - Emails assigned recruiters only when actual changes exist

### Interview (`DKP_Interview`)

- **Autonaming**: `<Company> - <Candidate>`
- **Stage sync back to Opening** (`sub_stages_interview`)
- **Auto job opening status evaluate**
  - Close to “Closed – Hired” when joins >= positions and no pending replacements
- **Replacement tracking**
  - Joined And Left → replacement history entry (Pending/Not required)
  - Replacement joined → marks Replaced
- **Joining Tracker auto create/update**
  - On Joined creates/updates billing tracker and links it back
- **Freeze rules**
  - Bill Sent: only allow Joined → Joined And Left (read-only restrictions)
  - Policy ended: full freeze

### Joining Tracker (`DKP_Joining_Tracker`)

- **Name forced to interview ref**
- **Freeze after replacement policy end**
- **Create Sales Invoice button**
  - Prefills `customer` + links tracker via custom field
