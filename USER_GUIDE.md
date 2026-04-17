# BTW Recruitment — User Guide (How to use)

This guide explains **how recruiters/managers should operate** BTW Recruitment day-to-day: the **flow**, the **validations** you will hit, and the **automation** you should expect.

You will mostly work across these screens:

1. `**Customer`**: client master + commercial/replacement fields that drive billing and policy rules
2. `**DKP_Job_Opening**`: a role requirement + the candidate pipeline table for that role
3. `**DKP_Candidate**`: candidate profile database (resume parsing lives here)
4. `**DKP_Interview**`: one candidate’s interview journey for one opening (rounds + final outcome)
5. `**DKP_Joining_Tracker**`: billing tracking when someone **Joins**
6. `**Sales Invoice`**: accounting document, created from Joining Tracker with a link back to it

---

## Golden path (recommended order)

### A) Setup the client (`Customer`)

Fill the fields your process relies on (at minimum, whatever your accounts team needs). The recruitment automation specifically cares about:

- **Replacement policy days** (`custom_replacement_policy_`)
- **No‑poach flag** (`custom_no_poach_flag`)
- **Standard fee %** (`custom_standard_fee_value`) used to compute billing amounts on Joining Tracker
- **GSTIN** (`custom_gstin`) copied into Joining Tracker

### B) Create the opening (`DKP_Job_Opening`)

Create the opening linked to the client (`company_name` → `Customer`).

### C) Build / find candidates (`DKP_Candidate`)

Create candidates manually or upload resumes.

### D) Map candidates to the opening (3 ways)

Pick whichever matches your workflow:

1. **Directly on the opening** (candidate child table)
2. **Suggest Candidates** (matching assistant)
3. **Candidate list bulk action**: **Add to openings**

### E) Move pipeline to interviews only when the opening row is ready, use **Create Interview** (see validation rules below).

### F) Run interviews (`DKP_Interview`)

Add rounds, update outcome stage as the process progresses.

### G) Close the hire (`Joined` → Joining Tracker)

When stage becomes **Joined**, the system creates/updates **Joining Tracker** (if required fields exist).

### H) Invoice (`Sales Invoice`)

From Joining Tracker, use **Create Sales Invoice** to start invoicing with the tracker link prefilled.

---

## `DKP_Job_Opening` — how to use + what will block you

### Map candidates on the opening (manual rows)

**What you do**

- Add rows in the opening’s candidate table and choose `candidate_name`.

**Validations**


| Situation                                         | Result                                                |
| ------------------------------------------------- | ----------------------------------------------------- |
| Same candidate added twice on the same opening    | **Blocked** (duplicate row)                           |
| Candidate is blacklisted (`blacklisted = Yes`)    | **Blocked**                                           |
| Candidate’s current employer customer is no‑poach | **Warning** (may still allow; follow internal policy) |


### Suggest Candidates (matching assistant)

**What you do**

- Click **Suggest Candidates** on the opening.
- Use filters if needed, select candidates, add them to the opening.

**Rules (important)**

- If **Must Have Skills** and **Designation** are both empty → you should expect **no suggestions**.
- If **Must Have Skills** exist → a candidate must match **at least one** must-have skill token.
- Candidate must match **skills OR designation** to remain eligible.
- Blacklisted candidates won’t appear.
- No‑poach candidates may be highlighted.
- You get **top 20** matches by score.

**Extra UX features in the suggestion dialog**

- Filters (match %, hide no‑poach, gender/age/CTC, search)
- **Previous openings** review before adding (risk/context check)

### Create Interview (from opening candidate row)

**What you do**

- Use the **Create Interview** action on the candidate row.

**Validations**


| Rule                                                  | Result                                    |
| ----------------------------------------------------- | ----------------------------------------- |
| Candidate not selected                                | **Blocked**                               |
| Row stage is not exactly `**Schedule Interview`**     | **Blocked**                               |
| Interview already exists for same opening + candidate | Opens the **existing** interview (dedupe) |


### Dangerous operation (please read)

If you **remove** a candidate row from an opening and that row had an interview linked, the system may **delete** the interview record.

---

## `DKP_Candidate` — how to use + what will block you

### Resume upload (AI parsing)

**What you do**

- Attach `resume_attachment`.

**What happens**

- The form saves, then the system extracts text and runs AI parsing.
- Fields get filled; `resume_parsed` becomes checked; you get a **confidence score**.
- The system may attempt a **rename** after parsing.

**Common failures**

- Unreadable file / protected PDF / server missing AI key configuration
- Confidence too low (**below 40%**) → parsing rejected

**After parsing**

- Some fields may be highlighted to remind you to confirm missing information manually.

### Duplicate candidates

**Rule**

- You cannot save a candidate if **email OR mobile** matches another candidate.

### Bulk add to openings (Candidate list)

**What you do**

- Open Candidate list → select checkboxes → **Add to openings** → pick opening.

**What happens**

- Candidates get appended to the opening’s candidate table.
- Already-mapped candidates are skipped and reported.

---

## `DKP_Interview` — how to use + what will block you

### Stage rules that users hit often


| Stage             | Requirements                                                                       |
| ----------------- | ---------------------------------------------------------------------------------- |
| `Joined And Left` | Joining date required, left date required, left date cannot be before joining date |
| `Joined`          | If joining date missing, you’ll get a reminder (non-blocking alert)                |


### What the system keeps in sync

- Interview links back to the opening candidate row (`interview` field)
- Interview stage mirrors into opening candidate row (`sub_stages_interview`)

### Job opening auto status

Unless the opening is `**On Hold`** or `**Closed – Cancelled**`, the system may auto-set:

- `**Closed – Hired**` when joined headcount meets positions **and** there are **no pending replacements**
- Otherwise it may revert `**Closed – Hired`** back to `**Open**` if conditions change

### Replacement tracking (high level)

- If someone becomes **Joined And Left**, replacement history may become **Pending** or **Not Required** based on policy days.
- Replacement completion flows exist when `is_replacement_for` is used (replacement hire closes the loop).

### Joining Tracker creation (billing)

When stage becomes **Joined**:

- Joining Tracker is created/updated **only if** `joining_date` and `offered_amount` exist.
- Billing value uses: `billing_value = offered_amount * (fee% / 100)` from the client’s `custom_standard_fee_value`.

When stage becomes **Joined And Left** (and tracker exists):

- Tracker updates status/left date and sends an accounts notification email (as implemented).

### Freezes (why the form suddenly won’t edit)


| Freeze                                     | What it means for users                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Joining Tracker billing is **Bill Sent**   | Very limited edits; typically only **Joined → Joined And Left** transition is allowed; many fields/rounds become read-only |
| Replacement policy window ended after join | Interview can become **fully frozen**                                                                                      |


---

## `DKP_Joining_Tracker` — how to use

### What it represents

A **billing tracking** record tied to a join. Practically: “this candidate joined this client role—here is the billable CTC, fee %, computed billing value, billing status.”

### Freezes

Under certain replacement-policy conditions, the tracker can become read-only in the UI.

---

## `Sales Invoice` — how to use (from recruitment)

### Create from Joining Tracker

**What you do**

- Open Joining Tracker → click **Create Sales Invoice**.

**What you get**

- A new `Sales Invoice` with:
  - `customer` prefilled from tracker
  - `custom_joining_tracker_link` set to the tracker

**Guard**

- Tracker must have `company_name`.

---

## Feature list (product capabilities)

- **AI resume parsing** on candidate resume upload (with confidence scoring)
- **Candidate dedupe** by email/phone
- **Candidate list bulk mapping** to openings
- **Suggest Candidates** matching assistant with filters + previous-opening context UX
- **Interview creation guardrails** tied to pipeline stage
- **Interview ↔ opening sync** (interview link + stage mirroring)
- **Auto job opening closure logic** based on joins + pending replacements
- **Replacement history tracking** for early attrition cases
- **Joining tracker auto-create/update** on join + accounts email on leave (as implemented)
- **Billing locks / policy freezes** to protect accounting integrity
- **Sales invoice shortcut** with tracker linkage custom field

