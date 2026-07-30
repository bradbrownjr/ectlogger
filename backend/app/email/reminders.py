from app.logger import logger

from jinja2 import Template

from app.config import settings
from app.email.base import get_unsubscribe_footer, send_email

async def send_ncs_reminder(
    to_email: str, 
    operator_name: str,
    operator_callsign: str,
    net_name: str, 
    net_date: str,
    net_time: str,
    frequencies: list,
    hours_until: int,
    scheduler_url: str,
    net_url: str = None,
    unsubscribe_token: str = None
):
    """Send NCS duty reminder email"""
    logger.info("EMAIL", f"Sending NCS reminder to {to_email} for {net_name} on {net_date}")
    
    # Format frequencies for display
    freq_list = ""
    for freq in frequencies:
        if freq.get('frequency'):
            freq_list += f"<li>{freq['frequency']} MHz - {freq.get('mode', 'N/A')}</li>"
        elif freq.get('talkgroup_name'):
            freq_list += f"<li>{freq['talkgroup_name']} (TG: {freq.get('talkgroup_id', 'N/A')})</li>"
    
    if not freq_list:
        freq_list = "<li>No frequencies configured</li>"
    
    # Different messaging based on reminder timing
    if hours_until <= 1:
        urgency = "starting soon"
        urgency_style = "background-color: #ffebee; border-left: 4px solid #f44336;"
    else:
        urgency = f"in {hours_until} hours"
        urgency_style = "background-color: #fff3e0; border-left: 4px solid #ff9800;"
    
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { {{ urgency_style }} padding: 15px; margin: 20px 0; border-radius: 4px; }
            .details { background-color: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .button { 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #1976d2; 
                color: #ffffff !important; 
                text-decoration: none; 
                border-radius: 4px; 
                margin: 20px 0;
                font-weight: bold;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            ul { margin: 10px 0; padding-left: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="28" height="28" style="vertical-align:middle;margin-right:6px"><circle cx="100" cy="100" r="92" fill="white" stroke="#1a6b2e" stroke-width="9"/><circle cx="100" cy="100" r="68" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><circle cx="100" cy="100" r="47" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><circle cx="100" cy="100" r="26" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><line x1="100" y1="165" x2="100" y2="38" stroke="#90a4ae" stroke-width="4.5" stroke-linecap="round"/><line x1="88" y1="58" x2="112" y2="58" stroke="#90a4ae" stroke-width="3" stroke-linecap="round"/><line x1="84" y1="74" x2="116" y2="74" stroke="#78909c" stroke-width="2.5" stroke-linecap="round"/><circle cx="100" cy="38" r="5.5" fill="#4caf50"/><circle cx="152" cy="72" r="5.5" fill="#4caf50"/><circle cx="56" cy="62" r="5.5" fill="#4caf50"/><circle cx="48" cy="138" r="5.5" fill="#4caf50"/><path d="M 52 112 L 84 148 L 162 58" fill="none" stroke="#2e7d32" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><path d="M 52 112 L 84 148 L 162 58" fill="none" stroke="#43a047" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg> NCS Duty Reminder</h2>
            
            <div class="alert">
                <strong>You are scheduled as Net Control Station {{ urgency }}!</strong>
            </div>
            
            <p>Hello {{ operator_name }} ({{ operator_callsign }}),</p>
            
            <p>This is a reminder that you are scheduled to serve as <strong>Net Control Station (NCS)</strong> 
            for the upcoming net session.</p>
            
            <div class="details">
                <h3>Net Details</h3>
                <p><strong>Net:</strong> {{ net_name }}</p>
                <p><strong>Date:</strong> {{ net_date }}</p>
                <p><strong>Time:</strong> {{ net_time }}</p>
                <p><strong>Frequencies:</strong></p>
                <ul>
                    {{ freq_list }}
                </ul>
            </div>
            
            <p>Please ensure you are ready to run the net at the scheduled time. 
            If you are unable to fulfill your NCS duty, please arrange a swap with another operator as soon as possible.</p>
            
            {% if net_url %}
            <p><strong>Your net is ready and waiting:</strong></p>
            <a href="{{ net_url }}" class="button" style="color: #ffffff;">Open Net &rarr;</a>
            <p style="margin-top: 10px; font-size: 13px; color: #555;">
                <a href="{{ scheduler_url }}">View Schedule</a>
            </p>
            {% else %}
            <a href="{{ scheduler_url }}" class="button" style="color: #ffffff;">View Schedule</a>
            {% endif %}
            
            <div class="footer">
                <p>This is an automated reminder from {{ app_name }}.</p>
                <p>If you need to swap your NCS duty, please use the scheduler to arrange a swap.</p>
            </div>
            
            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)
    
    html_content = html_template.render(
        operator_name=operator_name,
        operator_callsign=operator_callsign,
        net_name=net_name,
        net_date=net_date,
        net_time=net_time,
        freq_list=freq_list,
        urgency=urgency,
        urgency_style=urgency_style,
        scheduler_url=scheduler_url,
        net_url=net_url,
        app_name=settings.app_name,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token)
    )
    
    await send_email(
        to_email=to_email,
        subject=f"📻 NCS Reminder: {net_name} - {net_date}",
        html_content=html_content,
        unsubscribe_token=unsubscribe_token
    )

async def send_subscriber_reminder(
    to_email: str,
    recipient_name: str,
    recipient_callsign: str,
    net_name: str,
    net_date: str,
    net_time: str,
    frequencies: list,
    net_url: str,
    unsubscribe_token: str = None
):
    """Send net reminder to subscriber 1 hour before net starts"""
    logger.info("EMAIL", f"Sending subscriber reminder to {to_email} for {net_name}")
    
    # Format frequencies for display
    freq_list = ""
    for freq in frequencies:
        if freq.get('frequency'):
            freq_list += f"<li>{freq['frequency']} MHz - {freq.get('mode', 'N/A')}</li>"
        elif freq.get('talkgroup_name'):
            freq_list += f"<li>{freq['talkgroup_name']} (TG: {freq.get('talkgroup_id', 'N/A')})</li>"
    
    if not freq_list:
        freq_list = "<li>No frequencies configured</li>"
    
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { background-color: #e3f2fd; border-left: 4px solid #1976d2; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .details { background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .button { 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #1976d2; 
                color: #ffffff !important; 
                text-decoration: none; 
                border-radius: 4px; 
                margin: 20px 0;
                font-weight: bold;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            ul { margin: 10px 0; padding-left: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="28" height="28" style="vertical-align:middle;margin-right:6px"><circle cx="100" cy="100" r="92" fill="white" stroke="#1a6b2e" stroke-width="9"/><circle cx="100" cy="100" r="68" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><circle cx="100" cy="100" r="47" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><circle cx="100" cy="100" r="26" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><line x1="100" y1="165" x2="100" y2="38" stroke="#90a4ae" stroke-width="4.5" stroke-linecap="round"/><line x1="88" y1="58" x2="112" y2="58" stroke="#90a4ae" stroke-width="3" stroke-linecap="round"/><line x1="84" y1="74" x2="116" y2="74" stroke="#78909c" stroke-width="2.5" stroke-linecap="round"/><circle cx="100" cy="38" r="5.5" fill="#4caf50"/><circle cx="152" cy="72" r="5.5" fill="#4caf50"/><circle cx="56" cy="62" r="5.5" fill="#4caf50"/><circle cx="48" cy="138" r="5.5" fill="#4caf50"/><path d="M 52 112 L 84 148 L 162 58" fill="none" stroke="#2e7d32" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><path d="M 52 112 L 84 148 L 162 58" fill="none" stroke="#43a047" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg> Net Starting Soon!</h2>
            
            <div class="alert">
                <strong>A net you're subscribed to starts in about 1 hour.</strong>
            </div>
            
            <p>Hello {{ recipient_name }} ({{ recipient_callsign }}),</p>
            
            <p>This is a reminder that a net you've subscribed to is starting soon.</p>
            
            <div class="details">
                <h3>Net Details</h3>
                <p><strong>Net:</strong> {{ net_name }}</p>
                <p><strong>Date:</strong> {{ net_date }}</p>
                <p><strong>Time:</strong> {{ net_time }}</p>
                <p><strong>Frequencies:</strong></p>
                <ul>
                    {{ freq_list }}
                </ul>
            </div>
            
            <p>Once the net goes active, you can join and check in using the link below.</p>
            
            <a href="{{ net_url }}" class="button" style="color: #ffffff;">View Net</a>
            
            <div class="footer">
                <p>This is an automated reminder from {{ app_name }}.</p>
                <p>You can disable these reminders in your profile settings.</p>
            </div>
            
            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)
    
    html_content = html_template.render(
        recipient_name=recipient_name,
        recipient_callsign=recipient_callsign,
        net_name=net_name,
        net_date=net_date,
        net_time=net_time,
        freq_list=freq_list,
        net_url=net_url,
        app_name=settings.app_name,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token)
    )
    
    await send_email(
        to_email=to_email,
        subject=f"📻 Reminder: {net_name} starting soon - {net_time}",
        html_content=html_content,
        unsubscribe_token=unsubscribe_token
    )

async def send_staff_reminder(
    to_email: str,
    recipient_name: str,
    recipient_callsign: str,
    net_name: str,
    net_date: str,
    net_time: str,
    frequencies: list,
    net_url: str,
    lobby_url: str,
    unsubscribe_token: str = None,
    ncs_name: str = None,
    ncs_callsign: str = None,
    net_is_open: bool = False
):
    """Send net-start reminder to template staff 1 hour before the net

    net_is_open: True once the net's lobby has opened or the net has gone active.
    Gates the "Check Into Net" button, since there's nothing to check into while
    the net is still draft/scheduled.
    """
    logger.info("EMAIL", f"Sending staff reminder to {to_email} for {net_name}")

    freq_list = ""
    for freq in frequencies:
        if freq.get('frequency'):
            freq_list += f"<li>{freq['frequency']} MHz - {freq.get('mode', 'N/A')}</li>"
        elif freq.get('talkgroup_name'):
            freq_list += f"<li>{freq['talkgroup_name']} (TG: {freq.get('talkgroup_id', 'N/A')})</li>"
    if not freq_list:
        freq_list = "<li>No frequencies configured</li>"

    # Same check_in=1 query-param convention as open_lobby=1 below: NetView picks
    # this up and triggers the check-in dialog once the net has loaded.
    check_in_url = f"{net_url}?check_in=1"

    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { background-color: #fff8e1; border-left: 4px solid #f9a825; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .details { background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .buttons { margin: 20px 0; }
            .button {
                display: inline-block;
                padding: 12px 24px;
                background-color: #1976d2;
                color: #ffffff !important;
                text-decoration: none;
                border-radius: 4px;
                font-weight: bold;
                margin-right: 12px;
            }
            .button-green {
                background-color: #2e7d32;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            ul { margin: 10px 0; padding-left: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>&#128251; Net Control Reminder</h2>

            <div class="alert">
                <strong>You are listed as one of the net control stations for this net. Remember, it begins in one hour!</strong>
            </div>

            <p>Hello {{ recipient_name }} ({{ recipient_callsign }}),</p>

            <p>This is your one-hour heads-up that <strong>{{ net_name }}</strong> is coming up. If no one else has opened the lobby yet, please do so when you're ready.</p>

            <div class="details">
                <h3>Net Details</h3>
                <p><strong>Net:</strong> {{ net_name }}</p>
                <p><strong>Date:</strong> {{ net_date }}</p>
                <p><strong>Time:</strong> {{ net_time }}</p>
                <p><strong>Frequencies:</strong></p>
                <ul>
                    {{ freq_list }}
                </ul>
                {% if ncs_name %}<p><strong>NCS on duty:</strong> {{ ncs_name }}{% if ncs_callsign %} ({{ ncs_callsign }}){% endif %}</p>{% endif %}
            </div>

            <div class="buttons">
                <a href="{{ net_url }}" class="button" style="color: #ffffff;">View Net</a>
                {% if net_is_open %}<a href="{{ check_in_url }}" class="button" style="color: #ffffff;">Check Into Net</a>{% endif %}
                <a href="{{ lobby_url }}" class="button button-green" style="color: #ffffff;">Open Lobby</a>
            </div>

            <p style="font-size: 13px; color: #555;">
                {% if net_is_open %}Use <em>View Net</em> to look before you log in, <em>Check Into Net</em> to log your station in directly, or <em>Open Lobby</em> if the lobby isn't open yet.{% else %}Use <em>View Net</em> to look at the net page, or <em>Open Lobby</em> to load the net and open the lobby immediately. Check-in isn't available until the lobby is open.{% endif %}
            </p>

            <div class="footer">
                <p>This is an automated reminder from {{ app_name }}.</p>
                <p>You can disable these reminders in your profile settings.</p>
            </div>

            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)

    html_content = html_template.render(
        recipient_name=recipient_name,
        recipient_callsign=recipient_callsign,
        net_name=net_name,
        net_date=net_date,
        net_time=net_time,
        freq_list=freq_list,
        net_url=net_url,
        lobby_url=lobby_url,
        check_in_url=check_in_url,
        net_is_open=net_is_open,
        ncs_name=ncs_name,
        ncs_callsign=ncs_callsign,
        app_name=settings.app_name,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token)
    )

    await send_email(
        to_email=to_email,
        subject=f"📻 NCS Reminder: {net_name} starts in 1 hour — {net_time}",
        html_content=html_content,
        unsubscribe_token=unsubscribe_token
    )

