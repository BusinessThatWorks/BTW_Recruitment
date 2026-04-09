// Excel Download Helper Functions
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
		// Don't trigger if clicking on info icon
		if ($(e.target).closest(".kpi-info").length) return;

		const route = $(this).data("route");

		switch (route) {
			case "joined":
				frappe.set_route("List", "DKP_Interview", {
					stage: "Joined",
				});
				break;

			case "joined-left":
				frappe.set_route("List", "DKP_Interview", {
					stage: "Joined And Left",
				});
				break;

			case "open-jobs":
				frappe.set_route("List", "DKP_Job_Opening", {
					status: "Open",
				});
				break;

			case "submitted":
				// Route to Job Openings with Open status (candidates are in child table)
				frappe.set_route("List", "DKP_Job_Opening", {
					status: "Open",
				});
				break;

			case "rejected":
				frappe.set_route("List", "DKP_Interview", {
					stage: ["in", ["Rejected By Client"]],
				});
				break;

			case "interview-pipeline":
				frappe.set_route("List", "DKP_Interview", {
					stage: [
						"in",
						["Selected For Offer", "Offered", "Offer Accepted"],
					],
				});
				break;

			case "ageing-critical":
				frappe.set_route("List", "DKP_Job_Opening", {
					status: "Open",
				});
				break;
		}
	});
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
			{ name: "Company", width: 200 },
			{ name: "Open Jobs", width: 100 },
			{ name: "Total Positions", width: 120 },
			{ name: "Submitted", width: 100 },
			{ name: "Rejected", width: 100 },
			{ name: "Interview", width: 100 },
			{ name: "Joined", width: 80 },
			{ name: "Joined & Left", width: 80 },
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
			{ name: "Jobs Assigned", width: 120 },
			{ name: "Candidates Submitted", width: 150 },
			{ name: "Rejected", width: 100 },
			{ name: "Interview", width: 100 },
			{ name: "Joined", width: 80 },
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
