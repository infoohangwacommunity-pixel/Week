# WAXPREP DISASTER RECOVERY PLAN

**Version:** 1.0  
**Last Updated:** September 2026  
**RPO:** 24 hours  
**RTO:** 4 hours

---

## EXECUTIVE SUMMARY

Step-by-step procedures for recovering WaxPrep from database failures or disasters. Must be tested before production use.

---

## BACKUP ARCHITECTURE

### Layer 1: Railway Automated Snapshots
- Provider: Railway's managed PostgreSQL backups
- Frequency: Daily (verify in Railway dashboard)
- Status: NEEDS VERIFICATION

### Layer 2: Off-Site Backups (Post-Deployment)
- Service: postgres-s3-backup or equivalent (Railway marketplace)
- Storage: Backblaze B2 or Cloudflare R2
- Encryption: AES-256-CBC
- Status: NOT YET DEPLOYED

---

## DISASTER SCENARIOS

### Scenario 1: Database Corruption

1. **Assess Damage**
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM students;"
   ```

2. **Stop Services**
   ```bash
   curl -X POST http://localhost:3000/shutdown
   pkill -f aiWorker
   ```

3. **Restore from Railway Snapshot**
   - Railway dashboard → PostgreSQL → Snapshots → Select → Restore
   - Wait for completion

4. **Verify and Restart**
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM students;"
   npm start
   npm run start:worker
   ```

### Scenario 2: Accidental Data Deletion

1. **Stop Services Immediately**
2. **Check Audit Log**
   ```bash
   psql $DATABASE_URL -c "SELECT * FROM audit_log WHERE event_type LIKE '%deletion%' ORDER BY created_at DESC LIMIT 10;"
   ```
3. **Restore from Off-Site Backup** (after deployment)
4. **Verify and Restart**

### Scenario 3: Complete Infrastructure Failure

1. **Check Railway status page**
2. **If outage: wait for recovery**
3. **If data loss: restore from off-site backup**
4. **If code corruption: git pull main**

---

## BACKUP VERIFICATION CHECKLIST

Before going live:

- [ ] Railway snapshot exists
- [ ] Off-site backup service deployed
- [ ] Backup encryption key stored securely
- [ ] Backup download tested
- [ ] Database restore tested
- [ ] Recovery time measured
- [ ] Emergency contacts updated

---

## EMERGENCY COMMANDS

```bash
# Stop services
curl -X POST http://localhost:3000/shutdown
pkill -f aiWorker

# Check database
psql $DATABASE_URL -c "SELECT 1"

# Restart
npm start
npm run start:worker
```

---

## CRITICAL REMINDERS

1. **TEST BEFORE YOU NEED IT** - Untested backups fail
2. **KEEP ENCRYPTION KEY SAFE** - Lost key = lost data
3. **MEASURE RECOVERY TIME** - Don't guess
4. **TRAIN YOUR TEAM** - Everyone needs to know this plan
