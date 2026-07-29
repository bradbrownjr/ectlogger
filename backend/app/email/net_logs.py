import csv
import io

from jinja2 import Template

from app.config import settings
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
    field_config: dict = None,
    topic_of_week_enabled: bool = False,
    topic_of_week_prompt: str = None,
    poll_enabled: bool = False,
    poll_question: str = None,
    unsubscribe_token: str = None
):
    """Send net log after net is closed with check-ins table, CSV attachment, and chat log"""
    
    # Parse field_config to determine which fields are enabled
    fc = field_config or {}
    # Helper to check if a field is enabled (default enabled if not in config)
    def is_enabled(field_name):
        if not fc:
            return True  # Default behavior if no config
        field = fc.get(field_name, {})
        return field.get('enabled', False)
    
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
            <h2><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="28" height="28" style="vertical-align:middle;margin-right:6px"><circle cx="100" cy="100" r="92" fill="white" stroke="#1a6b2e" stroke-width="9"/><circle cx="100" cy="100" r="68" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><circle cx="100" cy="100" r="47" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><circle cx="100" cy="100" r="26" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><line x1="100" y1="165" x2="100" y2="38" stroke="#90a4ae" stroke-width="4.5" stroke-linecap="round"/><line x1="88" y1="58" x2="112" y2="58" stroke="#90a4ae" stroke-width="3" stroke-linecap="round"/><line x1="84" y1="74" x2="116" y2="74" stroke="#78909c" stroke-width="2.5" stroke-linecap="round"/><circle cx="100" cy="38" r="5.5" fill="#4caf50"/><circle cx="152" cy="72" r="5.5" fill="#4caf50"/><circle cx="56" cy="62" r="5.5" fill="#4caf50"/><circle cx="48" cy="138" r="5.5" fill="#4caf50"/><path d="M 52 112 L 84 148 L 162 58" fill="none" stroke="#2e7d32" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><path d="M 52 112 L 84 148 L 162 58" fill="none" stroke="#43a047" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg> Net Log: {{ net_name }}</h2>
            
            <div class="summary">
                <h3>Net Summary</h3>
                <p><strong>Description:</strong> {{ net_description }}</p>
                <p><strong>NCS:</strong> {{ ncs_name }}</p>
                <p><strong>Started:</strong> {{ started_at }}</p>
                <p><strong>Closed:</strong> {{ closed_at }}</p>
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

            <h3>Check-ins</h3>
            <table>
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Callsign</th>
                        {% if show_name %}<th>Name</th>{% endif %}
                        {% if show_location %}<th>Location</th>{% endif %}
                        {% if has_frequencies %}<th>Frequencies</th>{% endif %}
                        {% if show_skywarn %}<th>Spotter #</th>{% endif %}
                        {% if show_weather %}<th>Weather</th>{% endif %}
                        {% if show_power_source %}<th>Power Src</th>{% endif %}
                        {% if show_power %}<th>Power</th>{% endif %}
                        {% if show_notes %}<th>Notes</th>{% endif %}
                        {% if topic_enabled %}<th>Topic</th>{% endif %}
                        {% if poll_enabled %}<th>Poll</th>{% endif %}
                    </tr>
                </thead>
                <tbody>
                    {% for check_in in check_ins %}
                    <tr>
                        <td>{{ check_in.time }}</td>
                        <td><strong>{{ check_in.callsign }}</strong></td>
                        {% if show_name %}<td>{{ check_in.name }}</td>{% endif %}
                        {% if show_location %}<td>{{ check_in.location }}</td>{% endif %}
                        {% if has_frequencies %}<td>{{ check_in.frequencies }}</td>{% endif %}
                        {% if show_skywarn %}<td>{{ check_in.skywarn_number }}</td>{% endif %}
                        {% if show_weather %}<td>{{ check_in.weather_observation }}</td>{% endif %}
                        {% if show_power_source %}<td>{{ check_in.power_source }}</td>{% endif %}
                        {% if show_power %}<td>{{ check_in.power }}</td>{% endif %}
                        {% if show_notes %}<td>{{ check_in.notes }}</td>{% endif %}
                        {% if topic_enabled %}<td>{{ check_in.topic_response }}</td>{% endif %}
                        {% if poll_enabled %}<td>{{ check_in.poll_response }}</td>{% endif %}
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
    
    # Check which optional fields have data (only show if enabled AND has data)
    has_frequencies = any(c.get('frequencies') for c in check_ins)
    
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
        check_ins=check_ins,
        has_frequencies=has_frequencies,
        show_name=is_enabled('name'),
        show_location=is_enabled('location'),
        show_skywarn=is_enabled('skywarn_number'),
        show_weather=is_enabled('weather_observation'),
        show_power_source=is_enabled('power_source'),
        show_power=is_enabled('power'),
        show_notes=is_enabled('notes'),
        topic_enabled=topic_of_week_enabled,
        topic_prompt=topic_of_week_prompt,
        poll_enabled=poll_enabled,
        poll_question=poll_question or "Poll",
        poll_results=poll_results,
        total_poll_responses=total_poll_responses,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token)
    )
    
    # Generate CSV with only enabled columns
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Build header row based on enabled fields
    headers = ["Check-in Time", "Callsign"]
    if is_enabled('name'):
        headers.append("Name")
    if is_enabled('location'):
        headers.append("Location")
    if has_frequencies:
        headers.append("Frequencies")
    if is_enabled('skywarn_number'):
        headers.append("Spotter #")
    if is_enabled('weather_observation'):
        headers.append("Weather Observation")
    if is_enabled('power_source'):
        headers.append("Power Src")
    if is_enabled('power'):
        headers.append("Power")
    if is_enabled('notes'):
        headers.append("Notes")
    if topic_of_week_enabled:
        headers.append(topic_of_week_prompt or "Topic")
    if poll_enabled:
        headers.append(poll_question or "Poll")
    headers.append("Status")
    
    writer.writerow(headers)
    
    for check_in in check_ins:
        row = [check_in.get('time', ''), check_in.get('callsign', '')]
        if is_enabled('name'):
            row.append(check_in.get('name', ''))
        if is_enabled('location'):
            row.append(check_in.get('location', ''))
        if has_frequencies:
            row.append(check_in.get('frequencies', ''))
        if is_enabled('skywarn_number'):
            row.append(check_in.get('skywarn_number', ''))
        if is_enabled('weather_observation'):
            row.append(check_in.get('weather_observation', ''))
        if is_enabled('power_source'):
            row.append(check_in.get('power_source', ''))
        if is_enabled('power'):
            row.append(check_in.get('power', ''))
        if is_enabled('notes'):
            row.append(check_in.get('notes', ''))
        if topic_of_week_enabled:
            row.append(check_in.get('topic_response', ''))
        if poll_enabled:
            row.append(check_in.get('poll_response', ''))
        row.append(check_in.get('status', ''))
        writer.writerow(row)
    
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
    chat_messages: list = None,
    frequencies: list = None,
    unsubscribe_token: str = None
):
    """Send ICS-309 Communications Log format after net is closed"""
    
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
                    <div class="header-value">{{ ncs_name }} / {{ ncs_callsign }}</div>
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
    
    # Build log entries combining check-ins and chat messages
    log_entries = []
    
    # Add check-ins as log entries
    for check_in in check_ins:
        location_info = f" from {check_in.get('location', '')}" if check_in.get('location') else ""
        weather_info = f" | WX: {check_in.get('weather_observation', '')}" if check_in.get('weather_observation') else ""
        
        log_entries.append({
            'time': check_in.get('time', ''),
            'from_station': check_in.get('callsign', ''),
            'to_station': 'NET',
            'message': f"Check-in{location_info}{weather_info}"
        })
    
    # Add chat messages (non-system messages only for cleaner log)
    if chat_messages:
        for msg in chat_messages:
            callsign = msg.get('callsign', 'Unknown')
            if callsign != 'System':  # Skip system messages in ICS-309
                log_entries.append({
                    'time': msg.get('timestamp', ''),
                    'from_station': callsign,
                    'to_station': 'NET',
                    'message': msg.get('message', '')
                })
    
    # Sort all entries by time
    log_entries.sort(key=lambda x: x.get('time', ''))
    
    html_content = html_template.render(
        app_name=settings.app_name,
        net_name=net_name,
        ncs_name=ncs_name,
        ncs_callsign=ncs_callsign,
        started_at=started_at,
        closed_at=closed_at,
        frequencies=freq_list,
        log_entries=log_entries,
        check_in_count=len(check_ins),
        message_count=len(chat_messages) if chat_messages else 0,
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
    writer.writerow(["3. Radio Operator:", f"{ncs_name} / {ncs_callsign}"])
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
    detail_writer.writerow([
        "Check-in Time", "Callsign", "Name", "Location", 
        "Spotter #", "Weather Observation", "Power Src", "Power",
        "Feedback", "Notes", "Status"
    ])
    
    for check_in in check_ins:
        detail_writer.writerow([
            check_in.get('time', ''),
            check_in.get('callsign', ''),
            check_in.get('name', ''),
            check_in.get('location', ''),
            check_in.get('skywarn_number', ''),
            check_in.get('weather_observation', ''),
            check_in.get('power_source', ''),
            check_in.get('power', ''),
            check_in.get('feedback', ''),
            check_in.get('notes', ''),
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

