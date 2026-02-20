frappe.pages['joining-tracker'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Joining Tracker',
        single_column: true
    });

    // Render HTML template
    $(frappe.render_template("joining_tracker", {})).appendTo(page.body);

    const from_control = frappe.ui.form.make_control({
        parent: page.body.find(".jt-filter-from"),
        df: { fieldtype: "Date", label: "Joining From", change() { load_dashboard(); } },
        render_input: true
    });

    const to_control = frappe.ui.form.make_control({
        parent: page.body.find(".jt-filter-to"),
        df: { fieldtype: "Date", label: "Joining To", change() { load_dashboard(); } },
        render_input: true
    });

    page.body.on("click", ".jt-clear-btn", function () {
        from_control.set_value(null);
        to_control.set_value(null);
        reset_dashboard();
    });

    function load_dashboard() {
        const from_date = from_control.get_value();
        const to_date = to_control.get_value();

        frappe.call({
            // ⚠️ UPDATE PATH
            method: "btw_recruitment.btw_recruitment.api.joining_tracker_dashboard.get_joining_tracker_dashboard",
            args: { from_date, to_date },
            callback: function (r) {
                if (!r.message) return;
                render_summary(r.message.summary);
                render_table(r.message.rows);
            }
        });
    }

    function reset_dashboard() {
        render_summary({});
        render_table([]);
    }

    function fmtInt(val) { return Number(val || 0).toLocaleString("en-IN"); }
    function fmtCurr(val) { return "₹ " + Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }); }

    function render_summary(s) {
        $("#kpi-total-count").text(fmtInt(s.total_count));
        $("#kpi-yet-count").text(fmtInt(s.yet_to_bill_count));
        $("#kpi-yet-value").text(fmtCurr(s.yet_to_bill_value));
        $("#kpi-sent-count").text(fmtInt(s.bill_sent_count));
        $("#kpi-sent-value").text(fmtCurr(s.bill_sent_value));
        $("#kpi-paid-count").text(fmtInt(s.paid_count));
        $("#kpi-paid-value").text(fmtCurr(s.paid_value));
    }

    function render_table(rows) {
        $("#jt-table").empty();

        // 🟢 ALL columns added 
        const columns = [
            { 
                name: "Tracker ID", 
                width: 160, 
                // 🟢 Made it a highly visible blue clickable link
                format: (v) => v ? `<a href="/app/dkp_joining_tracker/${v}" target="_blank" style="color: #2490ef; font-weight: bold; text-decoration: underline;">${v}</a>` : "-" 
            },
            { name: "Company", width: 180 },
            { name: "Job Opening", width: 150 },
            { name: "Candidate Name", width: 160 },
            { name: "Candidate Contact", width: 130 },
            { name: "Designation", width: 140 },
            { name: "Hiring Location", width: 130 },
            { name: "Joining Date", width: 110 },
            { name: "Status", width: 100 },
            { name: "Billable CTC", width: 120, format: (v) => fmtCurr(v) },
            { name: "Billing Value", width: 120, format: (v) => fmtCurr(v) },
            { name: "Billing Fee %", width: 100 },
            { name: "Billing Month", width: 110 },
            { 
                name: "Billing Status", 
                width: 140,
                format: (v) => {
                    if (!v) return "-";
                    let cls = "status-yet";
                    if (v === "Bill Sent") cls = "status-sent";
                    if (v === "Payment Received") cls = "status-paid";
                    return `<span class="status-badge ${cls}">${v}</span>`;
                }
            },
            { name: "Recruiter", width: 130 },
            { name: "Recipient Name", width: 150 },
            { name: "Recipient Mail", width: 180 },
            { name: "Recipient No.", width: 130 },
            { name: "GSTIN/UIN", width: 130 },
            { name: "Recruiter Remarks", width: 200 },
            { name: "Accountant Remarks", width: 200 }
        ];

        // 🟢 Mapping ALL data
        const data = rows.map(r => [
            r.name,
            r.company_name || "-",
            r.job_opening || "-",
            r.candidate_name || "-",
            r.candidate_contact || "-",
            r.designation || "-",
            r.hiring_location || "-",
            r.joining_date || "-",
            r.status || "-",
            r.billable_ctc || 0,
            r.billing_value || 0,
            r.billing_fee || "-",
            r.billing_month || "-",
            r.billing_status || "Yet to Bill",
            r.recruiter || "-",
            r.recipients_name || "-",
            r.recipients_mail_id || "-",
            r.recipients_number || "-",
            r.gstinuin || "-",
            r.remarks_by_recruiter || "-",
            r.accountant_remarks || "-"
        ]);

        new frappe.DataTable("#jt-table", {
            columns: columns,
            data: data,
            // 🟢 REMOVED `layout: "fluid"` -> This activates the horizontal scroll!
            inlineFilters: true 
        });
    }

    load_dashboard();
};