const stageColors = {
    "In Review": "#D9825B",
    "Screening": "#7F78C8",
    "Interview": "#6FAFD6",
    "Interview in Progress": "#6FAFD6",
    "Shortlisted For Interview": "#9B7EDE",
    "Selected": "#4CAF50",
    "Offered": "#6FBF8F",
    "Rejected": "#D16B6B",
    "Offer Drop": "#8E8E8E",
    "Joined": "#2E7D32"
};

const priorityColors = {
    "Critical": "#D75A5A",
    "High": "#E39A5F"
};

// ============================================
// EXCEL DOWNLOAD HELPER
// ============================================

function download_excel_from_rows(filename, headers, rows) {
    let html = '<table><thead><tr>';
    headers.forEach(h => {
        const safeHeader = frappe.utils?.escape_html?.(h) || h;
        html += `<th>${safeHeader}</th>`;
    });
    html += '</tr></thead><tbody>';

    rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
            const text = cell == null ? '' : String(cell);
            const safeText = frappe.utils?.escape_html?.(text) || text;
            html += `<td>${safeText}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function get_ageing_days(creation) {
    if (!creation) return "-";
    const created_on = frappe.datetime.str_to_obj(creation);
    const today_obj = frappe.datetime.str_to_obj(frappe.datetime.now_date());
    const diff_days = Math.floor((today_obj - created_on) / (1000 * 60 * 60 * 24));
    return diff_days >= 0 ? diff_days : 0;
}

// ============================================
// PAGE LOAD
// ============================================

frappe.pages['hr-recruitment-dashb'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'HR Recruitment Dashboard',
        single_column: true
    });

    $(frappe.render_template("hr_recruitment_dashb")).appendTo(page.body);

    // Initial load for active tab
    $(document).ready(function() {
        const active_tab = $("#hr-dashboard-tabs .nav-link.active").data("tab");
        if (active_tab === "company") {
            init_company_tab();
            load_company_kpis();
            load_client_type_chart();
        }
    });

    // Tab switching
    $(document).on("click", "#hr-dashboard-tabs .nav-link", function() {
        const tab = $(this).data("tab");

        $("#hr-dashboard-tabs .nav-link").removeClass("active");
        $(this).addClass("active");

        $(".tab-pane").removeClass("active");
        $(`#tab-${tab}`).addClass("active");

        if (tab === "candidates") {
            load_candidates_tab();
        }
        if (tab === "jobs") {
            if (!jobs_from_control) {
                init_jobs_tab();
            } else {
                load_jobs_table();
                load_job_kpis();
            }
        }
        if (tab === "company") {
            if (!companyDataTable) {
                init_company_tab();
            } else {
                load_company_table();
            }
            load_company_kpis();
            load_client_type_chart();
        }
    });
};

// ============================================
// CANDIDATES TAB
// ============================================

let candidate_from_control, candidate_to_control;

function load_candidates_tab() {
    $("#candidates-table").empty();
    
    if (!candidate_from_control) {
        init_candidate_tab();
    } else {
        load_candidate_table();
    }
    load_kpis();
}

function init_candidate_tab() {
    candidate_from_control = frappe.ui.form.make_control({
        parent: $(".candidate-from-date"),
        df: { fieldtype: "Date", label: "From Date", change: () => load_candidate_table() },
        render_input: true
    });

    candidate_to_control = frappe.ui.form.make_control({
        parent: $(".candidate-to-date"),
        df: { fieldtype: "Date", label: "To Date", change: () => load_candidate_table() },
        render_input: true
    });

    $("#candidate-clear-dates").off("click").on("click", function() {
        candidate_from_control.set_value(null);
        candidate_to_control.set_value(null);
        load_candidate_table();
    });

    $("#download-candidates-excel").off("click").on("click", function() {
        const from_date = candidate_from_control?.get_value() || null;
        const to_date = candidate_to_control?.get_value() || null;
        
        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_candidate_table",
            args: { from_date, to_date },
            callback(r) {
                if (!r.message?.data?.length) {
                    frappe.msgprint(__('No data to download.'));
                    return;
                }
                const headers = ["Candidate", "Department", "Designation", "Experience (Yrs)", "Skills", "Certifications", "Created On"];
                const rows = r.message.data.map(d => [
                    d.candidate_name || d.name, d.department || "-", d.current_designation || "-",
                    d.total_experience_years ?? "-", d.skills_tags || "-", d.key_certifications || "-",
                    frappe.datetime.str_to_user(d.creation)
                ]);
                download_excel_from_rows("candidates.xls", headers, rows);
            }
        });
    });

    load_candidate_table();
}

function load_candidate_table() {
    const from_date = candidate_from_control?.get_value() || null;
    const to_date = candidate_to_control?.get_value() || null;

    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_candidate_table",
        args: { from_date, to_date },
        callback: function(r) {
            if (r.message) render_candidate_table(r.message.data);
        }
    });
}

function render_candidate_table(data) {
    const $container = $("#candidates-table");
    $container.empty();

    const columns = [
        {
            name: "Candidate",
            format: (value, row, col, rowIndex) => {
                const name = data[rowIndex]?.name || "";
                return `<a href="/app/dkp_candidate/${name}" target="_blank" style="color:#2490ef;font-weight:600;">${value || "-"}</a>`;
            }
        },
        { name: "Department" },
        { name: "Designation" },
        { name: "Experience (Yrs)"},
        {
            name: "Skills",
            format: (value) => {
                return `<div style="
                    max-width:250px;
                    white-space:normal;
                    word-break:break-word;
                ">${value || "-"}</div>`;
            }
        },
        {
            name: "Certifications",
            format: (value) => {
                return `<div style="
                    max-width:200px;
                    white-space:normal;
                    word-break:break-word;
                ">${value || "-"}</div>`;
            }
        },
        { name: "Created On" }
    ];

    const tableData = data.map(d => [
        d.candidate_name || d.name || "-", d.department || "-", d.current_designation || "-",
        d.total_experience_years ?? "-", d.skills_tags || "-", d.key_certifications || "-",
        d.creation ? frappe.datetime.str_to_user(d.creation) : "-"
    ]);

    new frappe.DataTable($container[0], {
        columns, 
        data: tableData, 
        inlineFilters: true, 
        noDataMessage: "No candidates found",
        layout: 'fluid'
    });
}

function load_kpis() {
    const from_date = candidate_from_control?.get_value() || null;
    const to_date = candidate_to_control?.get_value() || null;

    frappe.call({
        method: "frappe.desk.query_report.run",
        args: { report_name: "HR Recruitment KPIs", filters: { from_date, to_date } },
        callback: function(r) {
            if (r.message?.result) render_kpi_cards(r.message.result[0]);
        }
    });
}

function render_kpi_cards(data) {
    const cards = [
        { label: "Total Candidates", value: data.total_candidates, link: "/app/dkp_candidate" },
        { label: "Blacklisted Candidates", value: data.blacklisted_candidates, link: "/app/dkp_candidate?blacklisted=Yes" }
    ];

    const $container = $("#hr-kpi-cards");
    $container.empty();

    cards.forEach(card => {
        $(`<a href="${card.link}" class="kpi-card">
               <div class="kpi-value">${card.value}</div>
               <div class="kpi-label">${card.label}</div>
           </a>`).appendTo($container);
    });
}

// ============================================
// JOBS TAB
// ============================================

let jobsDataTable = null;
let jobs_from_control, jobs_to_control;

function init_jobs_tab() {
    jobs_from_control = frappe.ui.form.make_control({
        parent: $(".jobs-from-date"),
        df: { fieldtype: "Date", label: "From Date", change: () => { load_jobs_table(); load_job_kpis(); } },
        render_input: true
    });

    jobs_to_control = frappe.ui.form.make_control({
        parent: $(".jobs-to-date"),
        df: { fieldtype: "Date", label: "To Date", change: () => { load_jobs_table(); load_job_kpis(); } },
        render_input: true
    });

    $("#jobs-clear-dates").off("click").on("click", function() {
        jobs_from_control.set_value(null);
        jobs_to_control.set_value(null);
        load_jobs_table();
        load_job_kpis();
    });

    $("#download-jobs-excel").off("click").on("click", function() {
        const from_date = jobs_from_control?.get_value() || null;
        const to_date = jobs_to_control?.get_value() || null;
        
        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_jobs_table",
            args: { from_date, to_date },
            callback(r) {
                if (!r.message?.data?.length) {
                    frappe.msgprint(__('No data to download.'));
                    return;
                }
                const headers = [
                "Job Opening", "Company", "Designation", "Department", 
                "Recruiters", 
                "Status", "Priority", "Positions", "Created On", "Ageing"
            ];
                const rows = r.message.data.map(d => [
                d.name || "-", 
                d.company_name || "-", 
                d.designation || "-", 
                d.department || "-",
                d.recruiters || "-", 
                d.status || "-", 
                d.priority || "-", 
                d.number_of_positions || "-",
                moment(d.creation).format("DD-MM-YYYY hh:mm A"), 
                get_ageing_days(d.creation)
            ]);
                download_excel_from_rows("jobs.xls", headers, rows);
            }
        });
    });

    load_jobs_table();
    load_job_kpis();
}

function load_jobs_table() {
    const from_date = jobs_from_control?.get_value() || null;
    const to_date = jobs_to_control?.get_value() || null;

    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_jobs_table",
        args: { from_date, to_date },
        callback: function(r) {
            render_jobs_table(r.message?.data || []);
        }
    });
}

function render_jobs_table(data) {
    const $container = $("#jobs-table");
    $container.empty();

    if (!data.length) {
        $container.html('<p class="text-muted text-center">No jobs found</p>');
        jobsDataTable = null;
        return;
    }

    const columns = [
        {
            name: "Job Opening", 
            format: (value, row, col, rowIndex) => {
                const name = data[rowIndex]?.name || "";
                return `<a href="/app/dkp_job_opening/${name}" target="_blank" style="color:#2490ef;font-weight:600;">${value || "-"}</a>`;
            }
        },
        { name: "Company" },
        { name: "Designation" },
        { name: "Department" },
        { name: "Recruiters" },  // 👈 NEW COLUMN
        { name: "Status" },
        { 
            name: "Priority",
            format: (value) => {
                const bg = priorityColors[value] || "#6c757d";
                return `<span style="padding:4px 10px;border-radius:12px;color:#fff;font-weight:600;background:${bg};">${value || "-"}</span>`;
            }
        },
        { name: "Positions" },
        { name: "Created On" },
        { 
            name: "Ageing",
            format: (value) => {
                const days = parseInt(value) || 0;
                const style = days > 45 ? "background:#f8d7da;font-weight:600;padding:4px 8px;border-radius:4px;" : "";
                return `<span style="${style}">${value}</span>`;
            }
        }
    ];

    const tableData = data.map(d => [
        d.name || "-", 
        d.company_name || "-", 
        d.designation || "-", 
        d.department || "-",
        d.recruiters || "-",  // 👈 NEW DATA
        d.status || "-", 
        d.priority || "-", 
        d.number_of_positions || "-",
        d.creation ? moment(d.creation).format("DD-MM-YYYY hh:mm A") : "-", 
        get_ageing_days(d.creation)
    ]);

    jobsDataTable = new frappe.DataTable($container[0], {
        columns, 
        data: tableData, 
        inlineFilters: true, 
        noDataMessage: "No jobs found",
        layout: 'fluid'
    });
}

function load_job_kpis() {
    const from_date = jobs_from_control?.get_value() || null;
    const to_date = jobs_to_control?.get_value() || null;

    frappe.call({
        method: "frappe.desk.query_report.run",
        args: { report_name: "HR Recruitment – Jobs KPIs", filters: { from_date, to_date } },
        callback(r) {
            if (r.message) {
                const result = r.message.result[0];
                render_job_kpi_cards(result);
                render_job_status_cards(result.status_cards);
                render_job_charts(r.message.chart);
            }
        }
    });
}

function render_job_kpi_cards(data) {
    const cards = [
        { label: "Total Job Openings", value: data.total_jobs, link: "/app/dkp_job_opening" },
        { label: "Total Positions", value: data.total_positions, link: "/app/dkp_job_opening" }
    ];

    const $container = $("#job-kpi-cards");
    $container.empty();

    cards.forEach(card => {
        $(`<a href="${card.link}" class="kpi-card">
               <div class="kpi-value">${card.value}</div>
               <div class="kpi-label">${card.label}</div>
           </a>`).appendTo($container);
    });
}

function render_job_status_cards(statusCards) {
    const $row = $("#job-status-kpi-cards");
    $row.empty();

    statusCards.forEach(item => {
        $(`<div class="status-card">
               <div class="status-card-header">${item.status}</div>
               <div class="status-card-body">
                   <div class="status-metric">
                       <span class="metric-label">Openings</span>
                       <span class="metric-value">${item.openings}</span>
                   </div>
                   <div class="status-metric">
                       <span class="metric-label">Positions</span>
                       <span class="metric-value">${item.positions}</span>
                   </div>
               </div>
           </div>`).appendTo($row);
    });
}

function render_job_charts(chart) {
    const labels = chart.data.labels;
    const values = chart.data.datasets[0].values;

    new frappe.Chart("#job-status-chart", {
        title: "Job Status Distribution",
        data: { labels, datasets: [{ values }] },
        type: "donut",
        height: 250
    });
}

// ============================================
// COMPANY TAB
// ============================================

let companyDataTable = null;

function init_company_tab() {
    load_company_table();
    
    $("#download-company-excel").off("click").on("click", function() {
        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_companies",
            args: {},
            callback(r) {
                if (!r.message?.data?.length) {
                    frappe.msgprint(__('No data to download.'));
                    return;
                }
                const headers = ["Company", "Client Type", "Industry", "Location", "Billing Email", "Billing Phone", "Status", "Fee Value", "Replacement"];
                const rows = r.message.data.map(d => [
                    d.company_name || d.name, d.client_type || "-", d.industry || "-",
                    `${d.city || "-"}, ${d.state || "-"}`, d.billing_mail || "-", d.billing_number || "-",
                    d.client_status || "-", `${d.standard_fee_value || "0"}%`, d.replacement_policy_days || "-"
                ]);
                download_excel_from_rows("companies.xls", headers, rows);
            }
        });
    });
}

function load_company_table() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_companies",
        args: {},
        callback: function(r) {
            render_company_table(r.message?.data || []);
        }
    });
}

function render_company_table(data) {
    const $container = $("#company-table");
    $container.empty();

    if (!data.length) {
        $container.html('<p class="text-muted text-center">No companies found</p>');
        companyDataTable = null;
        return;
    }

    const columns = [
        {
            name: "Company", 
            format: (value, row, col, rowIndex) => {
                const name = data[rowIndex]?.name || "";
                return `<a href="/app/customer/${name}" target="_blank" style="color:#2490ef;font-weight:600;">${value || "-"}</a>`;
            }
        },
        { name: "Client Type" },
        { name: "Industry" },
        { name: "Location" },
        { name: "Billing Email" },
        { name: "Billing Phone" },
        { name: "Status" },
        { name: "Fee Value" },
        { name: "Replacement" }
    ];

    const tableData = data.map(d => [
        d.company_name || d.name || "-", d.client_type || "-", d.industry || "-",
        `${d.city || "-"}, ${d.state || "-"}`, d.billing_mail || "-", d.billing_number || "-",
        d.client_status || "-", `${d.standard_fee_value || "0"}%`, d.replacement_policy_days || "-"
    ]);

    companyDataTable = new frappe.DataTable($container[0], {
        columns, 
        data: tableData, 
        inlineFilters: true, 
        noDataMessage: "No companies found",
        layout: 'fluid'
    });
}

function load_company_kpis() {
    frappe.call({
        method: "frappe.desk.query_report.run",
        args: { report_name: "Company Recruitment KPIs" },
        callback(r) {
            if (r.message) render_company_kpi_cards(r.message.result);
        }
    });
}

function render_company_kpi_cards(data) {
    const kpiLinks = {
        "Total Clients": "/app/customer",
        "Active Clients": "/app/customer?custom_client_status=Active",
        "Inactive Clients": "/app/customer?custom_client_status=Inactive",
        "Clients with Open Jobs": "/app/dkp_job_opening?status=Open"
    };

    const $container = $("#company-kpi-cards");
    $container.empty();

    data.forEach(item => {
        const link = kpiLinks[item.kpi];
        if (link) {
            $(`<a href="${link}" class="kpi-card">
                   <div class="kpi-value">${item.value}</div>
                   <div class="kpi-label">${item.kpi}</div>
               </a>`).appendTo($container);
        } else {
            $(`<div class="kpi-card">
                   <div class="kpi-value">${item.value}</div>
                   <div class="kpi-label">${item.kpi}</div>
               </div>`).appendTo($container);
        }
    });
}

function load_client_type_chart() {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.hr_dashboard.get_client_type_distribution",
        callback(r) {
            if (r.message) {
                new frappe.Chart("#client-type-chart", {
                    title: "Client Type Distribution",
                    data: r.message.data,
                    type: "pie",
                    height: 280
                });
            }
        }
    });
}