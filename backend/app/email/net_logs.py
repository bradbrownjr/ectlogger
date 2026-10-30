import csv
import io

from jinja2 import Template

from app.config import settings
from app.email.logo_svg import LOGO_SVG
from app.email.base import (
    get_unsubscribe_footer,
    send_email_with_attachment,
    send_email_with_attachments,
)

async def send_net_log(
    email: str, 
    net_name: str, 
    net_description: str, 
    ncs_name: str, 
    check_ins: list, 
    started_at: str, 
    closed_at: str, 
    chat_messages: list = None,
    log_fields: list = None,
    frequencies: list = None,
    topic_of_week_enabled: bool = False,
    topic_of_week_prompt: str = None,
    poll_enabled: bool = False,
    poll_question: str = None,
    propagation_logging_enabled: bool = False,
    coverage_edges: list = None,
    site_coverage: dict = None,
    site_roster: list = None,
    traffic_enabled: bool = False,
    traffic_summary: dict = None,
    unsubscribe_token: str = None
):
    """Send net log after net is closed with check-ins table, CSV attachment, and chat log.

    traffic_summary: the dict returned by app.traffic.log.compute_net_traffic_counts
    (draft/pending/relayed/delivered/cancelled/outstanding), rendered as a
    counts-only summary box -- never message content. See
    TRAFFIC-HANDLING-DESIGN.md section 3.5 ("Net log / PDF / close email").

    log_fields: the check-in fields this net's log shows, from
    services/check_in_columns.py::net_log_fields; each check-in dict carries
    their values under 'fields'.

    frequencies: the net's frequencies, listed in the summary. Only a net
    with more than one gets the Frequency (checked in on) and Frequencies
    (available) columns in the email's table: on a one-frequency net they
    repeat the summary on every row and squeeze the table on a phone
    (Office Hours Tech Net, 2026-10-29). The CSV keeps Frequency.
    """
    
    # Calculate poll results if poll is enabled
    poll_results = []
    if poll_enabled:
        poll_counts = {}
        for c in check_ins:
            response = c.get('poll_response', '')
            if response:
                poll_counts[response] = poll_counts.get(response, 0) + 1
        # Sort by count descending
        poll_results = sorted(poll_counts.items(), key=lambda x: -x[1])

    # Build the coverage summary. Each edge is "reporter can hear heard" -
    # a plain list of confirmed directional pairs is enough for an email
    # summary (unlike the interactive report, no one-way/two-way styling is
    # required). As optional polish, reciprocal pairs (both directions
    # reported on the same frequency) collapse into a single "A <-> B" line
    # rather than two separate rows, since a station re-confirming its own
    # coverage picture doesn't need "A can hear B" and "B can hear A" printed
    # as unrelated facts.
    coverage_pairs = []
    if propagation_logging_enabled and coverage_edges:
        seen = set()
        for edge in coverage_edges:
            freq_label = edge.get('frequency_label') or ''
            pair_key = (frozenset([edge['reporter_callsign'], edge['heard_callsign']]), freq_label)
            if pair_key in seen:
                continue
            seen.add(pair_key)
            reciprocal = next(
                (e for e in coverage_edges
                 if e['reporter_callsign'] == edge['heard_callsign']
                 and e['heard_callsign'] == edge['reporter_callsign']
                 and (e.get('frequency_label') or '') == freq_label),
                None
            )
            if reciprocal:
                coverage_pairs.append({
                    'label': f"{edge['reporter_callsign']} ↔ {edge['heard_callsign']}",
                    'frequency_label': freq_label,
                    'reported_at': max(edge['reported_at'], reciprocal['reported_at']),
                })
            else:
                coverage_pairs.append({
                    'label': f"{edge['reporter_callsign']} can hear {edge['heard_callsign']}",
                    'frequency_label': freq_label,
                    'reported_at': edge['reported_at'],
                })

    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 900px; margin: 0 auto; padding: 20px; }
            .summary { background-color: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .poll-section { background-color: #fff3e0; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .poll-bar-container { background-color: #e0e0e0; border-radius: 4px; margin: 5px 0; height: 24px; position: relative; }
            .poll-bar { background-color: #ff9800; height: 100%; border-radius: 4px; }
            .poll-label { position: absolute; left: 8px; top: 2px; font-size: 14px; }
            .poll-count { position: absolute; right: 8px; top: 2px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #1976d2; color: white; }
            tr:nth-child(even) { background-color: #f2f2f2; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>""" + LOGO_SVG + """ Net Log: {{ net_name }}</h2>
            
            <div class="summary">
                <h3>Net Summary</h3>
                <p><strong>Description:</strong> {{ net_description }}</p>
                <p><strong>NCS:</strong> {{ ncs_name }}</p>
                <p><strong>Started:</strong> {{ started_at }}</p>
                <p><strong>Closed:</strong> {{ closed_at }}</p>
                {% if frequencies %}<p><strong>{{ 'Frequency' if frequencies|length == 1 else 'Frequencies' }}:</strong> {{ frequencies|join(', ')|e }}</p>{% endif %}
                <p><strong>Total Check-ins:</strong> {{ check_in_count }}</p>
            </div>

            {% if topic_enabled and topic_prompt %}
            <div class="poll-section" style="background-color: #e8f5e9; border-left: 4px solid #43a047;">
                <h3>📻 Topic of the Week</h3>
                <p><strong>Topic:</strong> {{ topic_prompt }}</p>
            </div>
            {% endif %}

            {% if poll_enabled and poll_results %}
            <div class="poll-section">
                <h3>📊 Poll Results</h3>
                <p><strong>Question:</strong> {{ poll_question }}</p>
                {% for response, count in poll_results %}
                <div class="poll-bar-container">
                    <div class="poll-bar" style="width: {{ (count / total_poll_responses * 100)|round|int }}%;"></div>
                    <span class="poll-label">{{ response }}</span>
                    <span class="poll-count">{{ count }} ({{ (count / total_poll_responses * 100)|round|int }}%)</span>
                </div>
                {% endfor %}
                <p style="font-size: 12px; color: #666; margin-top: 10px;">Total responses: {{ total_poll_responses }}</p>
            </div>
            {% endif %}

            {% if propagation_enabled and coverage_pairs %}
            <div class="poll-section" style="background-color: #e3f2fd; border-left: 4px solid #1976d2;">
                <h3>📡 Station Coverage ("Can Hear" Reports)</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Stations</th>
                            <th>Frequency</th>
                            <th>Reported</th>
                        </tr>
                    </thead>
                    <tbody>
                        {% for pair in coverage_pairs %}
                        <tr>
                            <td>{{ pair.label }}</td>
                            <td>{{ pair.frequency_label or '—' }}</td>
                            <td>{{ pair.reported_at }}</td>
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
            </div>
            {% endif %}

            {% if site_roster %}
            <div class="poll-section" style="background-color: #e8f5e9; border-left: 4px solid #2e7d32;">
                <h3>📍 Sites</h3>
                <table>
                    <thead><tr><th>Where</th><th>Stations</th></tr></thead>
                    <tbody>
                        {% for row in site_roster %}
                        <tr><td>{{ (row.place)|e }}{% if row.detail %}<br><small>{{ (row.detail)|e }}</small>{% endif %}</td><td>{{ (row.callsigns)|e }}</td></tr>
                        {% endfor %}
                    </tbody>
                </table>
            </div>
            {% endif %}

            {% if propagation_enabled and site_coverage %}
            <div class="poll-section" style="background-color: #e8f5e9; border-left: 4px solid #2e7d32;">
                <h3>📍 Coverage by Site</h3>
                {% if site_coverage.reach %}
                <h4>Reaching the primary sites</h4>
                <table>
                    <thead><tr><th>Site</th><th>Primary site</th><th>Result</th><th>Details</th></tr></thead>
                    <tbody>
                        {% for row in site_coverage.reach %}
                        <tr><td>{{ (row.site)|e }}</td><td>{{ (row.primary)|e }}</td><td>{{ (row.status)|e }}</td><td>{{ (row.detail)|e }}</td></tr>
                        {% endfor %}
                    </tbody>
                </table>
                {% endif %}
                {% if site_coverage.access %}
                <h4>Repeaters and nodes</h4>
                <table>
                    <thead><tr><th>From</th><th>Repeater or node</th><th>Result</th><th>Notes</th></tr></thead>
                    <tbody>
                        {% for row in site_coverage.access %}
                        <tr><td>{{ (row['from'])|e }}</td><td>{{ (row.target)|e }}</td><td>{{ (row.result)|e }}</td><td>{{ (row.notes or '—')|e }}</td></tr>
                        {% endfor %}
                    </tbody>
                </table>
                {% endif %}
                {% if site_coverage.pairs %}
                <h4>Between sites</h4>
                <table>
                    <thead><tr><th>Sites</th><th>What worked</th></tr></thead>
                    <tbody>
                        {% for row in site_coverage.pairs %}
                        <tr><td>{{ (row.label)|e }}</td><td>{{ (row.detail)|e }}</td></tr>
                        {% endfor %}
                    </tbody>
                </table>
                {% endif %}
                {% if site_coverage.counties %}
                <h4>Counties reached</h4>
                <table>
                    <thead><tr><th>County</th><th>Reached from</th><th>Frequency</th></tr></thead>
                    <tbody>
                        {% for row in site_coverage.counties %}
                        <tr><td>{{ (row.county)|e }}</td><td>{{ (row.from)|e }}</td><td>{{ (row.frequencies)|e }}</td></tr>
                        {% endfor %}
                    </tbody>
                </table>
                {% endif %}
                {% if site_coverage.contacts %}
                <h4>Contacts outside the net</h4>
                <table>
                    <thead><tr><th>From</th><th>Station</th><th>County</th><th>Frequency</th><th>Direction</th></tr></thead>
                    <tbody>
                        {% for row in site_coverage.contacts %}
                        <tr><td>{{ (row['from'])|e }}</td><td>{{ (row.station)|e }}</td><td>{{ (row['where'] or '—')|e }}</td><td>{{ (row.frequency)|e }}</td><td>{{ (row.direction)|e }}</td></tr>
                        {% endfor %}
                    </tbody>
                </table>
                {% endif %}
            </div>
            {% endif %}

            {% if traffic_enabled and traffic_summary and traffic_total %}
            <div class="poll-section" style="background-color: #fce4ec; border-left: 4px solid #c2185b;">
                <h3>📨 Traffic Handled</h3>
                <p>
                    <strong>{{ traffic_summary.pending }}</strong> pending,
                    <strong>{{ traffic_summary.relayed }}</strong> relayed,
                    <strong>{{ traffic_summary.delivered }}</strong> delivered,
                    <strong>{{ traffic_summary.cancelled }}</strong> cancelled
                    {% if traffic_summary.outstanding %}
                    &mdash; <strong>{{ traffic_summary.outstanding }}</strong> outstanding (held 24h+)
                    {% endif %}
                </p>
            </div>
            {% endif %}

            <h3>Check-ins</h3>
            <table>
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Callsign</th>
                        {% for heading in table_headings %}<th>{{ heading|e }}</th>{% endfor %}
                    </tr>
                </thead>
                <tbody>
                    {% for row in table_rows %}
                    <tr>
                        <td>{{ row.time|e }}</td>
                        <td><strong>{{ row.callsign|e }}</strong></td>
                        {% for cell in row.cells %}<td>{{ cell|e }}</td>{% endfor %}
                    </tr>
                    {% endfor %}
                </tbody>
            </table>

            <div class="footer">
                <p>A CSV file with the complete log is attached to this email.</p>
                <p>This is an automated message from {{ app_name }}.</p>
            </div>
            
            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)
    
    # The check-in table's columns, shared by the email and its CSV: the
    # fields the net turned on and filled in (services/check_in_columns.py),
    # then frequencies, topic and poll.
    # (email heading, CSV heading, value, shown in the email's table)
    several_frequencies = len(frequencies or []) > 1
    columns = [(f.label, f.label, lambda c, n=f.name: c.get('fields', {}).get(n, ''), True) for f in (log_fields or [])]
    if any(c.get('frequency') for c in check_ins):
        columns.append(("Frequency", "Frequency", lambda c: c.get('frequency', ''), several_frequencies))
    if several_frequencies and any(c.get('frequencies') for c in check_ins):
        columns.append(("Frequencies", "Frequencies", lambda c: c.get('frequencies', ''), True))
    if topic_of_week_enabled:
        columns.append(("Topic", topic_of_week_prompt or "Topic", lambda c: c.get('topic_response', ''), True))
    if poll_enabled:
        columns.append(("Poll", poll_question or "Poll", lambda c: c.get('poll_response', ''), True))
    table_columns = [column for column in columns if column[3]]
    table_rows = [
        {'time': c.get('time', ''), 'callsign': c.get('callsign', ''), 'cells': [value(c) or '' for _, _, value, _ in table_columns]}
        for c in check_ins
    ]

    # Calculate total poll responses for percentage
    total_poll_responses = sum(count for _, count in poll_results) if poll_results else 0
    
    html_content = html_template.render(
        app_name=settings.app_name,
        net_name=net_name,
        net_description=net_description or "No description",
        ncs_name=ncs_name,
        started_at=started_at,
        closed_at=closed_at,
        check_in_count=len(check_ins),
        table_headings=[heading for heading, _, _, _ in table_columns],
        frequencies=frequencies or [],
        table_rows=table_rows,
        topic_enabled=topic_of_week_enabled,
        topic_prompt=topic_of_week_prompt,
        poll_enabled=poll_enabled,
        poll_question=poll_question or "Poll",
        poll_results=poll_results,
        total_poll_responses=total_poll_responses,
        propagation_enabled=propagation_logging_enabled,
        coverage_pairs=coverage_pairs,
        site_coverage=site_coverage,
        site_roster=site_roster,
        traffic_enabled=traffic_enabled,
        traffic_summary=traffic_summary,
        traffic_total=sum(traffic_summary.values()) if traffic_summary else 0,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token)
    )
    
    # Generate CSV with only enabled columns
    output = io.StringIO()
    writer = csv.writer(output)
    
    # The email's columns, plus Frequency on a one-frequency net. (The
    # detailed CSV export keeps fixed column names, which the CSV import
    # matches on.)
    writer.writerow(["Check-in Time", "Callsign", *(heading for _, heading, _, _ in columns), "Status"])
    for check_in in check_ins:
        writer.writerow([check_in.get('time', ''), check_in.get('callsign', ''),
                         *(value(check_in) or '' for _, _, value, _ in columns), check_in.get('status', '')])

    csv_data = output.getvalue()
    csv_filename = f"{net_name.replace(' ', '_')}_{closed_at.split()[0]}.csv"
    
    # Generate chat log if provided
    attachments = [(csv_data, csv_filename, "text/csv")]
    
    if chat_messages:
        chat_output = io.StringIO()
        chat_output.write(f"Chat Log for {net_name}\n")
        chat_output.write(f"{'='*60}\n\n")
        
        # Add poll question at the top if enabled
        if poll_enabled and poll_question:
            chat_output.write(f"📊 Poll Question: {poll_question}\n")
            chat_output.write(f"{'-'*40}\n\n")
        
        for msg in chat_messages:
            timestamp = msg.get('timestamp', '')
            callsign = msg.get('callsign', 'Unknown')
            message = msg.get('message', '')
            chat_output.write(f"[{timestamp}] {callsign}: {message}\n")
        
        # Add poll results summary at the end if enabled
        if poll_enabled and poll_results:
            chat_output.write(f"\n{'='*60}\n")
            chat_output.write("📊 Poll Results Summary\n")
            chat_output.write(f"Question: {poll_question}\n")
            chat_output.write(f"{'-'*40}\n")
            for response, count in poll_results:
                pct = (count / total_poll_responses * 100) if total_poll_responses else 0
                chat_output.write(f"  {response}: {count} ({pct:.0f}%)\n")
            chat_output.write(f"Total responses: {total_poll_responses}\n")
        
        chat_data = chat_output.getvalue()
        chat_filename = f"{net_name.replace(' ', '_')}_{closed_at.split()[0]}_chat.txt"
        attachments.append((chat_data, chat_filename, "text/plain"))
    
    # Send email with attachment(s)
    if len(attachments) > 1:
        await send_email_with_attachments(
            to_email=email,
            subject=f"📻 Net Log: {net_name}",
            html_content=html_content,
            attachments=attachments,
            unsubscribe_token=unsubscribe_token
        )
    else:
        await send_email_with_attachment(
            to_email=email,
            subject=f"📻 Net Log: {net_name}",
            html_content=html_content,
            attachment_data=csv_data,
            attachment_filename=csv_filename,
            unsubscribe_token=unsubscribe_token
        )

async def send_ics309_log(
    email: str,
    net_name: str,
    net_description: str,
    ncs_name: str,
    ncs_callsign: str,
    check_ins: list,
    started_at: str,
    closed_at: str,
    log_entries: list = None,
    message_count: int = 0,
    frequencies: list = None,
    log_fields: list = None,
    unsubscribe_token: str = None
):
    """Send ICS-309 Communications Log format after net is closed.

    log_entries: the log's {time, from_station, to_station, message} rows,
    built by services/ics309_log.py::build_ics309_rows, the same builder as
    the ICS-309 export. check_ins is still needed for the detailed check-in
    CSV attachment, which adds the frequency each station checked in on and
    the net's own fields from log_fields (services/check_in_columns.py).
    message_count is the chat message total in the footer.
    """
    
    # Format frequencies for display
    freq_list = ", ".join(frequencies) if frequencies else "Multiple"
    
    # Calculate operational period
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.4; color: #000; background: #fff; }
            .container { max-width: 800px; margin: 0 auto; padding: 10px; }
            .form-header { 
                display: flex; 
                justify-content: space-between; 
                border-bottom: 2px solid #000; 
                padding-bottom: 5px;
                margin-bottom: 10px;
            }
            .form-title { font-size: 14px; font-weight: bold; }
            .form-number { font-size: 18px; font-weight: bold; }
            .header-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 5px;
                border: 1px solid #000;
                margin-bottom: 10px;
            }
            .header-cell {
                border: 1px solid #000;
                padding: 5px;
                font-size: 11px;
            }
            .header-label { font-weight: bold; font-size: 10px; }
            .header-value { font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
            th, td { border: 1px solid #000; padding: 4px; text-align: left; }
            th { background-color: #e0e0e0; font-weight: bold; font-size: 10px; }
            .log-table th { text-align: center; }
            .time-col { width: 80px; text-align: center; }
            .callsign-col { width: 80px; }
            .subject-col { width: auto; }
            .footer-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 5px;
                border: 1px solid #000;
                margin-top: 10px;
            }
            .page-num { text-align: right; font-size: 10px; margin-top: 5px; }
            .ics-footer { font-size: 9px; color: #666; margin-top: 10px; }
            @media print {
                .container { max-width: 100%; }
                body { font-size: 10px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- ICS-309 Header -->
            <div class="form-header">
                <div>
                    <div class="form-title">COMMUNICATIONS LOG</div>
                </div>
                <div>
                    <div class="form-number">ICS 309</div>
                </div>
            </div>

            <!-- Header Information Grid -->
            <div class="header-grid">
                <div class="header-cell">
                    <div class="header-label">1. Incident Name:</div>
                    <div class="header-value">{{ net_name }}</div>
                </div>
                <div class="header-cell">
                    <div class="header-label">2. Operational Period:</div>
                    <div class="header-value">{{ started_at }} to {{ closed_at }}</div>
                </div>
                <div class="header-cell">
                    <div class="header-label">3. Radio Operator Name/Callsign:</div>
                    <div class="header-value">{{ radio_operator }}</div>
                </div>
                <div class="header-cell">
                    <div class="header-label">4. Radio Channel/Frequency:</div>
                    <div class="header-value">{{ frequencies }}</div>
                </div>
            </div>

            <!-- Log Table -->
            <table class="log-table">
                <thead>
                    <tr>
                        <th class="time-col">5. TIME</th>
                        <th class="callsign-col">6. FROM</th>
                        <th class="callsign-col">7. TO</th>
                        <th class="subject-col">8. SUBJECT/MESSAGE</th>
                    </tr>
                </thead>
                <tbody>
                    {% for entry in log_entries %}
                    <tr>
                        <td class="time-col">{{ entry.time }}</td>
                        <td class="callsign-col">{{ entry.from_station }}</td>
                        <td class="callsign-col">{{ entry.to_station }}</td>
                        <td class="subject-col">{{ entry.message }}</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>

            <!-- Footer Grid -->
            <div class="footer-grid">
                <div class="header-cell">
                    <div class="header-label">9. Prepared By:</div>
                    <div class="header-value">{{ app_name }} - Automated Log</div>
                </div>
                <div class="header-cell">
                    <div class="header-label">10. Date/Time:</div>
                    <div class="header-value">{{ closed_at }}</div>
                </div>
            </div>

            <div class="page-num">Page 1 of 1</div>

            <div class="ics-footer">
                <p>ICS 309 - Communications Log generated by {{ app_name }}</p>
                <p>Total Check-ins: {{ check_in_count }} | Total Messages: {{ message_count }}</p>
                <p>A CSV file with detailed check-in data is attached.</p>
            </div>
            
            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)
    
    log_entries = log_entries or []
    
    # "Cory Golob / KU1U" for a single named NCS. When a net has several NCS the
    # caller passes the callsign list as both values (there is no single name to
    # show), so print it once instead of "WO1J, NB1T / WO1J, NB1T".
    radio_operator = ncs_name if ncs_name == ncs_callsign else f"{ncs_name} / {ncs_callsign}"

    html_content = html_template.render(
        app_name=settings.app_name,
        net_name=net_name,
        ncs_name=ncs_name,
        ncs_callsign=ncs_callsign,
        radio_operator=radio_operator,
        started_at=started_at,
        closed_at=closed_at,
        frequencies=freq_list,
        log_entries=log_entries,
        check_in_count=len(check_ins),
        message_count=message_count,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token)
    )
    
    # Generate ICS-309 CSV format
    output = io.StringIO()
    writer = csv.writer(output)
    
    # ICS-309 header info
    writer.writerow(["ICS-309 COMMUNICATIONS LOG"])
    writer.writerow([""])
    writer.writerow(["1. Incident Name:", net_name])
    writer.writerow(["2. Operational Period:", f"{started_at} to {closed_at}"])
    writer.writerow(["3. Radio Operator:", radio_operator])
    writer.writerow(["4. Channel/Frequency:", freq_list])
    writer.writerow([""])
    writer.writerow(["TIME", "FROM", "TO", "SUBJECT/MESSAGE"])
    
    for entry in log_entries:
        writer.writerow([
            entry.get('time', ''),
            entry.get('from_station', ''),
            entry.get('to_station', ''),
            entry.get('message', '')
        ])
    
    writer.writerow([""])
    writer.writerow(["9. Prepared By:", f"{settings.app_name} - Automated Log"])
    writer.writerow(["10. Date/Time:", closed_at])
    
    csv_data = output.getvalue()
    csv_filename = f"ICS309_{net_name.replace(' ', '_')}_{closed_at.split()[0]}.csv"
    
    # Also generate detailed check-in CSV
    detail_output = io.StringIO()
    detail_writer = csv.writer(detail_output)
    custom_fields = [f for f in (log_fields or []) if f.custom]
    detail_writer.writerow([
        "Check-in Time", "Callsign", "Name", "Location", "Frequency",
        "Spotter #", "Weather Observation", "Power Src", "Power",
        "Feedback", "Notes", *(f.label for f in custom_fields), "Status"
    ])

    for check_in in check_ins:
        detail_writer.writerow([
            check_in.get('time', ''),
            check_in.get('callsign', ''),
            check_in.get('name', ''),
            check_in.get('location', ''),
            check_in.get('frequency', ''),
            check_in.get('skywarn_number', ''),
            check_in.get('weather_observation', ''),
            check_in.get('power_source', ''),
            check_in.get('power', ''),
            check_in.get('feedback', ''),
            check_in.get('notes', ''),
            *(check_in.get('fields', {}).get(f.name, '') for f in custom_fields),
            check_in.get('status', '')
        ])

    detail_csv_data = detail_output.getvalue()
    detail_csv_filename = f"{net_name.replace(' ', '_')}_{closed_at.split()[0]}_checkins.csv"
    
    attachments = [
        (csv_data, csv_filename, "text/csv"),
        (detail_csv_data, detail_csv_filename, "text/csv")
    ]
    
    await send_email_with_attachments(
        to_email=email,
        subject=f"📋 ICS-309 Communications Log: {net_name}",
        html_content=html_content,
        attachments=attachments,
        unsubscribe_token=unsubscribe_token
    )

