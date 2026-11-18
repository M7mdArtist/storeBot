# Discord Store Bot (JavaScript + Local MySQL)

A complete bilingual (**Arabic & English**) Discord Store Bot built with **Discord.js v14** and **local MySQL (`mysql2/promise`)**.

## Core Features
- **Custom Dropdown Ticket System**: Add categories dynamically with `/ticket-category add` (`name`, `open_category`, `close_category`, `description`, `emoji`, optional `staff_role`). Closed tickets automatically move into the configured `close_category`, lock user permissions, and generate `.txt` transcripts.
- **ProBot Tax Calculator**: Exact 5% credit transfer calculation (`/tax`, `+tax`, `+ضريبة`, shorthand `100k`/`2.5m`, middleman 2-step total, and optional auto-tax channel mode).
- **Decoration Line Command**: Post custom server divider images (`/line [preset]`, `+line`, `+خط`) with default + named presets saved in MySQL.
- **Real-Time Admin Logging**: Every admin & ticket action is recorded in MySQL `admin_logs` and dispatched live as localized embeds to your configured log channel (`/log-channel set`).
- **Bilingual Locale System**: Switch anytime per server between Arabic (`ar`) and English (`en`) via `/language` or `+lang`.

## Quick Start (Local Machine)

1. **Ensure Local MySQL is Running** (MySQL 8.0+ or MariaDB). The bot automatically creates the database and all 5 tables on first boot, or you can import `schema.sql` manually.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment**:
   Copy `.env.example` to `.env` and fill in your `DISCORD_TOKEN`, `CLIENT_ID`, and local `MYSQL_*` credentials.
4. **Enable Discord Bot Intents**:
   In the Discord Developer Portal -> Bot -> enable **Server Members Intent** and **Message Content Intent** (required for prefix commands and auto-tax channels).
5. **Start the Bot**:
   ```bash
   npm start
   ```
