frappe.pages["recruiter-dashboard"].on_page_load = function (wrapper) {

    // ✅ Create page
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Recruiter Dashboard"),
        single_column: true,
    });

    // ✅ Load HTML template
    $(frappe.render_template("recruiter_dashboard", {})).appendTo(page.body);

    // =============================
    // STATE VARIABLES
    // =============================
    let page_length = 10;
    let current_page = 1;
    let total = 0;
    let current_recruiter = null;

    // =============================
    // DOM REFERENCES
    // =============================
    const $table = $(page.body).find(".recruiter-table");
    const $tbody = $table.find("tbody");
    const $page_info = $(page.body).find(".recruiter-page-info");
    const $btn_prev = $(page.body).find(".recruiter-prev");
    const $btn_next = $(page.body).find(".recruiter-next");
    const $kpi_openings = $(page.body).find(".kpi-openings");
    const $kpi_positions = $(page.body).find(".kpi-positions");
    const $kpi_candidates = $(page.body).find(".kpi-candidates");
    const $kpi_joined = $(page.body).find(".kpi-joined");
    const $kpi_conversion = $(page.body).find(".kpi-conversion");
    const $kpi_join_rate = $(page.body).find(".kpi-join-rate");

    // =============================
    // RECRUITER LINK CONTROL (HTML BASED)
    // =============================
    const recruiter_control = frappe.ui.form.make_control({
        parent: $(page.body).find(".recruiter-control-slot"),
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
            change: function () {
                current_recruiter = recruiter_control.get_value();
                current_page = 1;

                if (!current_recruiter) {
                    render_rows([]);
                    update_pagination(0);
                    return;
                }

                load_data();
                load_kpis();
            }
        },
        render_input: true
    });
    $(page.body).find(".recruiter-clear").on("click", () => {
        // clear Frappe Link control
        recruiter_control.set_value("");           // internal value
        recruiter_control.input.value = "";       // visible input box
        recruiter_control.df.change && recruiter_control.df.change(); // manually trigger change

        // reset state variables
        current_recruiter = null;
        current_page = 1;
        total = 0;

        // reset table
        render_rows([]);
        update_pagination(0);

        // reset KPIs
        $kpi_openings.text(0);
        $kpi_positions.text(0);
        $kpi_candidates.text(0);
        $kpi_joined.text(0);
        $kpi_conversion.text("0%");
        $kpi_join_rate.text("0%");
    });

    function load_kpis() {
        if (!current_recruiter) return;

        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_kpis",
            args: {
                recruiter: current_recruiter
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
    setTimeout(() => {
        $('[data-toggle="tooltip"]').tooltip();
    }, 300);

    // =============================
    // PAGINATION BUTTONS
    // =============================
    $btn_prev.on("click", function () {
        if (current_page > 1) {
            current_page--;
            load_data();
        }
    });

    $btn_next.on("click", function () {
        const max_page = Math.ceil(total / page_length) || 1;
        if (current_page < max_page) {
            current_page++;
            load_data();
        }
    });


    // =============================
    // MAIN DATA LOADER
    // =============================
    function load_data() {
        if (!current_recruiter) {
            render_rows([]);
            update_pagination(0);
            return;
        }

        const offset = (current_page - 1) * page_length;

        frappe.call({
            method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_openings",
            args: {
                recruiter: current_recruiter,
                limit: page_length,
                offset: offset,
            },
            freeze: true,
            freeze_message: __("Loading recruiter data..."),
            callback(r) {
                const resp = r.message || {};
                const rows = resp.data || [];
                total = resp.total || 0;

                render_rows(rows);
                update_pagination(total);
                // update_kpis(rows, total);
                load_kpis();    
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

            $tbody.append(`
                <tr>
                    <td><a href="${url}" target="_blank">${frappe.utils.escape_html(row.job_opening)}</a></td>
                    <td>${row.company_name || ""}</td>
                    <td>${row.designation || ""}</td>
                    <td>${row.status || ""}</td>
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
        const max_page = Math.max(1, Math.ceil(total_count / page_length));

        if (!total_count) {
            $page_info.text("Showing 0 of 0 openings");
        } else {
            const start = (current_page - 1) * page_length + 1;
            const end = Math.min(current_page * page_length, total_count);
            $page_info.text(`Showing ${start}–${end} of ${total_count}`);
        }

        $btn_prev.prop("disabled", current_page <= 1);
        $btn_next.prop("disabled", current_page >= max_page);
    }

};