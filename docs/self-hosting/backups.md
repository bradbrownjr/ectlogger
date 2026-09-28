---
title: Backups for server operators
summary: What a backup contains, how the schedule runs, restoring one, moving an instance to a new server, and a safe SFTP drop point for off-site copies.
kind: How-to
audience: Server operators
owner: KC1JMH
revised: 2026-09-28
review_by: 2027-09-28
applies_to: ECTLogger, self-hosted
permalink: /docs/self-hosting/backups/
---

# Backups for server operators

ECTLogger backs itself up. Admins set the passphrase, schedule, and off-site targets in the admin panel ([Backups](/docs/admins/backups/)). This page is the server side: where the files go, what runs the schedule, and how to get an instance back from a backup, which only happens at a shell.

## What a backup is

Each backup is one file, `ectlogger-YYYYMMDD-HHMMSS.tar.gz.age`, in `backend/backups/`. Inside, once decrypted, is a gzipped tar holding:

| Path in the backup | What it is |
|---|---|
| `manifest.json` | When it was made, the git commit and latest migration number of the code that made it, and a SHA-256 checksum for every file |
| `database/ectlogger.db` | A consistent snapshot of the SQLite database, taken with SQLite's own backup call while the service runs (PostgreSQL: `database/database.sql` from `pg_dump`) |
| `data/` | Uploaded files: profile photos, chat images, the instance logo, net and schedule logos |
| `config/backend.env`, `config/frontend.env` | The two `.env` files, including `SECRET_KEY` |

`SECRET_KEY` matters more than it looks. Every admin's two-factor secret is encrypted with a key derived from it, so a database restored next to a different `SECRET_KEY` locks every admin out of two-factor sign-in.

The file is encrypted with [age](https://age-encryption.org/) to a public key. The matching private key is stored only inside `ectlogger-backup-key-<id>.age`, which is locked with the admin's passphrase and kept beside the backups. The server never stores the passphrase, so a scheduled backup needs no passphrase, and someone who takes over the server cannot open the backups already sent off-site.

## What runs the schedule

The admin panel owns the schedule. Something outside it has to check, every few minutes, whether a backup is due. `BACKUP_SCHEDULER` in `backend/.env` says what:

| Value | What checks |
|---|---|
| `cron` (default) | A cron entry for the service account runs `backup.py run-if-due` every 15 minutes. Backups keep running while the web service is down. |
| `internal` | The web service checks every 15 minutes. For containers with no cron. |
| `off` | Nothing. For installs already backed up by snapshotting the whole server, volume, or container. Only **Back up now** makes a backup. |

`install.sh` asks whether to set up backups, and if you say yes it sets the passphrase, turns on a daily 03:00 backup in the server's time zone, and adds the cron entry. On an existing install, add the entry yourself as the account the service runs as:

```bash
backend/venv/bin/python backend/scripts/backup.py install-cron
```

Whatever the scheduler, the web service itself emails every admin once when no backup has succeeded for one and a half schedule periods. A broken or missing cron entry therefore still gets noticed.

`BACKUP_DIR` in `backend/.env` moves the backup folder, for example onto a second disk. It is deliberately not settable from the admin panel.

## The command line

Every command runs from anywhere, as the service account:

```bash
backend/venv/bin/python backend/scripts/backup.py <command>
```

| Command | What it does |
|---|---|
| `status` | Settings, the backup folder, when the scheduler last checked in, and the last ten backups |
| `run` | Makes a backup now, same as **Back up now** |
| `run-if-due` | Makes one only if the schedule says so (what cron runs) |
| `set-passphrase` | Creates the key, or changes its passphrase; `--replace` makes a new key |
| `enable`, `disable` | Turns the schedule on or off; `enable --daily 03:00 --timezone America/New_York` or `enable --every-hours 6` |
| `verify FILE` | Decrypts a backup and checks every file against its checksum |
| `restore FILE` | Puts a backup back in place (below) |
| `install-cron`, `remove-cron` | Adds or removes the scheduler entry in this account's crontab |

A passphrase is read from the terminal, or from standard input when there is no terminal.

## Restore a backup

This replaces the database, the uploaded files, and (optionally) the configuration.

1. Stop the service: `sudo systemctl stop ectlogger`.
2. Put the backup file where the server can read it. The key file is found automatically when it sits in the same folder; otherwise add `--key path/to/ectlogger-backup-key-<id>.age`.
3. Run the restore and enter the passphrase:

   ```bash
   backend/venv/bin/python backend/scripts/backup.py restore ectlogger-20260928-030000.tar.gz.age
   ```

4. Read what it prints. It lists everything it put in place. The files it replaced are kept beside the new ones with a `.pre-restore-<time>` suffix, so a restore can be undone by moving them back.
5. If it says the backup predates a migration, run the listed scripts from `backend/migrations/` in order.
6. Start the service: `sudo systemctl start ectlogger`.

The restore checks every file against the manifest first and changes nothing if any check fails. It refuses to run while the service's port answers, and refuses a backup made by newer code than the checkout it is running from (check out the commit it names first).

Existing `.env` files are not overwritten. The backup's copy is written beside yours as `backend/.env.from-backup` to compare. Pass `--with-env` to replace them instead.

## Move an instance to a new server

1. On the old server, make a fresh backup: **Back up now**, or `backup.py run`.
2. On the new server, clone the repository and run `./install.sh`. Answer **no** when it offers to configure the application; the backup brings the configuration with it.
3. Copy the backup and its key file across, then run `backup.py restore` as above. With no `.env` on the new server yet, the backup's copies are put in place.
4. If the address is changing, run `./migrate.sh --host new.example.org` to update the URLs in both `.env` files.
5. Build the frontend (`cd frontend && npm run build`), install the service with `./install-service.sh`, and start it.
6. Sign in as an admin and open **Backups**. The passphrase, schedule, and off-site targets came across with the database. Run `backup.py install-cron` to put the scheduler back.

SFTP targets keep the host key they trusted, and the upload key they were given still works, because both are in the database.

## Open a backup without ECTLogger

If all you have is a backup file, its key file, and the passphrase, the stock `age` tool opens it on any machine:

```bash
age -d -i ectlogger-backup-key-<id>.age ectlogger-20260928-030000.tar.gz.age | tar xz
```

`age` asks for the passphrase to unlock the key file, then decrypts the backup. The database is in `database/ectlogger.db` and opens with any SQLite tool.

## A safe SFTP drop point

An off-site target that the application server can log into is also one an intruder on that server can log into. Set it up so that is worth nothing to them:

- **A dedicated account that can only use SFTP**, locked into one folder. It needs no shell, and no other folder on that machine should be visible to it. A small SFTP-only container does this well, for example `atmoz/sftp` with only the upload folder mounted:

  ```yaml
  services:
    ectlogger-sftp:
      image: atmoz/sftp
      command: ectlogger::1001
      ports:
        - "2222:22"
      volumes:
        - ./ectlogger.pub:/home/ectlogger/.ssh/keys/ectlogger.pub:ro
        - ./ssh_host_ed25519_key:/etc/ssh/ssh_host_ed25519_key:ro
        - /srv/backups/ectlogger/inbox:/home/ectlogger/upload
      restart: unless-stopped
  ```

  `ectlogger.pub` is the public key the admin panel shows for the target, and the upload folder must be writable by the account's user id (`sudo chown 1001 /srv/backups/ectlogger/inbox`). Generate the host key once with `ssh-keygen -t ed25519 -N "" -f ssh_host_ed25519_key` and keep it: a container that invents a new one each time it is recreated looks exactly like the server being impersonated, and backups stop until an admin trusts the new key. The target's folder is then `upload`.
- **A firewall rule** that lets only the application server reach that port, and nothing else on the network.
- **Move uploads out of reach.** Run a job on the storage machine that moves finished uploads out of the upload folder into one the SFTP account cannot see, and prunes there instead:

  ```bash
  #!/bin/sh
  # Every hour: take finished uploads out of the SFTP account's reach.
  inbox=/srv/backups/ectlogger/inbox
  archive=/srv/backups/ectlogger/archive
  mkdir -p "$archive"
  for f in "$inbox"/*.age; do
      [ -f "$f" ] || continue
      dest="$archive/$(basename "$f")"
      if [ ! -e "$dest" ]; then
          mv "$f" "$dest"
      elif cmp -s "$f" "$dest"; then
          rm -f "$f"    # the same key file, uploaded again
      else
          echo "Left in inbox, differs from the archived copy: $f"
      fi
  done
  # Keep six months of backups; key files are never deleted.
  find "$archive" -name 'ectlogger-2*.tar.gz.age' -mtime +180 -delete
  ```

  In-progress uploads end in `.partial` and are left alone. The script never overwrites a file already in the archive: an intruder on the application server could otherwise upload a file with the same name as an old backup and replace it. Leave **Delete old backups here** off for this target: the app can only see the upload folder, and the archive is what holds the history.

With all three, the most an intruder on the application server can do to the drop point is upload files into an empty folder. They cannot read, change, or delete the backups already made, and every one of those is encrypted anyway.

## Limits

- **PostgreSQL** needs `pg_dump` installed on the application server. The restore writes the dump as `backend/database-<time>.sql` and prints the `psql` command to load it; load it into an empty database.
- **MySQL** is not supported by the built-in backups. Back it up with its own tools and set `BACKUP_SCHEDULER=off`.
- While a backup is being made, the backup folder briefly holds an uncompressed copy of the database and uploaded files as well as the backup itself, so leave room for both.

## Next

[Backups](/docs/admins/backups/) covers the admin panel side. [Production deployment](/docs/PRODUCTION-DEPLOYMENT/) has the rest of the operational checklist.
