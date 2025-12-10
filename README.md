# ECTLogger
## A Modern Radio Net Logger for Emergency Communications Teams and SKYWARN Spotter Nets

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

ECTLogger is a production-ready, web-based net logging application designed specifically for Emergency Communications Teams, SKYWARN spotter nets, and amateur radio net control operations. Built with modern technology, it provides real-time check-in tracking, multi-frequency support, and comprehensive net management capabilities.

**🌐 Try it now at [app.ectlogger.us](https://app.ectlogger.us)** — No installation required!

<a href="assets/screenshots/Check-in%20Log.png">
  <img src="assets/screenshots/Check-in%20Log.png" alt="Check-in Log" width="100%">
</a>

*Multi-frequency/band check-ins, in dark and light mode!* — [📷 More screenshots](assets/screenshots/README.md)

---

## ✨ Features

### Core Capabilities
- **🔐 Secure Authentication** — Frictionless sign-in with magic link email authentication + OAuth (Google, Microsoft, GitHub)
- **⚡ Real-Time Updates** — WebSocket-powered live check-ins, status updates, and chat messages
- **👥 Role-Based Access** — Admin, NCS, Logger, User, and Guest roles
- **📧 Email Notifications** — Automatic net reminders, start notifications, and invitations
- **📱 Mobile Responsive** — Works seamlessly on phones, tablets, and desktops
- **📻 Multi-Frequency Support** — Track stations across multiple frequencies and modes
- **👥 Multi-NCS Support** - Multiple NCS operators can check in and track stations across multiple frequencies and modes simultaneously

### Net Management
- **🔄 Recheck Tracking** — Automatically track stations checking in multiple times
- **📊 Custom Fields** — Admins can create custom fields for specific net requirements
- **📅 Scheduling** — Schedule recurring nets with automatic NCS rotation
- **📝 Complete Net Logs** — Automatic log generation and email delivery
- **📊 Poll Questions** — Add poll questions to nets with real-time results chart
- **💬 Topic of the Week** — Prompt participants to share on a topic during check-in
- **✏️ Inline Editing** — NCS/Loggers can click any check-in row to edit fields directly
- **🔍 Filter & Sort** — Search and sort nets, schedules, frequencies, users, and fields
- **📋 Card/List Views** — Toggle between card and list views on Dashboard and Scheduler

### Location & Mapping
- **🗺️ Station Mapping** — View check-in locations on OpenStreetMap
- **🌐 Multiple Formats** — GPS, Maidenhead, UTM, MGRS coordinate support in Location check-in field
- **📍 Location Awareness** — Auto-fill Maidenhead grid square from browser location, if enabled by the end user

### Analytics & Reporting
- **📧 Emailed net closure reports** - Net participants can receive chat logs, check-in logs, topic answers, and poll results
- **📃 ICS-309 Communications Log** - For ARES and ECT nets, ICS-309 documents can be downloaded and emailed from closed nets
- **📈 Statistics & Analytics** — Track participation trends, operator activity, and net performance with interactive charts

---

## 👥 User Roles

ECTLogger has two types of roles: **global roles** (system-wide) and **net roles** (per-net assignments).

### Global Roles

| Role | Description |
|------|-------------|
| 🛡️ **Admin** | Full system access, user management, view all nets, configure custom fields |
| 👤 **User** | Create nets, check into nets, receive notifications |
| 👁️ **Guest** | View-only access to public nets (no account required) |

### Net Roles
When a user creates a net, they automatically become its **NCS (Net Control Station)**. The net creator can assign these roles to other users:

| Role | Description |
|------|-------------|
| 👑 **NCS** | Full control: start/close net, manage check-ins, assign roles |
| 📋 **Logger** | Log check-ins and manage station status |
| 📡 **Relay** | Check in stations on behalf of others |

Any registered user can run their own nets without needing admin privileges!

---

## 🎯 Key Capabilities

### Station Status Tracking
Visual indicators for station status:
- ✅ Checked In
- 👂 Just Listening
- 📻 Available
- ⏸️ Away
- 👋 Checked Out
- 🔄 Recheck (returning stations)

### Location Awareness
Streamline check-ins with automatic location detection:
- **Maidenhead Grid Square** — Users see their 6-character grid square in the navbar
- **Auto-Fill on Check-In** — Location field automatically populated with current grid square
- **NCS Auto-Fill** — Enter a callsign and auto-fill name, location, and SKYWARN number
- **Privacy Respecting** — Location only shared when explicitly enabled by each user

### Multi-Frequency Net Support
ECT and SKYWARN nets often move between frequencies to meet participants where they are. ECTLogger tracks:
- Multiple frequencies per net
- Active frequency indication
- Per-station frequency tracking
- Real-time frequency change notifications

---

## 📋 Net Workflow

### 1. Create Net
Define your net with name, description, frequencies, and required fields. Assign roles and save as draft.

### 2. Schedule (Optional)
Set date/time, configure recurring schedule, and set up NCS rotation with automatic reminders.

### 3. Start Net
NCS starts manually or net auto-starts if scheduled. Email notifications sent to subscribers.

### 4. Log Check-ins
NCS or logger enters check-ins with real-time updates to all connected clients.

### 5. Close Net
Complete log generated automatically and emailed to NCS. Net archived for reports.

---

## 📚 Documentation

### Getting Started

| Document | Description |
|----------|-------------|
| **[User Guide](docs/USER-GUIDE.md)** | How to use ECTLogger as a participant or NCS |

### Self-Hosting

ECTLogger can be self-hosted on your own server. See the self-hosting documentation:

| Document | Description |
|----------|-------------|
| **[Self-Hosting Guide](docs/SELF-HOSTING.md)** | Overview of self-hosting options and requirements |
| **[Quick Start](docs/QUICKSTART.md)** | Get up and running in 5 minutes |
| **[Manual Installation](docs/MANUAL-INSTALLATION.md)** | Step-by-step installation for advanced users |
| **[Production Deployment](docs/PRODUCTION-DEPLOYMENT.md)** | Deploy with SSL/HTTPS and reverse proxy |

### Configuration

| Document | Description |
|----------|-------------|
| **[Magic Link Configuration](docs/MAGIC-LINK-CONFIGURATION.md)** | Configure magic link expiration |
| **[Email Deliverability](docs/EMAIL-DELIVERABILITY.md)** | Email setup and troubleshooting |
| **[Logging](docs/LOGGING.md)** | Configure log levels and debug output |

### Security

| Document | Description |
|----------|-------------|
| **[Security](docs/SECURITY.md)** | Security features and best practices |
| **[Fail2Ban](docs/FAIL2BAN.md)** | Automatic IP banning setup |

### Development

| Document | Description |
|----------|-------------|
| **[Development Guide](docs/DEVELOPMENT.md)** | Architecture, API, and contributing |

---

## 🔒 Security

ECTLogger implements comprehensive security measures:

- **Input Validation** — Strict length limits and format checking
- **XSS Protection** — HTML sanitization and security headers
- **SQL Injection Prevention** — Parameterized queries via SQLAlchemy ORM
- **Rate Limiting** — 200 requests/minute per IP
- **Authenticated WebSockets** — JWT token required for real-time connections
- **OWASP Top 10** — Protected against critical web security risks

See **[Security Documentation](docs/SECURITY.md)** for complete details.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

You can: ✅ Use commercially · ✅ Modify · ✅ Distribute · ✅ Use privately

With the requirement to include copyright notice and attribution.

---

## 🙏 Acknowledgments

Built for the amateur radio and emergency communications community.

Special thanks to all NCS operators, loggers, and participants who make emergency communication nets possible.

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/bradbrownjr/ectlogger/issues)
- **Documentation**: See links above
- **Questions**: Open a discussion on GitHub

---

**73 and stay safe!** 📻
