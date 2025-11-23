# Digital Mode Support Migration

This migration adds support for digital modes (DMR, YSF, D-STAR, P25) that use networks and talkgroups instead of traditional frequencies.

## What Changed

### Database Schema
- Added `network` column to `frequencies` table (VARCHAR(100), nullable)
- Added `talkgroup` column to `frequencies` table (VARCHAR(50), nullable)
- Made `frequency` column nullable (since digital modes may not have a traditional frequency)

### Frontend
- Updated frequency input to show different fields based on mode:
  - **Analog modes** (FM, SSB): Traditional frequency input (e.g., "146.520 MHz")
  - **Digital modes** (DMR, YSF, D-STAR, P25): Network + Talkgroup inputs
- Updated frequency display to show network/talkgroup for digital modes

### API
- Updated `FrequencyBase` schema to include `network` and `talkgroup` fields
- Added validation to ensure either `frequency` OR `network` is provided
- Added YSF to the allowed mode list

## Running the Migration

### On Your Server

```bash
cd ~/ectlogger/backend
source venv/bin/activate
python migrations/002_add_digital_mode_support.py
```

### Expected Output

```
Migrating database: ./ectlogger.db
Adding 'network' column to frequencies table...
✓ Added 'network' column
Adding 'talkgroup' column to frequencies table...
✓ Added 'talkgroup' column

✓ Migration completed successfully!
```

## Usage Examples

### Adding a Traditional Frequency
- **Mode**: FM
- **Frequency**: 146.520 MHz
- **Network**: (leave blank)
- **Talkgroup**: (leave blank)

### Adding YSF (System Fusion)
- **Mode**: YSF
- **Frequency**: (leave blank)
- **Network**: Wires-X
- **Talkgroup**: Room 12345

### Adding DMR
- **Mode**: DMR
- **Frequency**: (leave blank)
- **Network**: Brandmeister
- **Talkgroup**: 31665

### Adding D-STAR
- **Mode**: D-STAR
- **Frequency**: (leave blank)
- **Network**: REF030C
- **Talkgroup**: (optional)

## Testing

After running the migration:

1. **Restart the backend** to load the new schema
2. **Create a new net** or edit an existing one
3. **Try adding a YSF frequency**:
   - Select YSF mode
   - Enter a network name (e.g., "Wires-X", "FCS", "YCS")
   - Optionally enter a room number
4. **Verify it displays correctly** in the net view

## Rollback

SQLite doesn't support DROP COLUMN easily. To rollback:

1. Stop the application
2. Restore from your backup before migration
3. Or manually recreate the table without the new columns

## Notes

- Existing frequencies are unaffected (network and talkgroup will be NULL)
- The UI automatically shows the correct input fields based on mode selection
- Digital mode entries will display as "Network TGTalkgroup Mode" (e.g., "Wires-X TG12345 YSF")
- Analog mode entries still display as "Frequency Mode" (e.g., "146.520 MHz FM")
