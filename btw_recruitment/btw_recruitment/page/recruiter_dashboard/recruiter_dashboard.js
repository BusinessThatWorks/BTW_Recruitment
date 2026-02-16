frappe.pages["recruiter-dashboard"].on_page_load = function (wrapper) {

    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Recruiter Dashboard"),
        single_column: true,
    });

    $(frappe.render_template("recruiter_dashboard", {})).appendTo(page.body);

    // =============================
    // STATE VARIABLES
    // =============================
    let state = {
        recruiter: null,
        from_date: null,
        to_date: null,
        status: null,
        page: 1,
        page_length: 10,
        total: 0
    };

    // =============================
    // DOM REFERENCES
    // =============================
    const $body = $(page.body);
    const $table = $body.find(".recruiter-table");
    const $tbody = $table.find("tbody");
    const $page_info = $body.find(".recruiter-page-info");
    const $btn_prev = $body.find(".recruiter-prev");
    const $btn_next = $body.find(".recruiter-next");
    
    // KPI elements
    const $kpi_openings = $body.find(".kpi-openings");
    const $kpi_positions = $body.find(".kpi-positions");
    const $kpi_candidates = $body.find(".kpi-candidates");
    const $kpi_joined = $body.find(".kpi-joined");
    const $kpi_conversion = $body.find(".kpi-conversion");
    const $kpi_join_rate = $body.find(".kpi-join-rate");

    // ✅ TWO Funnel container references
    const $mapping_funnel = $body.find("#mapping-funnel");
    const $interview_funnel = $body.find("#interview-funnel");

    // =============================
    // DEBOUNCE FUNCTION
    // =============================
    let debounce_timer;
    function debounced_refresh() {
        clearTimeout(debounce_timer);
        debounce_timer = setTimeout(() => {
            state.page = 1;
            refresh_dashboard();
        }, 300);
    }

    // =============================
    // MAIN REFRESH FUNCTION
    // =============================
    function refresh_dashboard() {
        if (!state.recruiter) {
            render_rows([]);
            update_pagination(0);
            reset_kpis();
            reset_funnels();
            return;
        }

        if (state.from_date && state.to_date) {
            if (state.from_date > state.to_date) {
                frappe.show_alert({
                    message: "From Date cannot be greater than To Date",
                    indicator: "red"
                });
                return;
            }
        }

        load_data();
        load_kpis();
        load_funnels();
    }

    // =============================
    // FILTER CONTROLS
    // =============================
    
    const recruiter_control = frappe.ui.form.make_control({
        parent: $body.find(".recruiter-control-slot"),
        df: {
            fieldtype: "Link",
            options: "User",
            placeholder: "Select Recruiter",
            get_query: () => ({
                filters: {
                    role_profile_name: ["in", ["DKP Recruiter", "DKP Recruiter - Exclusive"]],
                    enabled: 1,
                },
            }),
            change: function() {
                state.recruiter = recruiter_control.get_value() || null;
                debounced_refresh();
            }
        },
        render_input: true
    });

    const from_date_control = frappe.ui.form.make_control({
        parent: $body.find(".from-date-slot"),
        df: {
            fieldtype: "Date",
            placeholder: "From Date",
            change: function() {
                state.from_date = from_date_control.get_value() || null;
                debounced_refresh();
            }
        },
        render_input: true
    });

    const to_date_control = frappe.ui.form.make_control({
        parent: $body.find(".to-date-slot"),
        df: {
            fieldtype: "Date",
            placeholder: "To Date",
            change: function() {
                state.to_date = to_date_control.get_value() || null;
                debounced_refresh();
            }
        },
        render_input: true
    });

    const status_control = frappe.ui.form.make_control({
        parent: $body.find(".status-slot"),
        df: {
            fieldtype: "Select",
            options: "\nOpen\nClosed – Hired",
            placeholder: "All Status",
            change: function() {
                state.status = status_control.get_value() || null;
                debounced_refresh();
            }
        },
        render_input: true
    });

    // =============================
    // CLEAR BUTTON
    // =============================
    $body.find(".recruiter-clear").on("click", function() {
        recruiter_control.set_value("");
        from_date_control.set_value("");
        to_date_control.set_value("");
        status_control.set_value("");
        
        state = {
            recruiter: null,
            from_date: null,
            to_date: null,
            status: null,
            page: 1,
            page_length: 10,
            total: 0
        };
        
        render_rows([]);
        update_pagination(0);
        reset_kpis();
        reset_funnels();
        
        frappe.show_alert({
            message: "Filters cleared",
            indicator: "blue"
        });
    });

    // =============================
    // KPI FUNCTIONS
    // =============================
    function reset_kpis() {
        $kpi_openings.text(0);
        $kpi_positions.text(0);
        $kpi_candidates.text(0);
        $kpi_joined.text(0);
        $kpi_conversion.text("0%");
        $kpi_join_rate.text("0%");
    }

    function load_kpis() {
        if (!state.recruiter) return;

        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_kpis",
            args: {
                recruiter: state.recruiter,
                from_date: state.from_date,
                to_date: state.to_date,
                status: state.status
            },
            callback(r) {
                const k = r.message || {};

                $kpi_openings.text(k.total_openings || 0);
                $kpi_positions.text(k.total_positions || 0);
                $kpi_candidates.text(k.total_candidates || 0);
                $kpi_joined.text(k.total_joined || 0);
                $kpi_conversion.text((k.avg_conversion || 0) + "%");
                $kpi_join_rate.text((k.candidate_join_rate || 0) + "%");
            }
        });
    }

    // =============================
    // ✅ FUNNEL FUNCTIONS (Two Separate Funnels)
    // =============================
    function reset_funnels() {
        const empty_html = `
            <div class="funnel-empty">
                <div class="funnel-empty-icon">📊</div>
                <div class="funnel-empty-text">Select a recruiter</div>
            </div>
        `;
        $mapping_funnel.html(empty_html);
        $interview_funnel.html(empty_html);
    }

    function load_funnels() {
        if (!state.recruiter) {
            reset_funnels();
            return;
        }

        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_funnel_data",
            args: {
                recruiter: state.recruiter,
                from_date: state.from_date,
                to_date: state.to_date,
                status: state.status
            },
            callback(r) {
                const data = r.message || {};
                render_mapping_funnel(data.mapping_stages || {});
                render_interview_funnel(data.interview_stages || {});
            }
        });
    }

    function render_mapping_funnel(data) {
        const stages = [
            { name: "Total Mapped", value: data.total_mapped || 0, class: "stage-mapped" },
            { name: "No Response", value: data.no_response || 0, class: "stage-no-response" },
            { name: "Submitted To Client", value: data.submitted_to_client || 0, class: "stage-submitted" },
            { name: "Client Screening Rejected", value: data.client_rejected || 0, class: "stage-rejected" },
            { name: "Schedule Interview", value: data.schedule_interview || 0, class: "stage-schedule" }
        ];

        render_funnel_bars($mapping_funnel, stages, data.total_mapped || 0);
    }

    function render_interview_funnel(data) {
    // ✅ UPDATED: Add Total as first stage
    const stages = [
        { name: "Total in Interview", value: data.total_interview || 0, class: "stage-mapped" },  // ✅ NEW
        { name: "Interview No Show", value: data.interview_no_show || 0, class: "stage-no-show" },
        { name: "Selected For Offer", value: data.selected_for_offer || 0, class: "stage-selected" },
        { name: "Rejected By Client", value: data.rejected_by_client || 0, class: "stage-rejected" },
        { name: "Offered", value: data.offered || 0, class: "stage-offered" },
        { name: "Offer Accepted", value: data.offer_accepted || 0, class: "stage-accepted" },
        { name: "Offer Declined", value: data.offer_declined || 0, class: "stage-declined" },
        { name: "Joined", value: data.joined || 0, class: "stage-joined" },
        { name: "Joined And Left", value: data.joined_and_left || 0, class: "stage-left" }
    ];

    // ✅ UPDATED: Use total_interview as base
    const total = data.total_interview || 0;
    
    // ✅ Special rendering for interview funnel
    $interview_funnel.empty();

    if (total === 0) {
        $interview_funnel.html(`
            <div class="funnel-empty">
                <div class="funnel-empty-icon">📭</div>
                <div class="funnel-empty-text">No interview data</div>
            </div>
        `);
        return;
    }

    stages.forEach((stage, index) => {
        const percentage = ((stage.value / total) * 100).toFixed(1);
        
        // ✅ First bar (Total) always 100%, others proportional
        let width = 100;
        if (index > 0) {
            width = Math.max((stage.value / total * 100), 15);
        }

        const $stage = $(`
            <div class="funnel-stage">
                <div class="funnel-bar-wrapper">
                    <div class="funnel-bar ${stage.class}" style="width: ${width}%;">
                        <span class="funnel-stage-name">${stage.name}</span>
                        <span>
                            <span class="funnel-stage-value">${stage.value}</span>
                            <span class="funnel-stage-percent">(${percentage}%)</span>
                        </span>
                    </div>
                </div>
            </div>
        `);

        $interview_funnel.append($stage);
    });
    }

    function render_funnel_bars($container, stages, total) {
        $container.empty();

        if (total === 0) {
            $container.html(`
                <div class="funnel-empty">
                    <div class="funnel-empty-icon">📭</div>
                    <div class="funnel-empty-text">No data</div>
                </div>
            `);
            return;
        }

        stages.forEach((stage, index) => {
            const percentage = total > 0 ? ((stage.value / total) * 100).toFixed(1) : 0;
            
            // Calculate width proportionally, min 15% for visibility
            let width = 100;
            if (index > 0 && total > 0) {
                width = Math.max((stage.value / total * 100), 15);
            }

            const $stage = $(`
                <div class="funnel-stage">
                    <div class="funnel-bar-wrapper">
                        <div class="funnel-bar ${stage.class}" style="width: ${width}%;">
                            <span class="funnel-stage-name">${stage.name}</span>
                            <span>
                                <span class="funnel-stage-value">${stage.value}</span>
                                <span class="funnel-stage-percent">(${percentage}%)</span>
                            </span>
                        </div>
                    </div>
                </div>
            `);

            $container.append($stage);
        });
    }

    // =============================
    // PAGINATION BUTTONS
    // =============================
    $btn_prev.on("click", function () {
        if (state.page > 1) {
            state.page--;
            load_data();
        }
    });

    $btn_next.on("click", function () {
        const max_page = Math.ceil(state.total / state.page_length) || 1;
        if (state.page < max_page) {
            state.page++;
            load_data();
        }
    });

    // =============================
    // MAIN DATA LOADER
    // =============================
    function load_data() {
        if (!state.recruiter) {
            render_rows([]);
            update_pagination(0);
            return;
        }

        const offset = (state.page - 1) * state.page_length;

        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_openings",
            args: {
                recruiter: state.recruiter,
                from_date: state.from_date,
                to_date: state.to_date,
                status: state.status,
                limit: state.page_length,
                offset: offset,
            },
            freeze: true,
            freeze_message: __("Loading recruiter data..."),
            callback(r) {
                const resp = r.message || {};
                const rows = resp.data || [];
                state.total = resp.total || 0;

                render_rows(rows);
                update_pagination(state.total);
            },
        });
    }

    // =============================
    // TABLE RENDER
    // =============================
    function render_rows(rows) {
        $tbody.empty();

        if (!rows.length) {
            $tbody.append(`<tr><td colspan="7" class="text-center text-muted">No data</td></tr>`);
            return;
        }

        rows.forEach(row => {
            const url = `/app/dkp_job_opening/${row.job_opening}`;
            
            let status_class = "";
            if (row.status === "Open") status_class = "badge badge-success";
            else if (row.status === "Closed – Hired") status_class = "badge badge-info";
            else if (row.status === "On Hold") status_class = "badge badge-warning";
            else if (row.status === "Closed – Cancelled") status_class = "badge badge-danger";

            $tbody.append(`
                <tr>
                    <td><a href="${url}" target="_blank">${frappe.utils.escape_html(row.job_opening)}</a></td>
                    <td>${row.company_name || ""}</td>
                    <td>${row.designation || ""}</td>
                    <td><span class="${status_class}">${row.status || ""}</span></td>
                    <td class="text-right">${row.number_of_positions || 0}</td>
                    <td class="text-right">${row.total_candidates || 0}</td>
                    <td class="text-right">${row.joined_candidates || 0}</td>
                </tr>
            `);
        });
    }

    // =============================
    // PAGINATION TEXT
    // =============================
    function update_pagination(total_count) {
        const max_page = Math.max(1, Math.ceil(total_count / state.page_length));

        if (!total_count) {
            $page_info.text("Showing 0 of 0 openings");
        } else {
            const start = (state.page - 1) * state.page_length + 1;
            const end = Math.min(state.page * state.page_length, total_count);
            $page_info.text(`Showing ${start}–${end} of ${total_count}`);
        }

        $btn_prev.prop("disabled", state.page <= 1);
        $btn_next.prop("disabled", state.page >= max_page);
    }

    // =============================
    // TOOLTIP INIT
    // =============================
    setTimeout(() => {
        $('[data-toggle="tooltip"]').tooltip();
    }, 300);

    // =============================
    // INITIAL STATE
    // =============================
    reset_funnels();

};