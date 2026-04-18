// Excel Download Helper Functions
// Page load hone par SheetJS load karo
function load_xlsx_library() {
	return new Promise((resolve) => {
		if (window.XLSX) {
			resolve();
			return;
		}
		const script = document.createElement("script");
		script.src =
			"https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
		script.onload = resolve;
		document.head.appendChild(script);
	});
}

// App initialize hote hi load kar do
load_xlsx_library();
// ═══════════════════════════════════════════════════════════
// MASTER EXCEL EXPORT UTILITY
// ═══════════════════════════════════════════════════════════

// function export_to_excel(headers, rows_data, filename) {
//     if (!window.XLSX) {
//         frappe.msgprint("Excel library load nahi hui. Thodi der mein try karo.");
//         return;
//     }

//     // Headers + Data combine karo
//     const worksheet_data = [headers, ...rows_data];

//     // Worksheet banao
//     const ws = XLSX.utils.aoa_to_sheet(worksheet_data);

//     // Column widths auto-set karo
//     const col_widths = headers.map((h, i) => {
//         const max_len = Math.max(
//             h.length,
//             ...rows_data.map((row) =>
//                 String(row[i] || "").length
//             )
//         );
//         return { wch: Math.min(max_len + 4, 40) };
//     });
//     ws["!cols"] = col_widths;

//     // Header row ko bold banao
//     headers.forEach((_, i) => {
//         const cell_ref = XLSX.utils.encode_cell({ r: 0, c: i });
//         if (ws[cell_ref]) {
//             ws[cell_ref].s = {
//                 font: { bold: true },
//                 fill: { fgColor: { rgb: "F5F7FA" } },
//             };
//         }
//     });

//     // Workbook banao
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Data");

//     // Download karo
//     XLSX.writeFile(wb, `${filename}_${frappe.datetime.get_today()}.xlsx`);
// }
function export_to_excel(headers, rows_data, filename) {
	if (!window.XLSX) {
		frappe.msgprint(
			"Excel library load nahi hui. Thodi der mein try karo.",
		);
		return;
	}
	const worksheet_data = [headers, ...rows_data];
	const ws = XLSX.utils.aoa_to_sheet(worksheet_data);
	const col_widths = headers.map((h, i) => {
		const max_len = Math.max(
			h.length,
			...rows_data.map((row) => String(row[i] || "").length),
		);
		return { wch: Math.min(max_len + 4, 40) };
	});
	ws["!cols"] = col_widths;
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, "Data");
	XLSX.writeFile(wb, `${filename}_${frappe.datetime.get_today()}.xlsx`);
}

// ═══════════════════════════════════════════════════════════
// EXCEL BUTTON HTML GENERATOR
// ═══════════════════════════════════════════════════════════

function excel_btn_html(count) {
	return `
        <div style="display:flex;justify-content:space-between;
                    align-items:center;margin-bottom:10px;">
            <div style="color:#888;font-size:12px;">
                Showing <strong>${count}</strong> records
            </div>
            <button class="dialog-excel-btn"
                style="
                    display:flex;align-items:center;gap:6px;
                    background:#1d6f42;color:#fff;
                    border:none;border-radius:6px;
                    padding:6px 14px;font-size:12px;
                    font-weight:600;cursor:pointer;
                    transition: opacity 0.2s;
                "
                onmouseover="this.style.opacity='0.85'"
                onmouseout="this.style.opacity='1'"
            >
                <svg width="14" height="14" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor"
                     stroke-width="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download Excel
            </button>
        </div>`;
}
function bind_excel_btn(dialog, headers, rows_data, filename) {
	// dialog.$wrapper is always available after dialog.show()
	dialog.$wrapper.find(".dialog-excel-btn").on("click", function () {
		export_to_excel(headers, rows_data, filename);
	});
}
function download_excel_from_rows(filename, headers, rows) {
	let html = "<table><thead><tr>";
	headers.forEach((h) => {
		const safeHeader = frappe.utils?.escape_html?.(h) || h;
		html += `<th>${safeHeader}</th>`;
	});
	html += "</tr></thead><tbody>";

	rows.forEach((row) => {
		html += "<tr>";
		row.forEach((cell) => {
			const text = cell == null ? "" : String(cell);
			const safeText = frappe.utils?.escape_html?.(text) || text;
			html += `<td>${safeText}</td>`;
		});
		html += "</tr>";
	});
	html += "</tbody></table>";

	const blob = new Blob([html], {
		type: "application/vnd.ms-excel;charset=utf-8;",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename || "export.xls";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

function getCellValue(cell) {
	if (cell == null) return "-";
	if (typeof cell === "string" || typeof cell === "number") {
		return stripHTML(String(cell)) || "-";
	}
	if (typeof cell === "object") {
		const value =
			cell.content || cell.value || cell.text || cell.data || "";
		return stripHTML(String(value)) || "-";
	}
	return "-";
}

function stripHTML(value) {
	if (value == null || value === "") return "";
	const str = String(value);
	const tmp = document.createElement("div");
	tmp.innerHTML = str;
	return tmp.textContent || tmp.innerText || str;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

frappe.pages["master-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Master Report",
		single_column: true,
	});

	$(frappe.render_template("master_report", {})).appendTo(page.body);

	// STATE VARIABLES
	let state = {
		from_date: null,
		to_date: null,
		company: null,
		recruiter: null,
		status: null,
	};
	let current_all_job_names = [];
	let current_open_job_names = [];
	// DOM REFERENCES
	const $body = $(page.body);

	// Tables
	const $master_table = $body.find("#master-report-table");
	const $company_table = $body.find("#company-summary-table");
	const $recruiter_table = $body.find("#recruiter-performance-table");
	const $ageing_table = $body.find("#ageing-critical-table");

	// DataTable instances
	let masterDataTable = null;
	let companyDataTable = null;
	let recruiterDataTable = null;
	let ageingDataTable = null;

	// Raw data storage for Excel export
	let masterRawData = [];
	let companyRawData = [];
	let recruiterRawData = [];

	// KPI elements - ALL Jobs
	const $kpi_joined = $body.find(".kpi-joined");
	const $kpi_joined_left = $body.find(".kpi-joined-left");
	const $kpi_conversion = $body.find(".kpi-conversion");

	// KPI elements - OPEN Jobs
	const $kpi_open_jobs = $body.find(".kpi-open-jobs");
	const $kpi_submitted = $body.find(".kpi-submitted");
	const $kpi_rejected = $body.find(".kpi-rejected");
	const $kpi_interview = $body.find(".kpi-interview");
	const $kpi_ageing_critical = $body.find(".kpi-ageing-critical");

	// Ageing buckets
	const $ageing_0_15 = $body.find(".ageing-0-15");
	const $ageing_16_30 = $body.find(".ageing-16-30");
	const $ageing_30_plus = $body.find(".ageing-30-plus");

	// Record counts
	const $master_count = $body.find(".master-record-count");
	const $company_count = $body.find(".company-record-count");
	const $recruiter_count = $body.find(".recruiter-record-count");

	// DEBOUNCE FUNCTION
	let debounce_timer;
	function debounced_refresh() {
		clearTimeout(debounce_timer);
		debounce_timer = setTimeout(() => {
			refresh_dashboard();
		}, 300);
	}
	// filter controls
	// Track if refresh is already queued
	let refresh_queued = false;

	// Smart refresh - prevents duplicate calls
	function smart_refresh() {
		if (refresh_queued) return;

		refresh_queued = true;
		debounced_refresh();

		setTimeout(() => {
			refresh_queued = false;
		}, 400);
	}

	const from_date_control = frappe.ui.form.make_control({
		parent: $body.find(".from-date-slot"),
		df: {
			fieldtype: "Date",
			placeholder: "From Date",
			change: function () {
				const newValue = from_date_control.get_value() || null;
				if (state.from_date !== newValue) {
					state.from_date = newValue;
					smart_refresh();
				}
			},
		},
		render_input: true,
	});

	const to_date_control = frappe.ui.form.make_control({
		parent: $body.find(".to-date-slot"),
		df: {
			fieldtype: "Date",
			placeholder: "To Date",
			change: function () {
				const newValue = to_date_control.get_value() || null;
				if (state.to_date !== newValue) {
					state.to_date = newValue;
					smart_refresh();
				}
			},
		},
		render_input: true,
	});

	const company_control = frappe.ui.form.make_control({
		parent: $body.find(".company-slot"),
		df: {
			fieldtype: "Link",
			options: "Customer",
			placeholder: "All Companies",
			change: function () {
				const newValue = company_control.get_value() || null;
				if (state.company !== newValue) {
					state.company = newValue;
					smart_refresh();
				}
			},
		},
		render_input: true,
	});

	const recruiter_control = frappe.ui.form.make_control({
		parent: $body.find(".recruiter-slot"),
		df: {
			fieldtype: "Link",
			options: "User",
			placeholder: "All Recruiters",
			get_query: () => ({
				filters: {
					role_profile_name: [
						"in",
						["DKP Recruiter", "DKP Recruiter - Exclusive", "Admin"],
					],
					enabled: 1,
				},
			}),
			change: function () {
				const newValue = recruiter_control.get_value() || null;
				if (state.recruiter !== newValue) {
					state.recruiter = newValue;
					smart_refresh();
				}
			},
		},
		render_input: true,
	});

	const status_control = frappe.ui.form.make_control({
		parent: $body.find(".status-slot"),
		df: {
			fieldtype: "Select",
			options: "\nOpen\nOn Hold\nClosed – Hired\nClosed – Cancelled",
			placeholder: "All Status",
			change: function () {
				const newValue = status_control.get_value() || null;
				if (state.status !== newValue) {
					state.status = newValue;
					smart_refresh();
				}
			},
		},
		render_input: true,
	});
	$body.find(".master-nav-tabs a").on("click", function (e) {
		e.preventDefault();
		e.stopPropagation();

		const targetTab = $(this).attr("href");

		// Remove active from all tabs
		$body.find(".master-nav-tabs li").removeClass("active");
		// Add active to clicked tab
		$(this).parent("li").addClass("active");

		// Hide all tab panes
		$body.find(".master-tab-content .tab-pane").removeClass("in active");
		// Show target tab pane
		$body.find(targetTab).addClass("in active");

		// ✅ ADD THIS - Refresh table layout after tab switch
		setTimeout(() => {
			switch (targetTab) {
				case "#tab-master-report":
					if (masterDataTable) masterDataTable.refresh();
					break;
				case "#tab-company-summary":
					if (companyDataTable) companyDataTable.refresh();
					break;
				case "#tab-recruiter-performance":
					if (recruiterDataTable) recruiterDataTable.refresh();
					break;
				case "#tab-ageing-analysis":
					if (ageingDataTable) ageingDataTable.refresh();
					break;
			}
		}, 10);
	});
	// ═══════════════════════════════════════════════════════════════════════
	// KPI CARD CLICK HANDLERS
	// ═══════════════════════════════════════════════════════════════════════

	$body.find(".kpi-clickable").on("click", function (e) {
		if ($(e.target).closest(".kpi-info").length) return;

		const route = $(this).data("route");

		// ✅ Helper to build date filter safely
		function get_date_filter() {
			if (state.from_date && state.to_date) {
				return {
					creation: ["between", [state.from_date, state.to_date]],
				};
			} else if (state.from_date) {
				return { creation: [">=", state.from_date] };
			} else if (state.to_date) {
				return { creation: ["<=", state.to_date] };
			}
			return {}; // No date filter at all
		}

		switch (route) {
			case "joined":
				show_joined_dialog();
				break;

			case "joined-left":
				show_joined_left_dialog();
				break;

			case "open-jobs":
				show_open_jobs_dialog();
				break;

			case "submitted":
				// ✅ Will handle with dialog - Issue 2
				show_submitted_dialog();
				break;

			case "rejected":
				show_rejected_dialog();
				break;

			case "interview-pipeline":
				show_interview_pipeline_dialog(); // ✅ replaces frappe.set_route
				break;

			case "ageing-critical":
				show_ageing_critical_dialog();
				break;
		}
	});
	// ═══════════════════════════════════════════════
	// OPEN JOBS DIALOG
	// ═══════════════════════════════════════════════

	function show_open_jobs_dialog() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_open_jobs_detail",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
				status: state.status,
			},
			callback(r) {
				const data = r.message || [];
				render_open_jobs_dialog(data);
			},
		});
	}
	function render_open_jobs_dialog(data) {
		const priority_color = {
			Critical: "#e74c3c",
			High: "#e67e22",
			Medium: "#f39c12",
			Low: "#95a5a6",
		};

		function days_badge(days) {
			let color = "#27ae60";
			if (days > 30) color = "#e74c3c";
			else if (days > 15) color = "#e67e22";
			return `<span style="background:${color};color:#fff;padding:2px 8px;
            border-radius:10px;font-size:11px;font-weight:600;">${days}d</span>`;
		}

		function priority_badge(label) {
			if (!label || label === "—")
				return `<span class="text-muted">—</span>`;
			const color = priority_color[label] || "#95a5a6";
			return `<span style="background:${color};color:#fff;padding:2px 8px;
            border-radius:10px;font-size:11px;white-space:nowrap;">${label}</span>`;
		}

		function status_badge(label) {
			const color_map = {
				Open: "#27ae60",
				"On Hold": "#f39c12",
				"Closed – Hired": "#2980b9",
				"Closed – Cancelled": "#e74c3c",
			};
			const color = color_map[label] || "#95a5a6";
			return `<span style="background:${color};color:#fff;padding:2px 8px;
            border-radius:10px;font-size:11px;white-space:nowrap;">${label}</span>`;
		}

		function link(href, label) {
			if (!label) return "—";
			return `<a href="${href}" target="_blank"
                   style="color:#5e64ff;font-weight:500;">${label}</a>`;
		}

		const rows = data.length
			? data
					.map(
						(row) => `
            <tr>
                <td>${link(`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`, row.job_opening)}</td>
                <td>${link(`/app/customer/${encodeURIComponent(row.company_name)}`, row.company_name)}</td>
                <td>${row.designation || "—"}</td>
                <td>${status_badge(row.status)}</td>
                <td style="color:#555;font-size:12px;">${row.recruiters || "—"}</td>
                <td>${days_badge(row.days_open)}</td>
                <td>${priority_badge(row.priority)}</td>
            </tr>`,
					)
					.join("")
			: `<tr><td colspan="7" class="text-center text-muted"
               style="padding:30px 0;">No open jobs found.</td></tr>`;

		// ✅ No BTN_ID needed
		const table_html = `
        ${excel_btn_html(data.length)}
        <div style="overflow:auto;max-height:65vh;">
            <table class="table table-bordered table-hover"
                   style="font-size:13px;margin:0;min-width:900px;">
                <thead>
                    <tr style="background:#f5f7fa;">
                        <th>Job Opening</th>
                        <th>Company</th>
                        <th>Designation</th>
                        <th>Status</th>
                        <th>Assigned Recruiter(s)</th>
                        <th>Ageing</th>
                        <th>Priority</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

		const dialog = new frappe.ui.Dialog({
			title: `Open Jobs (${data.length})`,
			size: "extra-large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "table_html",
					options: table_html,
				},
			],
			primary_action_label: "Close",
			primary_action() {
				dialog.hide();
			},
		});

		dialog.show();

		// ✅ Seedha bind - no setTimeout, no ID hunting
		const excel_rows = data.map((row) => [
			row.job_opening || "",
			row.company_name || "",
			row.designation || "",
			row.status || "",
			row.recruiters || "",
			row.days_open || 0,
			row.priority || "",
		]);
		bind_excel_btn(
			dialog,
			[
				"Job Opening",
				"Company",
				"Designation",
				"Status",
				"Assigned Recruiter(s)",
				"Days Open",
				"Priority",
			],
			excel_rows,
			"Open_Jobs",
		);
	}
	// function render_open_jobs_dialog(data) {
	// 	// Priority colors
	// 	const priority_color = {
	// 		Critical: "#e74c3c",
	// 		High: "#e67e22",
	// 		Medium: "#f39c12",
	// 		Low: "#95a5a6",
	// 	};

	// 	// Days open badge color
	// 	function days_badge(days) {
	// 		let color = "#27ae60"; // green - fresh
	// 		if (days > 30)
	// 			color = "#e74c3c"; // red - critical
	// 		else if (days > 15) color = "#e67e22"; // orange - warning
	// 		return `<span style="background:${color};color:#fff;padding:2px 8px;
	//         border-radius:10px;font-size:11px;font-weight:600;">${days}d</span>`;
	// 	}

	// 	function priority_badge(label) {
	// 		if (!label || label === "—")
	// 			return `<span class="text-muted">—</span>`;
	// 		const color = priority_color[label] || "#95a5a6";
	// 		return `<span style="background:${color};color:#fff;padding:2px 8px;
	//         border-radius:10px;font-size:11px;white-space:nowrap;">${label}</span>`;
	// 	}

	// 	function status_badge(label) {
	// 		const color_map = {
	// 			Open: "#27ae60",
	// 			"On Hold": "#f39c12",
	// 			"Closed – Hired": "#2980b9",
	// 			"Closed – Cancelled": "#e74c3c",
	// 		};
	// 		const color = color_map[label] || "#95a5a6";
	// 		return `<span style="background:${color};color:#fff;padding:2px 8px;
	//         border-radius:10px;font-size:11px;white-space:nowrap;">${label}</span>`;
	// 	}

	// 	function link(href, label) {
	// 		if (!label) return "—";
	// 		return `<a href="${href}" target="_blank"
	//                style="color:#5e64ff;font-weight:500;">${label}</a>`;
	// 	}

	// 	const rows = data.length
	// 		? data
	// 				.map(
	// 					(row) => `
	//         <tr>
	//             <td>${link(
	// 				`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`,
	// 				row.job_opening,
	// 			)}</td>
	//             <td>${link(
	// 				`/app/customer/${encodeURIComponent(row.company_name)}`,
	// 				row.company_name,
	// 			)}</td>
	//             <td>${row.designation || "—"}</td>
	//             <td>${status_badge(row.status)}</td>
	//             <td style="color:#555;font-size:12px;">${row.recruiters || "—"}</td>
	//             <td>${days_badge(row.days_open)}</td>
	//             <td>${priority_badge(row.priority)}</td>
	//         </tr>`,
	// 				)
	// 				.join("")
	// 		: `<tr><td colspan="7" class="text-center text-muted"
	//            style="padding:30px 0;">No open jobs found.</td></tr>`;

	// 		     // ✅ Excel button ID unique rakho
	// const BTN_ID = "excel_open_jobs";
	// 	const table_html = `
	// 	 ${excel_btn_html(BTN_ID, data.length)}
	//     <div style="overflow:auto;max-height:65vh;">
	//         <table class="table table-bordered table-hover"
	//                style="font-size:13px;margin:0;min-width:900px;">
	//             <thead>
	//                 <tr style="background:#f5f7fa;">
	//                     <th>Job Opening</th>
	//                     <th>Company</th>
	//                     <th>Designation</th>
	//                     <th>Status</th>
	//                     <th>Assigned Recruiter(s)</th>
	//                     <th>Ageing</th>
	//                     <th>Priority</th>
	//                 </tr>
	//             </thead>
	//             <tbody>${rows}</tbody>
	//         </table>
	//     </div>`;

	// 	const dialog = new frappe.ui.Dialog({
	// 		title: `Open Jobs (${data.length})`,
	// 		size: "extra-large",
	// 		fields: [
	// 			{
	// 				fieldtype: "HTML",
	// 				fieldname: "table_html",
	// 				options: table_html,
	// 			},
	// 		],
	// 		primary_action_label: "Close",
	// 		primary_action() {
	// 			dialog.hide();
	// 		},
	// 	});

	// 	dialog.show();

	// 	 // ✅ Button click handler - dialog show hone ke baad
	// setTimeout(() => {
	//     document.getElementById(BTN_ID)?.addEventListener("click", () => {
	//         const headers = [
	//             "Job Opening", "Company", "Designation",
	//             "Status", "Assigned Recruiter(s)", "Days Open", "Priority"
	//         ];
	//         const rows_data = data.map((row) => [
	//             row.job_opening || "",
	//             row.company_name || "",
	//             row.designation || "",
	//             row.status || "",
	//             row.recruiters || "",
	//             row.days_open || 0,
	//             row.priority || "",
	//         ]);
	//         export_to_excel(headers, rows_data, "Open_Jobs");
	//     });
	// }, 300);
	// }
	function show_submitted_dialog() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_submitted_candidates_detail",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
			},
			callback(r) {
				const data = r.message || [];
				render_submitted_dialog(data);
			},
		});
	}

	// function render_submitted_dialog(data) {
	// 	const stage_color = {
	// 		"Submitted To Client": "#5e64ff",
	// 		"Client Screening Rejected": "#e74c3c",
	// 		"Schedule Interview": "#f39c12",
	// 		"No Response": "#95a5a6",
	// 	};

	// 	const int_color = {
	// 		"Selected For Offer": "#27ae60",
	// 		Offered: "#2980b9",
	// 		"Offer Accepted": "#1abc9c",
	// 		"Offer Declined": "#e74c3c",
	// 		Joined: "#27ae60",
	// 		"Joined And Left": "#e67e22",
	// 		"Rejected By Client": "#e74c3c",
	// 		"Interview No Show": "#95a5a6",
	// 	};

	// 	function badge(label, color) {
	// 		if (!label) return `<span class="text-muted">—</span>`;
	// 		return `<span style="background:${color};color:#fff;padding:2px 8px;
	//         border-radius:10px;font-size:11px;white-space:nowrap;">${label}</span>`;
	// 	}

	// 	function link(href, label) {
	// 		if (!label) return "—";
	// 		return `<a href="${href}" target="_blank"
	//            style="color:#5e64ff;font-weight:500;">${label}</a>`;
	// 	}

	// 	const rows = data.length
	// 		? data
	// 				.map(
	// 					(row) => `
	//         <tr>

	//             <td>${link(
	// 				`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`,
	// 				row.job_opening,
	// 			)}</td>
	// 			<td>${link(
	// 				`/app/customer/${encodeURIComponent(row.company_name)}`,
	// 				row.company_name,
	// 			)}</td>
	//             <td>${link(
	// 				`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`,
	// 				row.candidate,
	// 			)}</td>
	//             <td>${badge(
	// 				row.mapping_stage,
	// 				stage_color[row.mapping_stage] || "#95a5a6",
	// 			)}</td>
	//             <td>${badge(
	// 				row.interview_stage,
	// 				int_color[row.interview_stage] || "#bdc3c7",
	// 			)}</td>
	//             <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
	//             <td style="color:#888;font-size:12px;">${row.recruiter_remarks || "—"}</td>
	//         </tr>`,
	// 				)
	// 				.join("")
	// 		: `<tr><td colspan="7" class="text-center text-muted"
	//            style="padding:30px 0;">No submitted candidates found.</td></tr>`;
	// 	    const BTN_ID = "excel_submitted";

	// 	const table_html = `
	// 	${excel_btn_html(BTN_ID, data.length)}

	//     <div style="overflow:auto;max-height:65vh;">
	//         <table class="table table-bordered table-hover"
	//                style="font-size:13px;margin:0;min-width:900px;">
	//             <thead>
	//                 <tr style="background:#f5f7fa;">
	//                 <th>Job Opening</th>
	// 				<th>Company</th>
	//                     <th>Candidate</th>
	//                     <th>Mapping Stage</th>
	//             <th>Interview Stage</th>
	//                     <th>Assigned Recruiter(s)</th>
	//                     <th>Remarks</th>
	//                 </tr>
	//             </thead>
	//             <tbody>${rows}</tbody>
	//         </table>
	//     </div>`;

	// 	const dialog = new frappe.ui.Dialog({
	// 		title: `Submitted Candidates (${data.length})`,
	// 		size: "extra-large",
	// 		fields: [
	// 			{
	// 				fieldtype: "HTML",
	// 				fieldname: "table_html",
	// 				options: table_html,
	// 			},
	// 		],
	// 		primary_action_label: "Close",
	// 		primary_action() {
	// 			dialog.hide();
	// 		},
	// 	});

	// 	dialog.show();
	// 	setTimeout(() => {
	//     document.getElementById(BTN_ID)?.addEventListener("click", () => {
	//         const headers = [
	//             "Job Opening", "Company", "Candidate",
	//             "Mapping Stage", "Interview Stage",
	//             "Assigned Recruiter(s)", "Remarks"
	//         ];
	//         const rows_data = data.map((row) => [
	//             row.job_opening || "",
	//             row.company_name || "",
	//             row.candidate || "",
	//             row.mapping_stage || "",
	//             row.interview_stage || "",
	//             row.recruiter || "",
	//             row.recruiter_remarks || "",
	//         ]);
	//         export_to_excel(headers, rows_data, "Submitted_Candidates");
	//     });
	// }, 300);
	// }
	function render_submitted_dialog(data) {
		const stage_color = {
			"Submitted To Client": "#5e64ff",
			"Client Screening Rejected": "#e74c3c",
			"Schedule Interview": "#f39c12",
			"No Response": "#95a5a6",
		};

		const int_color = {
			"Selected For Offer": "#27ae60",
			Offered: "#2980b9",
			"Offer Accepted": "#1abc9c",
			"Offer Declined": "#e74c3c",
			Joined: "#27ae60",
			"Joined And Left": "#e67e22",
			"Rejected By Client": "#e74c3c",
			"Interview No Show": "#95a5a6",
		};

		function badge(label, color) {
			if (!label) return `<span class="text-muted">—</span>`;
			return `<span style="background:${color};color:#fff;padding:2px 8px;
            border-radius:10px;font-size:11px;white-space:nowrap;">${label}</span>`;
		}

		function link(href, label) {
			if (!label) return "—";
			return `<a href="${href}" target="_blank"
               style="color:#5e64ff;font-weight:500;">${label}</a>`;
		}

		const rows = data.length
			? data
					.map(
						(row) => `
            <tr>
                <td>${link(`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`, row.job_opening)}</td>
                <td>${link(`/app/customer/${encodeURIComponent(row.company_name)}`, row.company_name)}</td>
                <td>${link(`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`, row.candidate)}</td>
                <td>${badge(row.mapping_stage, stage_color[row.mapping_stage] || "#95a5a6")}</td>
                <td>${badge(row.interview_stage, int_color[row.interview_stage] || "#bdc3c7")}</td>
                <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
                <td style="color:#888;font-size:12px;">${row.recruiter_remarks || "—"}</td>
            </tr>`,
					)
					.join("")
			: `<tr><td colspan="7" class="text-center text-muted"
               style="padding:30px 0;">No submitted candidates found.</td></tr>`;

		const table_html = `
        ${excel_btn_html(data.length)}
        <div style="overflow:auto;max-height:65vh;">
            <table class="table table-bordered table-hover"
                   style="font-size:13px;margin:0;min-width:900px;">
                <thead>
                    <tr style="background:#f5f7fa;">
                        <th>Job Opening</th>
                        <th>Company</th>
                        <th>Candidate</th>
                        <th>Mapping Stage</th>
                        <th>Interview Stage</th>
                        <th>Assigned Recruiter(s)</th>
                        <th>Remarks</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

		const dialog = new frappe.ui.Dialog({
			title: `Submitted Candidates (${data.length})`,
			size: "extra-large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "table_html",
					options: table_html,
				},
			],
			primary_action_label: "Close",
			primary_action() {
				dialog.hide();
			},
		});

		dialog.show();

		const excel_rows = data.map((row) => [
			row.job_opening || "",
			row.company_name || "",
			row.candidate || "",
			row.mapping_stage || "",
			row.interview_stage || "",
			row.recruiter || "",
			row.recruiter_remarks || "",
		]);
		bind_excel_btn(
			dialog,
			[
				"Job Opening",
				"Company",
				"Candidate",
				"Mapping Stage",
				"Interview Stage",
				"Assigned Recruiter(s)",
				"Remarks",
			],
			excel_rows,
			"Submitted_Candidates",
		);
	}
	// ═══════════════════════════════════════════════
	// REJECTED DIALOG
	// ═══════════════════════════════════════════════

	function show_rejected_dialog() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_rejected_detail",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
			},
			callback(r) {
				const data = r.message || [];
				render_rejected_dialog(data);
			},
		});
	}

	// 	function render_rejected_dialog(data) {
	// 		// Rejection source badge
	// 		function source_badge(source) {
	// 			const color_map = {
	// 				"Rejected By Client": "#e74c3c",
	// 				"Client Screening Rejected": "#e67e22",
	// 			};
	// 			const color = color_map[source] || "#95a5a6";
	// 			return `<span style="background:${color};color:#fff;padding:2px 8px;
	//             border-radius:10px;font-size:11px;white-space:nowrap;">${source}</span>`;
	// 		}

	// 		function link(href, label) {
	// 			if (!label) return "—";
	// 			return `<a href="${href}" target="_blank"
	//                    style="color:#5e64ff;font-weight:500;">${label}</a>`;
	// 		}

	// 		const rows = data.length
	// 			? data
	// 					.map(
	// 						(row) => `
	//             <tr>
	//                 <td>${link(
	// 					`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`,
	// 					row.job_opening,
	// 				)}</td>
	//                 <td>${link(
	// 					`/app/customer/${encodeURIComponent(row.company_name)}`,
	// 					row.company_name,
	// 				)}</td>
	//                 <td>${link(
	// 					`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`,
	// 					row.candidate,
	// 				)}</td>
	//                 <td style="color:#555;font-size:12px;">${row.designation || "—"}</td>
	//                 <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
	//                 <td>${source_badge(row.rejection_source)}</td>
	//             </tr>`,
	// 					)
	// 					.join("")
	// 			: `<tr><td colspan="6" class="text-center text-muted"
	//                style="padding:30px 0;">No rejected candidates found.</td></tr>`;
	// const BTN_ID = "excel_rejected";

	// 		const table_html = `
	// 		${excel_btn_html(BTN_ID, data.length)}

	//         <div style="overflow:auto;max-height:65vh;">
	//             <table class="table table-bordered table-hover"
	//                    style="font-size:13px;margin:0;min-width:850px;">
	//                 <thead>
	//                     <tr style="background:#f5f7fa;">
	//                         <th>Job Opening</th>
	//                         <th>Company</th>
	//                         <th>Candidate</th>
	//                         <th>Designation</th>
	//                         <th>Assigned Recruiter</th>
	//                         <th>Rejection Type</th>
	//                     </tr>
	//                 </thead>
	//                 <tbody>${rows}</tbody>
	//             </table>
	//         </div>`;

	// 		const dialog = new frappe.ui.Dialog({
	// 			title: `Rejected Candidates (${data.length})`,
	// 			size: "extra-large",
	// 			fields: [
	// 				{
	// 					fieldtype: "HTML",
	// 					fieldname: "table_html",
	// 					options: table_html,
	// 				},
	// 			],
	// 			primary_action_label: "Close",
	// 			primary_action() {
	// 				dialog.hide();
	// 			},
	// 		});

	// 		dialog.show();
	// 		setTimeout(() => {
	//         document.getElementById(BTN_ID)?.addEventListener("click", () => {
	//             const headers = [
	//                 "Job Opening", "Company", "Candidate",
	//                 "Designation", "Assigned Recruiter", "Rejection Type"
	//             ];
	//             const rows_data = data.map((row) => [
	//                 row.job_opening || "",
	//                 row.company_name || "",
	//                 row.candidate || "",
	//                 row.designation || "",
	//                 row.recruiter || "",
	//                 row.rejection_source || "",
	//             ]);
	//             export_to_excel(headers, rows_data, "Rejected_Candidates");
	//         });
	//     }, 300);
	// 	}
	function render_rejected_dialog(data) {
		function source_badge(source) {
			const color_map = {
				"Rejected By Client": "#e74c3c",
				"Client Screening Rejected": "#e67e22",
			};
			const color = color_map[source] || "#95a5a6";
			return `<span style="background:${color};color:#fff;padding:2px 8px;
            border-radius:10px;font-size:11px;white-space:nowrap;">${source}</span>`;
		}

		function link(href, label) {
			if (!label) return "—";
			return `<a href="${href}" target="_blank"
                   style="color:#5e64ff;font-weight:500;">${label}</a>`;
		}

		const rows = data.length
			? data
					.map(
						(row) => `
            <tr>
                <td>${link(`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`, row.job_opening)}</td>
                <td>${link(`/app/customer/${encodeURIComponent(row.company_name)}`, row.company_name)}</td>
                <td>${link(`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`, row.candidate)}</td>
                <td style="color:#555;font-size:12px;">${row.designation || "—"}</td>
                <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
                <td>${source_badge(row.rejection_source)}</td>
            </tr>`,
					)
					.join("")
			: `<tr><td colspan="6" class="text-center text-muted"
               style="padding:30px 0;">No rejected candidates found.</td></tr>`;

		const table_html = `
        ${excel_btn_html(data.length)}
        <div style="overflow:auto;max-height:65vh;">
            <table class="table table-bordered table-hover"
                   style="font-size:13px;margin:0;min-width:850px;">
                <thead>
                    <tr style="background:#f5f7fa;">
                        <th>Job Opening</th>
                        <th>Company</th>
                        <th>Candidate</th>
                        <th>Designation</th>
                        <th>Assigned Recruiter</th>
                        <th>Rejection Type</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

		const dialog = new frappe.ui.Dialog({
			title: `Rejected Candidates (${data.length})`,
			size: "extra-large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "table_html",
					options: table_html,
				},
			],
			primary_action_label: "Close",
			primary_action() {
				dialog.hide();
			},
		});

		dialog.show();

		const excel_rows = data.map((row) => [
			row.job_opening || "",
			row.company_name || "",
			row.candidate || "",
			row.designation || "",
			row.recruiter || "",
			row.rejection_source || "",
		]);
		bind_excel_btn(
			dialog,
			[
				"Job Opening",
				"Company",
				"Candidate",
				"Designation",
				"Assigned Recruiter",
				"Rejection Type",
			],
			excel_rows,
			"Rejected_Candidates",
		);
	}
	// frontend
	function show_interview_pipeline_dialog() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_interview_pipeline_detail",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
			},
			callback(r) {
				const data = r.message || [];
				render_interview_pipeline_dialog(data);
			},
		});
	}

	// function render_interview_pipeline_dialog(data) {
	// 	const int_color = {
	// 		"Selected For Offer": "#f39c12",
	// 		Offered: "#2980b9",
	// 		"Offer Accepted": "#1abc9c",
	// 	};

	// 	function badge(label, color) {
	// 		if (!label) return `<span class="text-muted">—</span>`;
	// 		return `<span style="background:${color};color:#fff;padding:2px 8px;
	//         border-radius:10px;font-size:11px;white-space:nowrap;">${label}</span>`;
	// 	}

	// 	function link(href, label) {
	// 		if (!label) return "—";
	// 		return `<a href="${href}" target="_blank"
	//            style="color:#5e64ff;font-weight:500;">${label}</a>`;
	// 	}

	// 	const rows = data.length
	// 		? data
	// 				.map(
	// 					(row) => `
	//         <tr>
	// 		<td>${link(
	// 			`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`,
	// 			row.job_opening,
	// 		)}</td>
	//             <td>${link(
	// 				`/app/customer/${encodeURIComponent(row.company_name)}`,
	// 				row.company_name,
	// 			)}</td>

	//             <td>${link(
	// 				`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`,
	// 				row.candidate,
	// 			)}</td>
	//             <td>${badge(
	// 				row.interview_stage,
	// 				int_color[row.interview_stage] || "#95a5a6",
	// 			)}</td>
	//             <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
	//             <td style="color:#888;font-size:12px;">${
	// 				row.offered_amount
	// 					? "₹" + Number(row.offered_amount).toLocaleString()
	// 					: "—"
	// 			}</td>
	//             <td style="color:#888;font-size:12px;">${row.joining_date || "—"}</td>
	//         </tr>`,
	// 				)
	// 				.join("")
	// 		: `<tr><td colspan="7" class="text-center text-muted"
	//            style="padding:30px 0;">No candidates in pipeline.</td></tr>`;
	// 				    const BTN_ID = "excel_interview_pipeline";

	// 	const table_html = `
	// 	        ${excel_btn_html(BTN_ID, data.length)}
	//     <div style="overflow:auto;max-height:65vh;">
	//         <table class="table table-bordered table-hover"
	//                style="font-size:13px;margin:0;min-width:900px;">
	//             <thead>
	//                 <tr style="background:#f5f7fa;">
	//                 <th>Job Opening</th>
	// 				<th>Company</th>
	//                     <th>Candidate</th>
	//                     <th>Stage</th>
	//                     <th>Assigned Recruiter(s)</th>
	//                     <th>Offered Amount</th>
	//                     <th>Joining Date</th>
	//                 </tr>
	//             </thead>
	//             <tbody>${rows}</tbody>
	//         </table>
	//     </div>`;

	// 	const dialog = new frappe.ui.Dialog({
	// 		title: `Interview Pipeline (${data.length})`,
	// 		size: "extra-large",
	// 		fields: [
	// 			{
	// 				fieldtype: "HTML",
	// 				fieldname: "table_html",
	// 				options: table_html,
	// 			},
	// 		],
	// 		primary_action_label: "Close",
	// 		primary_action() {
	// 			dialog.hide();
	// 		},
	// 	});

	// 	dialog.show();
	// 	 setTimeout(() => {
	//     document.getElementById(BTN_ID)?.addEventListener("click", () => {
	//         const headers = [
	//             "Job Opening", "Company", "Candidate",
	//             "Stage", "Assigned Recruiter(s)",
	//             "Offered Amount (₹)", "Joining Date"
	//         ];
	//         const rows_data = data.map((row) => [
	//             row.job_opening || "",
	//             row.company_name || "",
	//             row.candidate || "",
	//             row.interview_stage || "",
	//             row.recruiter || "",
	//             // ✅ Excel mein raw number daal do (currency format ke liye)
	//             row.offered_amount ? Number(row.offered_amount) : "",
	//             row.joining_date || "",
	//         ]);
	//         export_to_excel(headers, rows_data, "Interview_Pipeline");
	//     });
	// }, 300);
	// }
	function render_interview_pipeline_dialog(data) {
		const int_color = {
			"Selected For Offer": "#f39c12",
			Offered: "#2980b9",
			"Offer Accepted": "#1abc9c",
		};

		function badge(label, color) {
			if (!label) return `<span class="text-muted">—</span>`;
			return `<span style="background:${color};color:#fff;padding:2px 8px;
            border-radius:10px;font-size:11px;white-space:nowrap;">${label}</span>`;
		}

		function link(href, label) {
			if (!label) return "—";
			return `<a href="${href}" target="_blank"
               style="color:#5e64ff;font-weight:500;">${label}</a>`;
		}

		const rows = data.length
			? data
					.map(
						(row) => `
            <tr>
                <td>${link(`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`, row.job_opening)}</td>
                <td>${link(`/app/customer/${encodeURIComponent(row.company_name)}`, row.company_name)}</td>
                <td>${link(`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`, row.candidate)}</td>
                <td>${badge(row.interview_stage, int_color[row.interview_stage] || "#95a5a6")}</td>
                <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
                <td style="color:#888;font-size:12px;">${
					row.offered_amount
						? "₹" + Number(row.offered_amount).toLocaleString()
						: "—"
				}</td>
                <td style="color:#888;font-size:12px;">${row.joining_date || "—"}</td>
            </tr>`,
					)
					.join("")
			: `<tr><td colspan="7" class="text-center text-muted"
               style="padding:30px 0;">No candidates in pipeline.</td></tr>`;

		const table_html = `
        ${excel_btn_html(data.length)}
        <div style="overflow:auto;max-height:65vh;">
            <table class="table table-bordered table-hover"
                   style="font-size:13px;margin:0;min-width:900px;">
                <thead>
                    <tr style="background:#f5f7fa;">
                        <th>Job Opening</th>
                        <th>Company</th>
                        <th>Candidate</th>
                        <th>Stage</th>
                        <th>Assigned Recruiter(s)</th>
                        <th>Offered Amount</th>
                        <th>Joining Date</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

		const dialog = new frappe.ui.Dialog({
			title: `Interview Pipeline (${data.length})`,
			size: "extra-large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "table_html",
					options: table_html,
				},
			],
			primary_action_label: "Close",
			primary_action() {
				dialog.hide();
			},
		});

		dialog.show();

		const excel_rows = data.map((row) => [
			row.job_opening || "",
			row.company_name || "",
			row.candidate || "",
			row.interview_stage || "",
			row.recruiter || "",
			// ✅ Raw number for Excel calculations
			row.offered_amount ? Number(row.offered_amount) : "",
			row.joining_date || "",
		]);
		bind_excel_btn(
			dialog,
			[
				"Job Opening",
				"Company",
				"Candidate",
				"Stage",
				"Assigned Recruiter(s)",
				"Offered Amount (₹)",
				"Joining Date",
			],
			excel_rows,
			"Interview_Pipeline",
		);
	}
	// ═══════════════════════════════════════════════
	// AGEING CRITICAL DIALOG
	// ═══════════════════════════════════════════════

	function show_ageing_critical_dialog() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_ageing_critical_detail",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
			},
			callback(r) {
				const data = r.message || [];
				render_ageing_critical_dialog(data);
			},
		});
	}

	// function render_ageing_critical_dialog(data) {
	// 	const priority_color = {
	// 		Critical: "#e74c3c",
	// 		High: "#e67e22",
	// 		Medium: "#f39c12",
	// 		Low: "#95a5a6",
	// 	};

	// 	function days_badge(days) {
	// 		// Ageing critical - sab 30+ days ke hain
	// 		let color = "#e74c3c"; // red - 30+ days
	// 		if (days > 60) color = "#8e44ad"; // purple - 60+ days very critical
	// 		return `<span style="background:${color};color:#fff;padding:2px 8px;
	//         border-radius:10px;font-size:11px;font-weight:600;">${days}d</span>`;
	// 	}

	// 	function priority_badge(label) {
	// 		if (!label || label === "—")
	// 			return `<span class="text-muted">—</span>`;
	// 		const color = priority_color[label] || "#95a5a6";
	// 		return `<span style="background:${color};color:#fff;padding:2px 8px;
	//         border-radius:10px;font-size:11px;">${label}</span>`;
	// 	}

	// 	function link(href, label) {
	// 		if (!label) return "—";
	// 		return `<a href="${href}" target="_blank"
	//                style="color:#5e64ff;font-weight:500;">${label}</a>`;
	// 	}

	// 	const rows = data.length
	// 		? data
	// 				.map(
	// 					(row) => `
	//         <tr>
	//             <td>${link(
	// 				`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`,
	// 				row.job_opening,
	// 			)}</td>
	//             <td>${link(
	// 				`/app/customer/${encodeURIComponent(row.company_name)}`,
	// 				row.company_name,
	// 			)}</td>
	//             <td style="color:#555;font-size:12px;">${row.designation || "—"}</td>
	//             <td style="color:#555;font-size:12px;">${row.recruiters || "—"}</td>
	//             <td style="color:#555;font-size:12px;">${row.creation || "—"}</td>
	//             <td>${days_badge(row.days_open)}</td>
	//             <td>${priority_badge(row.priority)}</td>
	//         </tr>`,
	// 				)
	// 				.join("")
	// 		: `<tr><td colspan="7" class="text-center text-muted"
	//            style="padding:30px 0;">No critical ageing jobs found.</td></tr>`;
	// 				    const BTN_ID = "excel_ageing_critical";

	// 	const table_html = `
	// 	        ${excel_btn_html(BTN_ID, data.length)}

	//     <div style="overflow:auto;max-height:65vh;">
	//         <table class="table table-bordered table-hover"
	//                style="font-size:13px;margin:0;min-width:950px;">
	//             <thead>
	//                 <tr style="background:#fff3f3;">
	//                     <th>Job Opening</th>
	//                     <th>Company</th>
	//                     <th>Designation</th>
	//                     <th>Assigned Recruiter(s)</th>
	//                     <th>Posted On</th>
	//                     <th>Days Open</th>
	//                     <th>Priority</th>
	//                 </tr>
	//             </thead>
	//             <tbody>${rows}</tbody>
	//         </table>
	//     </div>`;

	// 	const dialog = new frappe.ui.Dialog({
	// 		title: `⚠️ Ageing Critical Jobs (${data.length})`,
	// 		size: "extra-large",
	// 		fields: [
	// 			{
	// 				fieldtype: "HTML",
	// 				fieldname: "table_html",
	// 				options: table_html,
	// 			},
	// 		],
	// 		primary_action_label: "Close",
	// 		primary_action() {
	// 			dialog.hide();
	// 		},
	// 	});

	// 	dialog.show();
	// 	setTimeout(() => {
	//     document.getElementById(BTN_ID)?.addEventListener("click", () => {
	//         const headers = [
	//             "Job Opening", "Company", "Designation",
	//             "Assigned Recruiter(s)", "Posted On",
	//             "Days Open", "Priority"
	//         ];
	//         const rows_data = data.map((row) => [
	//             row.job_opening || "",
	//             row.company_name || "",
	//             row.designation || "",
	//             row.recruiters || "",
	//             row.creation || "",
	//             row.days_open || 0,
	//             row.priority || "",
	//         ]);
	//         export_to_excel(headers, rows_data, "Ageing_Critical_Jobs");
	//     });
	// }, 300);
	// }
	function render_ageing_critical_dialog(data) {
		const priority_color = {
			Critical: "#e74c3c",
			High: "#e67e22",
			Medium: "#f39c12",
			Low: "#95a5a6",
		};

		function days_badge(days) {
			let color = "#e74c3c";
			if (days > 60) color = "#8e44ad";
			return `<span style="background:${color};color:#fff;padding:2px 8px;
            border-radius:10px;font-size:11px;font-weight:600;">${days}d</span>`;
		}

		function priority_badge(label) {
			if (!label || label === "—")
				return `<span class="text-muted">—</span>`;
			const color = priority_color[label] || "#95a5a6";
			return `<span style="background:${color};color:#fff;padding:2px 8px;
            border-radius:10px;font-size:11px;">${label}</span>`;
		}

		function link(href, label) {
			if (!label) return "—";
			return `<a href="${href}" target="_blank"
                   style="color:#5e64ff;font-weight:500;">${label}</a>`;
		}

		const rows = data.length
			? data
					.map(
						(row) => `
            <tr>
                <td>${link(`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`, row.job_opening)}</td>
                <td>${link(`/app/customer/${encodeURIComponent(row.company_name)}`, row.company_name)}</td>
                <td style="color:#555;font-size:12px;">${row.designation || "—"}</td>
                <td style="color:#555;font-size:12px;">${row.recruiters || "—"}</td>
                <td style="color:#555;font-size:12px;">${row.creation || "—"}</td>
                <td>${days_badge(row.days_open)}</td>
                <td>${priority_badge(row.priority)}</td>
            </tr>`,
					)
					.join("")
			: `<tr><td colspan="7" class="text-center text-muted"
               style="padding:30px 0;">No critical ageing jobs found.</td></tr>`;

		const table_html = `
        ${excel_btn_html(data.length)}
        <div style="overflow:auto;max-height:65vh;">
            <table class="table table-bordered table-hover"
                   style="font-size:13px;margin:0;min-width:950px;">
                <thead>
                    <tr style="background:#fff3f3;">
                        <th>Job Opening</th>
                        <th>Company</th>
                        <th>Designation</th>
                        <th>Assigned Recruiter(s)</th>
                        <th>Posted On</th>
                        <th>Days Open</th>
                        <th>Priority</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

		const dialog = new frappe.ui.Dialog({
			title: `⚠️ Ageing Critical Jobs (${data.length})`,
			size: "extra-large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "table_html",
					options: table_html,
				},
			],
			primary_action_label: "Close",
			primary_action() {
				dialog.hide();
			},
		});

		dialog.show();

		const excel_rows = data.map((row) => [
			row.job_opening || "",
			row.company_name || "",
			row.designation || "",
			row.recruiters || "",
			row.creation || "",
			row.days_open || 0,
			row.priority || "",
		]);
		bind_excel_btn(
			dialog,
			[
				"Job Opening",
				"Company",
				"Designation",
				"Assigned Recruiter(s)",
				"Posted On",
				"Days Open",
				"Priority",
			],
			excel_rows,
			"Ageing_Critical_Jobs",
		);
	}
	// ═══════════════════════════════════════════════
	// JOINED DIALOG
	// ═══════════════════════════════════════════════

	function show_joined_dialog() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_joined_detail",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
				status: state.status, // ← ADD THIS
			},
			callback(r) {
				const data = r.message || [];
				render_joined_dialog(data);
			},
		});
	}

	// function render_joined_dialog(data) {
	// 	function link(href, label) {
	// 		if (!label) return "—";
	// 		return `<a href="${href}" target="_blank"
	//                style="color:#5e64ff;font-weight:500;">${label}</a>`;
	// 	}

	// 	const rows = data.length
	// 		? data
	// 				.map(
	// 					(row) => `
	//         <tr>
	//             <td>${link(
	// 				`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`,
	// 				row.job_opening,
	// 			)}</td>
	//             <td>${link(
	// 				`/app/customer/${encodeURIComponent(row.company_name)}`,
	// 				row.company_name,
	// 			)}</td>
	//             <td>${link(
	// 				`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`,
	// 				row.candidate,
	// 			)}</td>
	//             <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
	//             <td style="color:#555;font-size:12px;">${row.joining_date || "—"}</td>
	//             <td style="color:#555;font-size:12px;">${
	// 				row.offered_amount
	// 					? "₹" + Number(row.offered_amount).toLocaleString()
	// 					: "—"
	// 			}</td>
	//         </tr>`,
	// 				)
	// 				.join("")
	// 		: `<tr><td colspan="6" class="text-center text-muted"
	//            style="padding:30px 0;">No joined candidates found.</td></tr>`;
	// const BTN_ID = "excel_joined";

	// 	const table_html = `
	// 	        ${excel_btn_html(BTN_ID, data.length)}
	//     <div style="overflow:auto;max-height:65vh;">
	//         <table class="table table-bordered table-hover"
	//                style="font-size:13px;margin:0;min-width:850px;">
	//             <thead>
	//                 <tr style="background:#f5f7fa;">
	//                     <th>Job Opening</th>
	//                     <th>Company</th>
	//                     <th>Candidate</th>
	//                     <th>Assigned Recruiter(s)</th>
	//                     <th>Joining Date</th>
	//                     <th>Offered Amount (Yearly)</th>
	//                 </tr>
	//             </thead>
	//             <tbody>${rows}</tbody>
	//         </table>
	//     </div>`;

	// 	const dialog = new frappe.ui.Dialog({
	// 		title: `Joined Candidates (${data.length})`,
	// 		size: "extra-large",
	// 		fields: [
	// 			{
	// 				fieldtype: "HTML",
	// 				fieldname: "table_html",
	// 				options: table_html,
	// 			},
	// 		],
	// 		primary_action_label: "Close",
	// 		primary_action() {
	// 			dialog.hide();
	// 		},
	// 	});

	// 	dialog.show();
	// 	setTimeout(() => {
	//     document.getElementById(BTN_ID)?.addEventListener("click", () => {
	//         const headers = [
	//             "Job Opening", "Company", "Candidate",
	//             "Assigned Recruiter(s)", "Joining Date",
	//             "Offered Amount (Yearly ₹)"
	//         ];
	//         const rows_data = data.map((row) => [
	//             row.job_opening || "",
	//             row.company_name || "",
	//             row.candidate || "",
	//             row.recruiter || "",
	//             row.joining_date || "",
	//             // ✅ Excel mein raw number - better for calculations
	//             row.offered_amount ? Number(row.offered_amount) : "",
	//         ]);
	//         export_to_excel(headers, rows_data, "Joined_Candidates");
	//     });
	// }, 300);
	// }
	function render_joined_dialog(data) {
		function link(href, label) {
			if (!label) return "—";
			return `<a href="${href}" target="_blank"
                   style="color:#5e64ff;font-weight:500;">${label}</a>`;
		}

		const rows = data.length
			? data
					.map(
						(row) => `
            <tr>
                <td>${link(`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`, row.job_opening)}</td>
                <td>${link(`/app/customer/${encodeURIComponent(row.company_name)}`, row.company_name)}</td>
                <td>${link(`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`, row.candidate)}</td>
                <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
                <td style="color:#555;font-size:12px;">${row.joining_date || "—"}</td>
                <td style="color:#555;font-size:12px;">${
					row.offered_amount
						? "₹" + Number(row.offered_amount).toLocaleString()
						: "—"
				}</td>
            </tr>`,
					)
					.join("")
			: `<tr><td colspan="6" class="text-center text-muted"
               style="padding:30px 0;">No joined candidates found.</td></tr>`;

		const table_html = `
        ${excel_btn_html(data.length)}
        <div style="overflow:auto;max-height:65vh;">
            <table class="table table-bordered table-hover"
                   style="font-size:13px;margin:0;min-width:850px;">
                <thead>
                    <tr style="background:#f5f7fa;">
                        <th>Job Opening</th>
                        <th>Company</th>
                        <th>Candidate</th>
                        <th>Assigned Recruiter(s)</th>
                        <th>Joining Date</th>
                        <th>Offered Amount (Yearly)</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

		const dialog = new frappe.ui.Dialog({
			title: `Joined Candidates (${data.length})`,
			size: "extra-large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "table_html",
					options: table_html,
				},
			],
			primary_action_label: "Close",
			primary_action() {
				dialog.hide();
			},
		});

		dialog.show();

		const excel_rows = data.map((row) => [
			row.job_opening || "",
			row.company_name || "",
			row.candidate || "",
			row.recruiter || "",
			row.joining_date || "",
			// ✅ Raw number for Excel
			row.offered_amount ? Number(row.offered_amount) : "",
		]);
		bind_excel_btn(
			dialog,
			[
				"Job Opening",
				"Company",
				"Candidate",
				"Assigned Recruiter(s)",
				"Joining Date",
				"Offered Amount (Yearly ₹)",
			],
			excel_rows,
			"Joined_Candidates",
		);
	}

	// ═══════════════════════════════════════════════
	// JOINED AND LEFT DIALOG
	// ═══════════════════════════════════════════════

	function show_joined_left_dialog() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_joined_left_detail",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
				status: state.status, // ← ADD THIS
			},
			callback(r) {
				const data = r.message || [];
				render_joined_left_dialog(data);
			},
		});
	}

	// function render_joined_left_dialog(data) {
	// 	function link(href, label) {
	// 		if (!label) return "—";
	// 		return `<a href="${href}" target="_blank"
	//                style="color:#5e64ff;font-weight:500;">${label}</a>`;
	// 	}

	// 	function replacement_badge(within_policy) {
	// 		if (within_policy === 1 || within_policy === true) {
	// 			return `<span style="background:#27ae60;color:#fff;padding:2px 8px;
	//             border-radius:10px;font-size:11px;">Within Policy</span>`;
	// 		}
	// 		return `<span style="background:#e74c3c;color:#fff;padding:2px 8px;
	//             border-radius:10px;font-size:11px;">Outside Policy</span>`;
	// 	}

	// 	const rows = data.length
	// 		? data
	// 				.map(
	// 					(row) => `
	//         <tr>
	//             <td>${link(
	// 				`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`,
	// 				row.job_opening,
	// 			)}</td>
	//             <td>${link(
	// 				`/app/customer/${encodeURIComponent(row.company_name)}`,
	// 				row.company_name,
	// 			)}</td>
	//             <td>${link(
	// 				`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`,
	// 				row.candidate,
	// 			)}</td>
	//             <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
	//             <td style="color:#555;font-size:12px;">${row.joining_date || "—"}</td>
	//             <td style="color:#555;font-size:12px;">${row.candidate_left_date || "—"}</td>
	//             <td style="text-align:center;">
	//                 ${row.days_before_left != null ? row.days_before_left + "d" : "—"}
	//             </td>
	//             <td>${replacement_badge(row.within_replacement_policy)}</td>
	//         </tr>`,
	// 				)
	// 				.join("")
	// 		: `<tr><td colspan="8" class="text-center text-muted"
	//            style="padding:30px 0;">No candidates found.</td></tr>`;
	// const BTN_ID = "excel_joined_left";

	// 	const table_html = `
	// 	        ${excel_btn_html(BTN_ID, data.length)}
	//     <div style="overflow:auto;max-height:65vh;">
	//         <table class="table table-bordered table-hover"
	//                style="font-size:13px;margin:0;min-width:950px;">
	//             <thead>
	//                 <tr style="background:#f5f7fa;">
	//                     <th>Job Opening</th>
	//                     <th>Company</th>
	//                     <th>Candidate</th>
	//                     <th>Assigned Recruiter(s)</th>
	//                     <th>Joining Date</th>
	//                     <th>Left Date</th>
	//                     <th>Days Stayed</th>
	//                     <th>Replacement Policy</th>
	//                 </tr>
	//             </thead>
	//             <tbody>${rows}</tbody>
	//         </table>
	//     </div>`;

	// 	const dialog = new frappe.ui.Dialog({
	// 		title: `Joined And Left (${data.length})`,
	// 		size: "extra-large",
	// 		fields: [
	// 			{
	// 				fieldtype: "HTML",
	// 				fieldname: "table_html",
	// 				options: table_html,
	// 			},
	// 		],
	// 		primary_action_label: "Close",
	// 		primary_action() {
	// 			dialog.hide();
	// 		},
	// 	});

	// 	dialog.show();
	// }
	function render_joined_left_dialog(data) {
		function link(href, label) {
			if (!label) return "—";
			return `<a href="${href}" target="_blank"
                   style="color:#5e64ff;font-weight:500;">${label}</a>`;
		}

		function replacement_badge(within_policy) {
			if (within_policy === 1 || within_policy === true) {
				return `<span style="background:#27ae60;color:#fff;padding:2px 8px;
                border-radius:10px;font-size:11px;">Within Policy</span>`;
			}
			return `<span style="background:#e74c3c;color:#fff;padding:2px 8px;
                border-radius:10px;font-size:11px;">Outside Policy</span>`;
		}

		const rows = data.length
			? data
					.map(
						(row) => `
            <tr>
                <td>${link(`/app/dkp_job_opening/${encodeURIComponent(row.job_opening)}`, row.job_opening)}</td>
                <td>${link(`/app/customer/${encodeURIComponent(row.company_name)}`, row.company_name)}</td>
                <td>${link(`/app/dkp_candidate/${encodeURIComponent(row.candidate)}`, row.candidate)}</td>
                <td style="color:#555;font-size:12px;">${row.recruiter || "—"}</td>
                <td style="color:#555;font-size:12px;">${row.joining_date || "—"}</td>
                <td style="color:#555;font-size:12px;">${row.candidate_left_date || "—"}</td>
                <td style="text-align:center;">${row.days_before_left != null ? row.days_before_left + "d" : "—"}</td>
                <td>${replacement_badge(row.within_replacement_policy)}</td>
            </tr>`,
					)
					.join("")
			: `<tr><td colspan="8" class="text-center text-muted"
               style="padding:30px 0;">No candidates found.</td></tr>`;

		const table_html = `
        ${excel_btn_html(data.length)}
        <div style="overflow:auto;max-height:65vh;">
            <table class="table table-bordered table-hover"
                   style="font-size:13px;margin:0;min-width:950px;">
                <thead>
                    <tr style="background:#f5f7fa;">
                        <th>Job Opening</th>
                        <th>Company</th>
                        <th>Candidate</th>
                        <th>Assigned Recruiter(s)</th>
                        <th>Joining Date</th>
                        <th>Left Date</th>
                        <th>Days Stayed</th>
                        <th>Replacement Policy</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

		const dialog = new frappe.ui.Dialog({
			title: `Joined And Left (${data.length})`,
			size: "extra-large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "table_html",
					options: table_html,
				},
			],
			primary_action_label: "Close",
			primary_action() {
				dialog.hide();
			},
		});

		dialog.show();

		const excel_rows = data.map((row) => [
			row.job_opening || "",
			row.company_name || "",
			row.candidate || "",
			row.recruiter || "",
			row.joining_date || "",
			row.candidate_left_date || "",
			row.days_before_left != null ? row.days_before_left : "",
			// ✅ Clean text for Excel
			row.within_replacement_policy ? "Within Policy" : "Outside Policy",
		]);
		bind_excel_btn(
			dialog,
			[
				"Job Opening",
				"Company",
				"Candidate",
				"Assigned Recruiter(s)",
				"Joining Date",
				"Left Date",
				"Days Stayed",
				"Replacement Policy",
			],
			excel_rows,
			"Joined_And_Left",
		);
	}
	// ═══════════════════════════════════════════════════════════════════════
	// QUICK DATE BUTTONS
	// ═══════════════════════════════════════════════════════════════════════

	$body.find(".quick-date-btn").on("click", function () {
		const range = $(this).data("range");
		$body.find(".quick-date-btn").removeClass("active");
		$(this).addClass("active");

		const today = frappe.datetime.get_today();
		let from_date = null;
		let to_date = today;

		switch (range) {
			case "today":
				from_date = today;
				break;
			case "week":
				from_date = frappe.datetime.add_days(today, -7);
				break;
			case "month":
				from_date = frappe.datetime.add_months(today, -1);
				break;
			case "quarter":
				from_date = frappe.datetime.add_months(today, -3);
				break;
			case "all":
				from_date = null;
				to_date = null;
				break;
		}

		from_date_control.set_value(from_date || "");
		to_date_control.set_value(to_date || "");
		state.from_date = from_date;
		state.to_date = to_date;

		refresh_dashboard();
	});

	// ═══════════════════════════════════════════════════════════════════════
	// MAIN REFRESH FUNCTION
	// ═══════════════════════════════════════════════════════════════════════

	function refresh_dashboard() {
		load_kpis();
		load_master_report();
		load_company_summary();
		load_recruiter_performance();
		load_ageing_analysis();
	}

	// ═══════════════════════════════════════════════════════════════════════
	// LOAD KPIs
	// ═══════════════════════════════════════════════════════════════════════

	function load_kpis() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_dashboard_kpis",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
				status: state.status,
			},
			callback(r) {
				const k = r.message || {};

				// ALL Jobs KPIs
				$kpi_joined.text(k.total_joined || 0);
				$kpi_joined_left.text(k.total_joined_left || 0);
				$kpi_conversion.text((k.conversion_rate || 0) + "%");

				// OPEN Jobs KPIs
				$kpi_open_jobs.text(k.open_jobs || 0);
				$kpi_submitted.text(k.total_submitted || 0);
				$kpi_rejected.text(k.total_rejected || 0);
				$kpi_interview.text(k.interview_pipeline || 0);
				$kpi_ageing_critical.text(k.ageing_critical || 0);
				current_all_job_names = k.all_job_names || [];
				current_open_job_names = k.open_job_names || [];
			},
		});
	}

	// ═══════════════════════════════════════════════════════════════════════
	// LOAD MASTER REPORT
	// ═══════════════════════════════════════════════════════════════════════

	function load_master_report() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_master_report",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
				status: state.status,
			},
			freeze: true,
			freeze_message: __("Loading Master Report..."),
			callback(r) {
				console.log("Master Report Response:", r); // ✅ ADD THIS
				console.log("Rows:", r.message);
				const rows = r.message || [];
				masterRawData = rows;
				render_master_table(rows);
				$master_count.text(rows.length);
			},

			error(r) {
				console.log("Master Report Error:", r); // ✅ ADD THIS
			},
		});
	}

	function render_master_table(rows) {
		$master_table.empty();

		const rowsRef = rows;

		const columns = [
			{ name: "#", width: 50 },
			{
				name: "Job Opening",
				width: 160,
				format: (value) => {
					const name = value || "";
					const url = `/app/dkp_job_opening/${encodeURIComponent(name)}`;
					const label = frappe.utils.escape_html(name || "-");
					return `<a href="${url}" target="_blank" style="color:#2490ef;font-weight:600;">${label}</a>`;
				},
			},
			{ name: "Company", width: 140 },
			{ name: "Designation", width: 120 },
			{ name: "Positions", width: 70 },
			{
				name: "Submitted",
				width: 80,
				format: (value) => {
					const count = value || 0;
					if (count > 0) {
						return `<span class="clickable-count">${count}</span>`;
					}
					return count;
				},
			},
			{
				name: "Rejected",
				width: 80,
				format: (value) => {
					const count = value || 0;
					if (count > 0) {
						return `<span style="color:#dc2626;font-weight:600;">${count}</span>`;
					}
					return count;
				},
			},
			{
				name: "Interview",
				width: 80,
				format: (value) => {
					const count = value || 0;
					if (count > 0) {
						return `<span style="color:#f97316;font-weight:600;">${count}</span>`;
					}
					return count;
				},
			},
			{
				name: "Joined",
				width: 70,
				format: (value) => {
					const count = value || 0;
					if (count > 0) {
						return `<span style="color:#16a34a;font-weight:600;">${count}</span>`;
					}
					return count;
				},
			},
			{
				name: "Joined & Left",
				width: 80,
				format: (value) => {
					const count = value || 0;
					if (count > 0) {
						return `<span style="color:#ca8a04;font-weight:600;">${count}</span>`;
					}
					return count;
				},
			},
			{
				name: "Ageing",
				width: 80,
				format: (value) => {
					const days = parseInt(value) || 0;
					let badgeClass = "green";
					if (days > 30) badgeClass = "red";
					else if (days > 15) badgeClass = "yellow";
					return `<span class="ageing-badge ${badgeClass}">${days} days</span>`;
				},
			},
			{ name: "Recruiter(s)", width: 150 },
			{
				name: "Status",
				width: 100,
				format: (value) => {
					const status = value || "";
					let badge_class = "badge-secondary";
					if (status === "Open") badge_class = "badge-success";
					else if (status === "On Hold")
						badge_class = "badge-warning";
					else if (status === "Closed – Hired")
						badge_class = "badge-info";
					else if (status === "Closed – Cancelled")
						badge_class = "badge-danger";
					return `<span class="badge ${badge_class}">${frappe.utils.escape_html(status)}</span>`;
				},
			},
			{
				name: "Priority",
				width: 80,
				format: (value) => {
					const priority = value || "";
					let color = "#6b7280";
					if (priority === "Critical") color = "#dc2626";
					else if (priority === "High") color = "#f97316";
					else if (priority === "Medium") color = "#eab308";
					else if (priority === "Low") color = "#22c55e";
					return `<span style="color:${color};font-weight:500;">${frappe.utils.escape_html(priority)}</span>`;
				},
			},
		];

		const tableData = rows.map((row, index) => [
			index + 1,
			row.job_opening || "",
			row.company_name || "",
			row.designation || "",
			row.positions || 0,
			row.submitted || 0,
			row.rejected || 0,
			row.interview_pipeline || 0,
			row.joined || 0,
			row.replaced || 0,
			row.ageing_days || 0,
			row.recruiters || "",
			row.status || "",
			row.priority || "",
		]);
		console.log("Table data prepared:", tableData.length);

		function getTableLayout() {
			return window.innerWidth < 768 ? "fixed" : "fluid";
		}

		if (masterDataTable) {
			masterDataTable.destroy();
		}

		try {
			masterDataTable = new frappe.DataTable($master_table[0], {
				columns,
				data: tableData,
				inlineFilters: true,
				noDataMessage: __("No job openings found"),
				layout: getTableLayout(),
				serialNoColumn: false,
				editing: false,
			});
			console.log("DataTable created successfully:", masterDataTable);
		} catch (e) {
			console.error("DataTable creation error:", e);
		}

		// Handle window resize
		let resizeTimeout;
		window.addEventListener("resize", () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				if (masterDataTable) {
					masterDataTable.destroy();
					masterDataTable = new frappe.DataTable($master_table[0], {
						columns,
						data: tableData,
						inlineFilters: true,
						noDataMessage: __("No job openings found"),
						layout: getTableLayout(),
						serialNoColumn: false,
						editing: false,
					});
				}
			}, 300);
		});
	}

	// ═══════════════════════════════════════════════════════════════════════
	// LOAD COMPANY SUMMARY
	// ═══════════════════════════════════════════════════════════════════════

	function load_company_summary() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_company_summary",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
				status: state.status,
			},
			callback(r) {
				const rows = r.message || [];
				companyRawData = rows;
				render_company_table(rows);
				$company_count.text(rows.length);
			},
		});
	}

	function render_company_table(rows) {
		$company_table.empty();

		const columns = [
			{ name: "#", width: 50 },
			{ name: "Company", width: 180 },
			{ name: "Assigned Recruiter(s)", width: 180 },
			{ name: "Open Jobs", width: 90 },
			{ name: "Total Positions", width: 110 },
			{ name: "Submitted", width: 90 },
			{ name: "Rejected", width: 90 },
			{ name: "Interview", width: 90 },
			{ name: "Joined", width: 80 },
			{ name: "Joined & Left", width: 90 },
			{
				name: "Conversion %",
				width: 100,
				format: (value) => {
					const pct = parseFloat(value) || 0;
					let color = "#6b7280";
					if (pct >= 20) color = "#16a34a";
					else if (pct >= 10) color = "#eab308";
					else if (pct > 0) color = "#f97316";
					return `<span style="color:${color};font-weight:600;">${pct.toFixed(1)}%</span>`;
				},
			},
		];

		const tableData = rows.map((row, index) => [
			index + 1,
			row.company_name || "",
			row.recruiters || "—",
			row.open_jobs || 0,
			row.total_positions || 0,
			row.submitted || 0,
			row.rejected || 0,
			row.interview_pipeline || 0,
			row.joined || 0,
			row.replaced || 0,
			row.conversion_rate || 0,
		]);

		if (companyDataTable) {
			companyDataTable.destroy();
		}

		companyDataTable = new frappe.DataTable($company_table[0], {
			columns,
			data: tableData,
			inlineFilters: true,
			noDataMessage: __("No company data found"),
			layout: window.innerWidth < 768 ? "fixed" : "fluid",
			serialNoColumn: false,
			editing: false,
		});
	}

	// ═══════════════════════════════════════════════════════════════════════
	// LOAD RECRUITER PERFORMANCE
	// ═══════════════════════════════════════════════════════════════════════

	function load_recruiter_performance() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_recruiter_performance",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
				status: state.status,
			},
			callback(r) {
				const rows = r.message || [];
				recruiterRawData = rows;
				render_recruiter_table(rows);
				$recruiter_count.text(rows.length);
			},
		});
	}

	function render_recruiter_table(rows) {
		$recruiter_table.empty();

		const columns = [
			{ name: "#", width: 50 },
			{ name: "Recruiter", width: 180 },
			{ name: "Total Jobs Assigned", width: 120 },
			{ name: "Total Candidates Submitted", width: 150 },
			{ name: "Total Rejected", width: 100 },
			{ name: "All Interviews", width: 100 },
			{ name: "Total Joined", width: 80 },
			{
				name: "Conversion %",
				width: 100,
				format: (value) => {
					const pct = parseFloat(value) || 0;
					let color = "#6b7280";
					if (pct >= 20) color = "#16a34a";
					else if (pct >= 10) color = "#eab308";
					else if (pct > 0) color = "#f97316";
					return `<span style="color:${color};font-weight:600;">${pct.toFixed(1)}%</span>`;
				},
			},
		];

		const tableData = rows.map((row, index) => [
			index + 1,
			row.recruiter_name || "",
			row.jobs_assigned || 0,
			row.submitted || 0,
			row.rejected || 0,
			row.interview_pipeline || 0,
			row.joined || 0,
			row.conversion_rate || 0,
		]);

		if (recruiterDataTable) {
			recruiterDataTable.destroy();
		}

		recruiterDataTable = new frappe.DataTable($recruiter_table[0], {
			columns,
			data: tableData,
			inlineFilters: true,
			noDataMessage: __("No recruiter data found"),
			layout: window.innerWidth < 768 ? "fixed" : "fluid",
			serialNoColumn: false,
			editing: false,
		});
	}

	// ═══════════════════════════════════════════════════════════════════════
	// LOAD AGEING ANALYSIS
	// ═══════════════════════════════════════════════════════════════════════

	function load_ageing_analysis() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.page.master_report.master_report.get_ageing_analysis",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				company: state.company,
				recruiter: state.recruiter,
			},
			callback(r) {
				const data = r.message || {};

				// Update buckets
				$ageing_0_15.text(data.bucket_0_15 || 0);
				$ageing_16_30.text(data.bucket_16_30 || 0);
				$ageing_30_plus.text(data.bucket_30_plus || 0);

				// Render critical table
				render_ageing_critical_table(data.critical_jobs || []);
			},
		});
	}

	function render_ageing_critical_table(rows) {
		$ageing_table.empty();

		const columns = [
			{ name: "#", width: 50 },
			{
				name: "Job Opening",
				width: 160,
				format: (value) => {
					const name = value || "";
					const url = `/app/dkp_job_opening/${encodeURIComponent(name)}`;
					return `<a href="${url}" target="_blank" style="color:#dc2626;font-weight:600;">${frappe.utils.escape_html(name)}</a>`;
				},
			},
			{ name: "Company", width: 140 },
			{ name: "Designation", width: 120 },
			{
				name: "Ageing (Days)",
				width: 100,
				format: (value) => {
					return `<span class="ageing-badge red">${value} days</span>`;
				},
			},
			{ name: "Submitted", width: 80 },
			{ name: "Interview", width: 80 },
			{ name: "Status", width: 100 },
			{ name: "Recruiter(s)", width: 150 },
		];

		const tableData = rows.map((row, index) => [
			index + 1,
			row.job_opening || "",
			row.company_name || "",
			row.designation || "",
			row.ageing_days || 0,
			row.submitted || 0,
			row.interview_pipeline || 0,
			row.status || "",
			row.recruiters || "",
		]);

		if (ageingDataTable) {
			ageingDataTable.destroy();
		}

		ageingDataTable = new frappe.DataTable($ageing_table[0], {
			columns,
			data: tableData,
			inlineFilters: true,
			noDataMessage: __("No critical ageing jobs found "),
			layout: window.innerWidth < 768 ? "fixed" : "fluid",
			serialNoColumn: false,
			editing: false,
		});
	}

	// ═══════════════════════════════════════════════════════════════════════
	// EXCEL DOWNLOAD
	// ═══════════════════════════════════════════════════════════════════════

	function get_current_tab() {
		const activeTab = $body
			.find(".master-nav-tabs li.active a")
			.attr("href");
		return activeTab;
	}

	function download_master_excel() {
		const currentTab = get_current_tab();
		let dataTable = null;
		let headers = [];
		let filename = "export.xls";

		switch (currentTab) {
			case "#tab-master-report":
				dataTable = masterDataTable;
				headers = [
					"#",
					"Job Opening",
					"Company",
					"Designation",
					"Positions",
					"Submitted",
					"Rejected",
					"Interview",
					"Joined",
					"Replaced",
					"Ageing (Days)",
					"Recruiter(s)",
					"Status",
					"Priority",
				];
				filename = "master_report.xls";
				break;
			case "#tab-company-summary":
				dataTable = companyDataTable;
				headers = [
					"#",
					"Company",
					"Open Jobs",
					"Total Positions",
					"Submitted",
					"Rejected",
					"Interview",
					"Joined",
					"Replaced",
					"Conversion %",
				];
				filename = "company_summary.xls";
				break;
			case "#tab-recruiter-performance":
				dataTable = recruiterDataTable;
				headers = [
					"#",
					"Recruiter",
					"Jobs Assigned",
					"Candidates Submitted",
					"Rejected",
					"Interview",
					"Joined",
					"Conversion %",
				];
				filename = "recruiter_performance.xls";
				break;
			case "#tab-ageing-analysis":
				dataTable = ageingDataTable;
				headers = [
					"#",
					"Job Opening",
					"Company",
					"Designation",
					"Ageing (Days)",
					"Submitted",
					"Interview",
					"Status",
					"Recruiter(s)",
				];
				filename = "ageing_critical.xls";
				break;
		}

		if (!dataTable) {
			frappe.msgprint(__("No data available to download."));
			return;
		}

		let rowsToExport = [];

		try {
			const dm = dataTable.datamanager;
			const allRows = dm.getRows();
			const totalRows = allRows.length;

			const rowViewOrder = dm.rowViewOrder || [];
			const filteredIndices = dm.getFilteredRowIndices() || [];

			let finalIndices = [];

			const isSorted =
				rowViewOrder.length > 0 &&
				!rowViewOrder.every((val, idx) => val === idx);
			const isFiltered =
				filteredIndices.length > 0 &&
				filteredIndices.length < totalRows;

			if (isSorted && isFiltered) {
				const filterSet = new Set(filteredIndices);
				finalIndices = rowViewOrder.filter((idx) => filterSet.has(idx));
			} else if (isSorted) {
				finalIndices = rowViewOrder;
			} else if (isFiltered) {
				finalIndices = filteredIndices;
			} else {
				finalIndices = allRows.map((_, i) => i);
			}

			rowsToExport = finalIndices.map((i) => allRows[i]);
		} catch (e) {
			console.log("Error getting rows:", e);
			frappe.msgprint(__("Error getting data."));
			return;
		}

		if (!rowsToExport || rowsToExport.length === 0) {
			frappe.msgprint(__("No data to download."));
			return;
		}

		const excelRows = rowsToExport.map((row) => {
			return row.map((cell, idx) => getCellValue(cell));
		});

		download_excel_from_rows(filename, headers, excelRows);

		frappe.show_alert({
			message: __("Downloaded {0} records", [excelRows.length]),
			indicator: "green",
		});
	}

	$body
		.find("#download-master-excel")
		.off("click")
		.on("click", function () {
			download_master_excel();
		});

	// ═══════════════════════════════════════════════════════════════════════
	// INITIALIZATION
	// ═══════════════════════════════════════════════════════════════════════

	// Set default date range (This Month)
	setTimeout(() => {
		const today = frappe.datetime.get_today();
		const from_date = frappe.datetime.add_months(today, -1);

		from_date_control.set_value(from_date);
		to_date_control.set_value(today);

		state.from_date = from_date;
		state.to_date = today;

		refresh_dashboard();
	}, 100);
};
